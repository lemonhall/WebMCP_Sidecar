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

