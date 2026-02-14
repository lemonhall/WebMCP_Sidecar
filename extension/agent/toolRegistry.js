export class ToolRegistry {
  #tools = new Map()

  names() {
    return Array.from(this.#tools.keys())
  }

  get(name) {
    const t = this.#tools.get(name)
    if (!t) throw new Error(`ToolRegistry: tool not found: ${name}`)
    return t
  }

  set(tool) {
    if (!tool || typeof tool !== 'object') throw new Error('ToolRegistry.set: tool must be object')
    if (typeof tool.name !== 'string' || !tool.name) throw new Error('ToolRegistry.set: tool.name required')
    this.#tools.set(tool.name, tool)
  }
}

