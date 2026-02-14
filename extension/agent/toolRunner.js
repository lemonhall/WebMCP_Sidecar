function now() {
  return Date.now()
}

export class ToolRunner {
  #tools
  #store

  constructor(options) {
    this.#tools = options.tools
    this.#store = options.sessionStore
  }

  #pickFlightsListToolName() {
    if (this.#tools.getOptional('listFlights')) return 'listFlights'
    const names = this.#tools.names()
    const candidate = names.find((n) => typeof n === 'string' && /list.*flight/i.test(n))
    return candidate ?? null
  }

  async *run(sessionId, toolCall) {
    const useEvent = { type: 'tool.use', toolUseId: toolCall.toolUseId, name: toolCall.name, input: toolCall.input, ts: now() }
    await this.#store.appendEvent(sessionId, useEvent)
    yield useEvent

    const tool = this.#tools.get(toolCall.name)
    try {
      const output = await tool.run(toolCall.input ?? {}, { sessionId, toolUseId: toolCall.toolUseId })
      const ok = { type: 'tool.result', toolUseId: toolCall.toolUseId, output, isError: false, ts: now() }
      await this.#store.appendEvent(sessionId, ok)
      yield ok

      // Demo-friendly heuristic: `searchFlights` triggers navigation; the actual list often comes from `listFlights`.
      if (toolCall.name === 'searchFlights') {
        try {
          const listName = this.#pickFlightsListToolName()
          if (!listName) return

          const listTool = this.#tools.get(listName)
          const followId = `${toolCall.toolUseId}__${listName}`

          // Some demos need a beat after navigation/state update.
          for (let i = 0; i < 3; i += 1) {
            const use2 = { type: 'tool.use', toolUseId: `${followId}_${i + 1}`, name: listName, input: {}, ts: now() }
            await this.#store.appendEvent(sessionId, use2)
            yield use2

            const out2 = await listTool.run({}, { sessionId, toolUseId: `${followId}_${i + 1}` })
            const ok2 = { type: 'tool.result', toolUseId: `${followId}_${i + 1}`, output: out2, isError: false, ts: now() }
            await this.#store.appendEvent(sessionId, ok2)
            yield ok2

            // Stop early if we got something non-trivial back.
            if (out2 && (Array.isArray(out2) ? out2.length : true)) break
            await new Promise((r) => setTimeout(r, 700))
          }
        } catch (_) {
          // ignore follow-up failures (tool missing or still loading)
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const bad = {
        type: 'tool.result',
        toolUseId: toolCall.toolUseId,
        output: null,
        isError: true,
        errorType: e instanceof Error ? e.name : 'Error',
        errorMessage: msg,
        ts: now(),
      }
      await this.#store.appendEvent(sessionId, bad)
      yield bad
    }
  }
}
