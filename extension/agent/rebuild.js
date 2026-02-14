function safeJsonStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify(String(value))
  }
}

export function rebuildResponsesInput(events) {
  const out = []
  for (const e of events) {
    if (!e || typeof e !== 'object') continue
    if (e.type === 'user.message' && typeof e.text === 'string') {
      out.push({ role: 'user', content: e.text })
      continue
    }
    if (e.type === 'assistant.message' && typeof e.text === 'string') {
      out.push({ role: 'assistant', content: e.text })
      continue
    }
    if (e.type === 'tool.use') {
      const id = String(e.toolUseId ?? '')
      const name = String(e.name ?? '')
      const args = safeJsonStringify(e.input ?? {})
      if (id && name) out.push({ type: 'function_call', call_id: id, name, arguments: args })
      continue
    }
    if (e.type === 'tool.result') {
      const id = String(e.toolUseId ?? '')
      const output = safeJsonStringify(e.output)
      if (id) out.push({ type: 'function_call_output', call_id: id, output })
      continue
    }
  }
  return out
}

