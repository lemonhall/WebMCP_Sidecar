function now() {
  return Date.now()
}

export class ToolRunner {
  #tools
  #store
  #contextFactory

  constructor(options) {
    this.#tools = options.tools
    this.#store = options.sessionStore
    this.#contextFactory = typeof options.contextFactory === 'function' ? options.contextFactory : null
  }

  async *run(sessionId, toolCall) {
    const useEvent = { type: 'tool.use', toolUseId: toolCall.toolUseId, name: toolCall.name, input: toolCall.input, ts: now() }
    await this.#store.appendEvent(sessionId, useEvent)
    yield useEvent

    const tool = this.#tools.get(toolCall.name)
    try {
      const ctxBase = this.#contextFactory ? await this.#contextFactory(sessionId) : {}
      const ctx = { ...ctxBase, sessionId, toolUseId: toolCall.toolUseId }
      const output = await tool.run(toolCall.input ?? {}, ctx)
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
