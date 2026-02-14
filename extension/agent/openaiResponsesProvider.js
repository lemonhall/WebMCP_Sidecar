function parseToolArguments(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return {}
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
      return { _raw: parsed }
    } catch {
      return { _raw: raw }
    }
  }
  return { _raw: raw }
}

function parseAssistantText(output) {
  if (!Array.isArray(output)) return null
  const parts = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    if (item.type !== 'message') continue
    if (!Array.isArray(item.content)) continue
    for (const part of item.content) {
      if (!part || typeof part !== 'object') continue
      if (part.type === 'output_text' && typeof part.text === 'string' && part.text) parts.push(part.text)
    }
  }
  return parts.length ? parts.join('') : null
}

export class OpenAIResponsesProvider {
  name = 'openai-responses'
  #baseUrl

  constructor(options = {}) {
    this.#baseUrl = String(options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
  }

  async complete(req) {
    const apiKey = req.apiKey
    if (!apiKey) throw new Error('OpenAIResponsesProvider: apiKey is required')

    const url = `${this.#baseUrl}/responses`
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }

    const payload = {
      model: req.model,
      input: Array.isArray(req.input) ? req.input : [],
      store: typeof req.store === 'boolean' ? req.store : true,
    }
    if (typeof req.instructions === 'string' && req.instructions.trim()) payload.instructions = req.instructions
    if (Array.isArray(req.tools) && req.tools.length) payload.tools = req.tools
    if (req.previousResponseId) payload.previous_response_id = req.previousResponseId
    if (Array.isArray(req.include) && req.include.length) payload.include = req.include

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), credentials: 'omit' })
    if (res.status >= 400) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenAIResponsesProvider: HTTP ${res.status}${text ? `: ${text}` : ''}`)
    }

    const obj = await res.json()
    const outputItems = Array.isArray(obj?.output) ? obj.output : []
    const assistantText = parseAssistantText(outputItems)

    const toolCalls = []
    for (const item of outputItems) {
      if (!item || typeof item !== 'object') continue
      if (item.type !== 'function_call') continue
      const callId = item.call_id
      const name = item.name
      if (typeof callId !== 'string' || !callId) continue
      if (typeof name !== 'string' || !name) continue
      toolCalls.push({ toolUseId: callId, name, input: parseToolArguments(item.arguments) })
    }

    return {
      assistantText,
      toolCalls,
      usage: obj?.usage && typeof obj.usage === 'object' ? obj.usage : undefined,
      raw: obj,
      responseId: typeof obj?.id === 'string' ? obj.id : null,
    }
  }
}

