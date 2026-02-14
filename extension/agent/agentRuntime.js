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

  constructor(options) {
    this.#store = options.sessionStore
    this.#toolRunner = options.toolRunner
    this.#tools = options.tools
    this.#provider = options.provider
    this.#model = options.model
    this.#apiKey = options.apiKey
    this.#systemPrompt = options.systemPrompt
    this.#maxSteps = typeof options.maxSteps === 'number' && options.maxSteps > 0 ? options.maxSteps : 20
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
      const providerInput = rebuildResponsesInput(events)

      const prompt = typeof this.#systemPrompt === 'string' && this.#systemPrompt.trim() ? this.#systemPrompt : null
      const providerInput2 = prompt ? [{ role: 'system', content: prompt }, ...providerInput] : providerInput

      const toolSchemas = toolSchemasForOpenAIResponses(this.#tools)
      const out = await this.#provider.complete({
        model: this.#model,
        input: providerInput2,
        tools: toolSchemas,
        apiKey: this.#apiKey,
        store: false,
      })

      if (out.toolCalls?.length) {
        for (const tc of out.toolCalls) {
          yield* this.#toolRunner.run(sessionId, tc)
        }
        continue
      }

      if (out.assistantText == null) break

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

