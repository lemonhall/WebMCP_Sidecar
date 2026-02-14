function defaultParameters() {
  return { type: 'object', properties: {} }
}

function isJsonSchemaObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toToolSchema(tool) {
  const parameters = isJsonSchemaObject(tool.inputSchema) ? tool.inputSchema : defaultParameters()
  const out = { type: 'function', name: tool.name, parameters }
  if (typeof tool.description === 'string' && tool.description) out.description = tool.description
  return out
}

export function toolSchemasForOpenAIResponses(registry, options = {}) {
  const requested = options.allowedToolNames ?? registry.names()
  const seen = new Set()
  const out = []
  for (const name of requested) {
    if (typeof name !== 'string' || !name) continue
    if (seen.has(name)) continue
    seen.add(name)
    const tool = registry.get(name)
    out.push(toToolSchema(tool))
  }
  return out
}

