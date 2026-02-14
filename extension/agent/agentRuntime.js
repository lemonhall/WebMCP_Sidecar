import { rebuildResponsesInput } from './rebuild.js'
import { toolSchemasForOpenAIResponses } from './toolSchemas.js'

function now() {
  return Date.now()
}

export class AgentRuntime {
  #store
  #toolRunner
  #tools
  #provider
  #model
  #apiKey
  #systemPrompt
  #maxSteps
  #noticeEnforcementBudget

  constructor(options) {
    this.#store = options.sessionStore
    this.#toolRunner = options.toolRunner
    this.#tools = options.tools
    this.#provider = options.provider
    this.#model = options.model
    this.#apiKey = options.apiKey
    this.#systemPrompt = options.systemPrompt
    this.#maxSteps = typeof options.maxSteps === 'number' && options.maxSteps > 0 ? options.maxSteps : 20
    this.#noticeEnforcementBudget = 2
  }

  async #callStreamed(sessionId, req) {
    const toolCalls = []
    const parts = []
    let usage = undefined
    const deltaEvents = []

    const iter = this.#provider.stream(req)
    for await (const ev of iter) {
      if (!ev || typeof ev !== 'object') continue
      if (ev.type === 'text_delta') {
        parts.push(ev.delta)
        const de = { type: 'assistant.delta', textDelta: ev.delta, ts: now() }
        await this.#store.appendEvent(sessionId, de)
        deltaEvents.push(de)
      } else if (ev.type === 'tool_call') {
        toolCalls.push(ev.toolCall)
      } else if (ev.type === 'done') {
        usage = ev.usage
      }
    }

    return { out: { assistantText: parts.length ? parts.join('') : null, toolCalls, usage }, deltaEvents }
  }

  async *runTurn(input) {
    const text = input.userText
    if (typeof text !== 'string') throw new Error('AgentRuntime.runTurn: userText must be string')

    const sessionId = input.sessionId ?? (await this.#store.createSession())

    const existing = await this.#store.readEvents(sessionId)
    if (!existing.some((e) => e.type === 'system.init')) {
      const init = { type: 'system.init', sessionId, ts: now() }
      await this.#store.appendEvent(sessionId, init)
      yield init
    }

    const user = { type: 'user.message', text, ts: now() }
    await this.#store.appendEvent(sessionId, user)
    yield user

    let steps = 0
    while (steps < this.#maxSteps) {
      steps += 1

      const events = await this.#store.readEvents(sessionId)
      const lastNoticeTs = Math.max(
        -1,
        ...events.filter((e) => e?.type === 'system.notice' && typeof e.ts === 'number').map((e) => e.ts)
      )
      const lastAssistantTs = Math.max(
        -1,
        ...events.filter((e) => e?.type === 'assistant.message' && typeof e.ts === 'number').map((e) => e.ts)
      )
      const noticePending = lastNoticeTs > lastAssistantTs

      const providerInput = rebuildResponsesInput(events)

      const prompt = typeof this.#systemPrompt === 'string' && this.#systemPrompt.trim() ? this.#systemPrompt : null
      const toolNames = typeof this.#tools?.names === 'function' ? this.#tools.names() : []
      const toolHint = `Available tool names (refreshed): ${Array.isArray(toolNames) && toolNames.length ? toolNames.join(', ') : '(none)'}`
      const providerInput2 = [
        ...(prompt ? [{ role: 'system', content: prompt }] : []),
        { role: 'system', content: toolHint },
        ...providerInput,
      ]

      const toolSchemas = toolSchemasForOpenAIResponses(this.#tools)
      const streamed =
        typeof this.#provider.stream === 'function'
          ? await this.#callStreamed(sessionId, { model: this.#model, input: providerInput2, tools: toolSchemas, apiKey: this.#apiKey, store: false })
          : null

      const out =
        streamed?.out ??
        (await this.#provider.complete({
          model: this.#model,
          input: providerInput2,
          tools: toolSchemas,
          apiKey: this.#apiKey,
          store: false,
        }))

      if (streamed) {
        for (const de of streamed.deltaEvents) yield de
      }

      if (out.toolCalls?.length) {
        for (const tc of out.toolCalls) {
          yield* this.#toolRunner.run(sessionId, tc)
        }
        continue
      }

      if (out.assistantText == null) break

      // If we detected navigation/tool reload, require at least one more tool attempt before final answer.
      if (noticePending && this.#noticeEnforcementBudget > 0) {
        this.#noticeEnforcementBudget -= 1
        const n = {
          type: 'system.notice',
          text: 'Notice: tools were reloaded due to navigation. Before answering, you MUST attempt at least one relevant tool call on the new page. If no relevant tool exists, explicitly list available tool names and state why you cannot proceed.',
          ts: now(),
        }
        await this.#store.appendEvent(sessionId, n)
        yield n
        continue
      }

      const msg = { type: 'assistant.message', text: out.assistantText, ts: now() }
      await this.#store.appendEvent(sessionId, msg)
      yield msg

      const final = { type: 'result', finalText: out.assistantText, stopReason: 'end', usage: out.usage, ts: now() }
      await this.#store.appendEvent(sessionId, final)
      yield final
      return
    }

    const final = { type: 'result', finalText: '', stopReason: 'max_steps', ts: now() }
    await this.#store.appendEvent(sessionId, final)
    yield final
  }
}
