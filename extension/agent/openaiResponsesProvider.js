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

function parseSseBlocks(text) {
  // Minimal SSE parser: splits on blank lines and extracts joined data: lines.
  // Supports OpenAI-style "event: ..." + "data: {...}" blocks.
  const blocks = String(text ?? '').split(/\n\n+/g)
  const out = []
  for (const blk of blocks) {
    const lines = blk.split(/\n/g)
    const dataLines = []
    for (const line of lines) {
      if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart())
    }
    if (!dataLines.length) continue
    out.push(dataLines.join('\n'))
  }
  return out
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
    const headers = { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${apiKey}` }

    const payload = {
      model: req.model,
      input: Array.isArray(req.input) ? req.input : [],
      store: typeof req.store === 'boolean' ? req.store : true,
      stream: false,
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

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    const text = await res.text()

    // Some OpenAI-compatible gateways always return SSE (text/event-stream) even when stream=false.
    if (contentType.includes('text/event-stream') || text.startsWith('event:') || text.startsWith('data:')) {
      const ongoing = new Map()
      const toolCalls = []
      const parts = []
      let responseId = null
      let usage = undefined

      for (const data of parseSseBlocks(text)) {
        const trimmed = data.trim()
        if (!trimmed) continue
        if (trimmed === '[DONE]') break

        let obj
        try {
          obj = JSON.parse(trimmed)
        } catch {
          continue
        }
        if (!obj || typeof obj !== 'object') continue

        if (typeof obj.response_id === 'string' && obj.response_id) responseId = obj.response_id

        const typ = obj.type
        if (typ === 'response.created') {
          const rid = obj.response?.id
          if (typeof rid === 'string' && rid) responseId = rid
          continue
        }

        if (typ === 'response.output_text.delta') {
          const delta = obj.delta
          if (typeof delta === 'string' && delta) parts.push(delta)
          continue
        }

        if (typ === 'response.output_item.added') {
          const outputIndex = obj.output_index
          const item = obj.item
          if (typeof outputIndex === 'number' && item && typeof item === 'object' && item.type === 'function_call') {
            const callId = item.call_id
            const name = item.name
            if (typeof callId === 'string' && callId && typeof name === 'string' && name) ongoing.set(outputIndex, { callId, name, arguments: '' })
          }
          continue
        }

        if (typ === 'response.function_call_arguments.delta') {
          const outputIndex = obj.output_index
          const delta = obj.delta
          if (typeof outputIndex === 'number' && typeof delta === 'string') {
            const st = ongoing.get(outputIndex)
            if (st) st.arguments += delta
          }
          continue
        }

        if (typ === 'response.output_item.done') {
          const outputIndex = obj.output_index
          const item = obj.item
          if (typeof outputIndex === 'number' && item && typeof item === 'object' && item.type === 'function_call') {
            const st = ongoing.get(outputIndex)
            const callId = st?.callId ?? item.call_id
            const name = st?.name ?? item.name
            const args = st?.arguments ?? item.arguments ?? ''
            if (typeof callId === 'string' && callId && typeof name === 'string' && name) {
              toolCalls.push({ toolUseId: callId, name, input: parseToolArguments(args) })
            }
          }
          continue
        }

        if (typ === 'response.completed') {
          const rid = obj.response?.id
          if (typeof rid === 'string' && rid) responseId = rid
          const u = obj.response?.usage
          if (u && typeof u === 'object') usage = u
          continue
        }
      }

      return {
        assistantText: parts.length ? parts.join('') : null,
        toolCalls,
        usage,
        raw: { _sse: true, text },
        responseId,
      }
    }

    // Normal JSON response.
    let obj = null
    try {
      obj = text ? JSON.parse(text) : null
    } catch (e) {
      throw new Error(`OpenAIResponsesProvider: invalid JSON: ${String(e?.message ?? e)}`)
    }

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
