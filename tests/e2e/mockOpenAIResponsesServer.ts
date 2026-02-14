import http from 'node:http'
import { AddressInfo } from 'node:net'

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue }

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8')
      if (!raw.trim()) return resolve(null)
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function setCors(res: http.ServerResponse) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type, authorization, accept')
}

function buildCallIdToName(input: any[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const it of input) {
    if (!it || typeof it !== 'object') continue
    if (it.type !== 'function_call') continue
    const id = typeof it.call_id === 'string' ? it.call_id : ''
    const name = typeof it.name === 'string' ? it.name : ''
    if (id && name) m.set(id, name)
  }
  return m
}

function outputsByToolName(input: any[]): Set<string> {
  const map = buildCallIdToName(input)
  const out = new Set<string>()
  for (const it of input) {
    if (!it || typeof it !== 'object') continue
    if (it.type !== 'function_call_output') continue
    const id = typeof it.call_id === 'string' ? it.call_id : ''
    const name = id ? map.get(id) : null
    if (name) out.add(name)
  }
  return out
}

function writeSse(res: http.ServerResponse, obj: JsonValue | '[DONE]') {
  res.write(`data: ${obj === '[DONE]' ? '[DONE]' : JSON.stringify(obj)}\n\n`)
}

async function sendToolCallStream(res: http.ServerResponse, toolName: string, callId: string, args: Record<string, any>) {
  res.statusCode = 200
  res.setHeader('content-type', 'text/event-stream; charset=utf-8')
  res.setHeader('cache-control', 'no-cache')
  res.setHeader('connection', 'keep-alive')
  setCors(res)

  const responseId = `resp_${Date.now()}_${Math.random().toString(16).slice(2)}`
  writeSse(res, { type: 'response.created', response: { id: responseId } })
  writeSse(res, { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: callId, name: toolName } })
  writeSse(res, { type: 'response.function_call_arguments.delta', output_index: 0, delta: JSON.stringify(args ?? {}) })
  writeSse(res, { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', call_id: callId, name: toolName } })
  writeSse(res, { type: 'response.completed', response: { id: responseId, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } })
  writeSse(res, '[DONE]')
  res.end()
}

async function sendAssistantTextStream(res: http.ServerResponse, text: string) {
  res.statusCode = 200
  res.setHeader('content-type', 'text/event-stream; charset=utf-8')
  res.setHeader('cache-control', 'no-cache')
  res.setHeader('connection', 'keep-alive')
  setCors(res)

  const responseId = `resp_${Date.now()}_${Math.random().toString(16).slice(2)}`
  writeSse(res, { type: 'response.created', response: { id: responseId } })

  const parts = String(text ?? '').split(/(\s+)/).filter((x) => x !== '')
  for (const p of parts.slice(0, 40)) {
    writeSse(res, { type: 'response.output_text.delta', delta: p })
    // Tiny delay to exercise streaming UI, but still keep tests fast.
    await new Promise((r) => setTimeout(r, 8))
  }

  writeSse(res, { type: 'response.completed', response: { id: responseId, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } })
  writeSse(res, '[DONE]')
  res.end()
}

export async function startMockOpenAIResponsesServer(options: { script?: "flightsearch" | "skill-hello" } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      setCors(res)
      if (req.method === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }

      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (req.method !== 'POST' || !(url.pathname === '/v1/responses' || url.pathname === '/responses')) {
        res.statusCode = 404
        res.end('not found')
        return
      }

      const body = await readJson(req).catch(() => null)
      const input = Array.isArray(body?.input) ? body.input : []
      const done = outputsByToolName(input)

      const script = options.script ?? "flightsearch";

      if (script === "skill-hello") {
        if (!done.has("ListSkills")) {
          await sendToolCallStream(res, "ListSkills", "call_listskills_1", {});
          return;
        }
        if (!done.has("Skill")) {
          await sendToolCallStream(res, "Skill", "call_skill_1", { name: "hello-world" });
          return;
        }
        await sendAssistantTextStream(res, "已完成：Skill 已加载（hello-world）。");
        return;
      }

      // flightsearch
      if (!done.has("searchFlights")) {
        await sendToolCallStream(res, "searchFlights", "call_searchFlights_1", {
          origin: "LON",
          destination: "NYC",
          tripType: "round-trip",
          outboundDate: "2026-02-14",
          inboundDate: "2026-02-21",
          passengers: 2,
        });
        return;
      }

      if (!done.has("listFlights")) {
        await sendToolCallStream(res, "listFlights", "call_listFlights_1", {});
        return;
      }

      await sendAssistantTextStream(res, "已完成：已在结果页调用 listFlights 读取航班列表，并可按价格/时长/中转次数做进一步筛选与总结。")
    } catch (e: any) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: String(e?.message ?? e) }))
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const baseUrl = `http://127.0.0.1:${port}/v1`

  return {
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
