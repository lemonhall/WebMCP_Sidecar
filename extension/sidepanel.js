import { ChromeSessionStore } from './agent/sessionStoreChrome.js'
import { ToolRegistry } from './agent/toolRegistry.js'
import { ToolRunner } from './agent/toolRunner.js'
import { AgentRuntime } from './agent/agentRuntime.js'
import { OpenAIResponsesProvider } from './agent/openaiResponsesProvider.js'

const STORAGE_SETTINGS_KEY = 'settings.llm.v1'
const STORAGE_SESSION_ID_KEY = 'wmcp.agent.currentSessionId.v1'

// Tabs / Sections
const tabChat = document.getElementById('tabChat')
const tabInspector = document.getElementById('tabInspector')
const chatSection = document.getElementById('chatSection')
const inspectorSection = document.getElementById('inspectorSection')

// Shared header
const statusEl = document.getElementById('status')
const settingsBtn = document.getElementById('settings')

// Chat UI
const chatMessagesEl = document.getElementById('chatMessages')
const chatInputEl = document.getElementById('chatInput')
const chatSendBtn = document.getElementById('chatSend')
const chatClearBtn = document.getElementById('chatClear')
const chatStatusEl = document.getElementById('chatStatus')

// Inspector UI (Phase 0 kernel)
const refreshBtn = document.getElementById('refresh')
const grantBtn = document.getElementById('grant')
const callBtn = document.getElementById('call')
const fillExampleBtn = document.getElementById('fillExample')
const toolsSelect = document.getElementById('tools')
const paramsEl = document.getElementById('params')
const schemaEl = document.getElementById('schema')
const siteEl = document.getElementById('site')
const resultEl = document.getElementById('result')

let currentTools = []

function setStatus(text) {
  statusEl.textContent = text
}

function setChatStatus(text) {
  chatStatusEl.textContent = text
}

function setResult(obj) {
  resultEl.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)
}

function setTabActive(which) {
  tabChat.classList.toggle('active', which === 'chat')
  tabInspector.classList.toggle('active', which === 'inspector')
  chatSection.classList.toggle('hidden', which !== 'chat')
  inspectorSection.classList.toggle('hidden', which !== 'inspector')
}

function scrollChatToBottom() {
  const el = chatMessagesEl
  el.scrollTop = el.scrollHeight
}

function renderChatEvent(e) {
  const div = document.createElement('div')
  div.className = 'msg'

  let meta = ''
  let text = ''
  let isTool = false

  if (e.type === 'user.message') {
    meta = 'user'
    text = e.text ?? ''
  } else if (e.type === 'assistant.message') {
    meta = 'assistant'
    text = e.text ?? ''
  } else if (e.type === 'tool.use') {
    meta = `tool.use: ${e.name ?? ''}`
    text = JSON.stringify(e.input ?? {}, null, 2)
    isTool = true
  } else if (e.type === 'tool.result') {
    meta = `tool.result${e.isError ? ' (error)' : ''}`
    text = e.isError ? String(e.errorMessage ?? 'Tool failed') : JSON.stringify(e.output ?? null, null, 2)
    isTool = true
  } else if (e.type === 'result') {
    meta = `result: ${e.stopReason ?? 'end'}`
    text = e.finalText ?? ''
    isTool = true
  } else if (e.type === 'system.init') {
    meta = 'system.init'
    text = e.sessionId ?? ''
    isTool = true
  } else {
    meta = e.type ?? 'event'
    text = JSON.stringify(e, null, 2)
    isTool = true
  }

  if (isTool) div.classList.add('tool')

  const metaEl = document.createElement('div')
  metaEl.className = 'meta'
  metaEl.textContent = meta

  const textEl = document.createElement('div')
  textEl.className = 'text'
  textEl.textContent = text

  div.appendChild(metaEl)
  div.appendChild(textEl)
  return div
}

async function renderChat(sessionStore, sessionId) {
  const events = await sessionStore.readEvents(sessionId)
  chatMessagesEl.innerHTML = ''
  for (const e of events) chatMessagesEl.appendChild(renderChatEvent(e))
  scrollChatToBottom()
}

async function getOrCreateSessionId(sessionStore) {
  const stored = await chrome.storage.local.get(STORAGE_SESSION_ID_KEY)
  const existing = stored?.[STORAGE_SESSION_ID_KEY]
  if (typeof existing === 'string' && existing) return existing
  const id = await sessionStore.createSession({ metadata: { kind: 'sidepanel' } })
  await chrome.storage.local.set({ [STORAGE_SESSION_ID_KEY]: id })
  return id
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(STORAGE_SETTINGS_KEY)
  const v = stored?.[STORAGE_SETTINGS_KEY] ?? {}
  return {
    baseUrl: typeof v.baseUrl === 'string' ? v.baseUrl.trim() : '',
    model: typeof v.model === 'string' ? v.model.trim() : '',
    apiKey: typeof v.apiKey === 'string' ? v.apiKey : '',
  }
}

function toOriginPattern(baseUrlText) {
  try {
    const url = new URL(baseUrlText)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return `${url.origin}/*`
  } catch {
    return null
  }
}

async function ensureHostPermissionForBaseUrl(baseUrl) {
  const originPattern = toOriginPattern(baseUrl)
  if (!originPattern) return { ok: false, error: 'Invalid Base URL (must be http(s) URL)' }

  try {
    const already = await chrome.permissions.contains({ origins: [originPattern] })
    if (already) return { ok: true, originPattern, already: true }
  } catch (_) {
    // continue to request
  }

  const granted = await chrome.permissions.request({ origins: [originPattern] })
  if (!granted) return { ok: false, error: `Permission denied for ${originPattern}` }
  return { ok: true, originPattern, already: false }
}

// -------------------------
// Inspector (Phase 0) logic
// -------------------------

function setTools(tools) {
  currentTools = Array.isArray(tools) ? tools : []
  toolsSelect.innerHTML = ''
  for (const tool of currentTools) {
    const opt = document.createElement('option')
    opt.value = tool.name
    opt.textContent = tool.description ? `${tool.name} — ${tool.description}` : tool.name
    toolsSelect.appendChild(opt)
  }
  renderSelectedTool()
}

function getSelectedTool() {
  const name = toolsSelect.value
  return currentTools.find((t) => t?.name === name) ?? null
}

function schemaToExample(schema) {
  if (!schema || typeof schema !== 'object') return {}

  if (schema.anyOf && Array.isArray(schema.anyOf) && schema.anyOf.length) return schemaToExample(schema.anyOf[0])
  if (schema.oneOf && Array.isArray(schema.oneOf) && schema.oneOf.length) return schemaToExample(schema.oneOf[0])
  if (schema.allOf && Array.isArray(schema.allOf) && schema.allOf.length) return schemaToExample(schema.allOf[0])

  if (schema.default !== undefined) return schema.default
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]

  const t = schema.type
  if (t === 'object') {
    const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {}
    const required = Array.isArray(schema.required) ? new Set(schema.required) : new Set()
    const out = {}
    for (const [key, child] of Object.entries(props)) {
      if (required.has(key)) out[key] = schemaToExample(child)
    }
    return out
  }
  if (t === 'array') return [schemaToExample(schema.items)]
  if (t === 'string') return ''
  if (t === 'integer' || t === 'number') return 0
  if (t === 'boolean') return false
  return null
}

function renderSelectedTool() {
  const tool = getSelectedTool()
  if (!tool) {
    schemaEl.textContent = ''
    return
  }
  schemaEl.textContent = tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : '(no inputSchema)'
}

async function refreshSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const url = tab?.url ? new URL(tab.url) : null
    siteEl.textContent = url ? `site: ${url.origin}` : 'site: unknown'
  } catch (_) {
    siteEl.textContent = 'site: unknown'
  }
}

async function wmcpRefreshTools() {
  const res = await chrome.runtime.sendMessage({ type: 'wmcp:refresh' })
  if (!res?.ok) throw new Error(res?.error ?? 'wmcp:refresh failed')
  return res.tools ?? []
}

async function refreshTools() {
  setStatus('refreshing...')
  setResult('')
  try {
    const tools = await wmcpRefreshTools()
    setTools(tools)
    setStatus(`tools=${tools.length}`)
  } catch (e) {
    setStatus('error')
    setResult(String(e?.message ?? e))
  }
}

async function grantCurrentSite() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) throw new Error('No active tab url')
  const url = new URL(tab.url)
  const originPattern = `${url.origin}/*`

  const ok = await chrome.permissions.request({ origins: [originPattern] })
  if (!ok) {
    setResult({ ok: false, error: 'Permission request was denied' })
    return
  }
  const res = await chrome.runtime.sendMessage({ type: 'wmcp:registerOrigin', originPattern, tabId: tab.id })
  if (!res?.ok) setResult({ ok: false, error: res?.error ?? 'registerOrigin failed' })
  setResult({ ok: true, granted: originPattern })
}

function fillExample() {
  const tool = getSelectedTool()
  if (!tool?.name) return

  if (tool.name === 'searchFlights') {
    paramsEl.value = JSON.stringify(
      {
        origin: 'LON',
        destination: 'NYC',
        tripType: 'round-trip',
        outboundDate: '2026-02-14',
        inboundDate: '2026-02-21',
        passengers: 2,
      },
      null,
      2
    )
    return
  }

  const example = schemaToExample(tool.inputSchema)
  paramsEl.value = JSON.stringify(example ?? {}, null, 2)
}

async function wmcpCallTool(toolName, params) {
  const res = await chrome.runtime.sendMessage({ type: 'wmcp:call', toolName, params: params ?? {} })
  if (!res?.ok) throw new Error(res?.error ?? 'wmcp:call failed')
  const payload = res.result
  if (payload?.ok) return payload.result
  throw new Error(payload?.error ?? 'tool call failed')
}

async function callTool() {
  const toolName = toolsSelect.value
  let params = {}
  try {
    params = JSON.parse(paramsEl.value || '{}')
  } catch (e) {
    setResult({ ok: false, error: 'Params must be valid JSON' })
    return
  }

  setStatus('calling...')
  try {
    const out = await wmcpCallTool(toolName, params)
    setStatus('done')
    setResult({ ok: true, result: out })
  } catch (e) {
    setStatus('error')
    setResult({ ok: false, error: String(e?.message ?? e) })
  }
}

// -------------------------
// Chat (Phase 1) logic
// -------------------------

async function runAgentTurn(sessionStore, sessionId, userText) {
  const settings = await loadSettings()
  if (!settings.baseUrl || !settings.model || !settings.apiKey) {
    await sessionStore.appendEvent(sessionId, {
      type: 'assistant.message',
      text: 'LLM settings missing. Click Settings and fill baseUrl / model / apiKey, then Test.',
      ts: Date.now(),
    })
    return
  }

  const perm = await ensureHostPermissionForBaseUrl(settings.baseUrl)
  if (!perm.ok) {
    await sessionStore.appendEvent(sessionId, { type: 'assistant.message', text: `Permission error: ${perm.error}`, ts: Date.now() })
    return
  }

  const toolsMeta = await wmcpRefreshTools().catch(() => [])
  const registry = new ToolRegistry()
  for (const t of toolsMeta) {
    if (!t?.name) continue
    registry.set({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema,
      run: async (input) => await wmcpCallTool(t.name, input),
    })
  }

  const provider = new OpenAIResponsesProvider({ baseUrl: settings.baseUrl })
  const runner = new ToolRunner({ tools: registry, sessionStore })
  const runtime = new AgentRuntime({
    sessionStore,
    toolRunner: runner,
    tools: registry,
    provider,
    model: settings.model,
    apiKey: settings.apiKey,
    systemPrompt:
      'You are a browser side-panel agent. Use available tools when needed. If you call a tool, wait for results, then summarize succinctly.',
    maxSteps: 8,
  })

  for await (const _ev of runtime.runTurn({ sessionId, userText })) {
    // Events are stored in sessionStore; UI will re-render.
  }
}

async function onChatSend(sessionStore, sessionId) {
  const text = String(chatInputEl.value ?? '').trim()
  if (!text) return
  chatInputEl.value = ''

  setChatStatus('running...')
  chatSendBtn.disabled = true
  chatClearBtn.disabled = true

  try {
    await runAgentTurn(sessionStore, sessionId, text)
  } catch (e) {
    await sessionStore.appendEvent(sessionId, { type: 'assistant.message', text: `Agent error: ${String(e?.message ?? e)}`, ts: Date.now() })
  } finally {
    await renderChat(sessionStore, sessionId)
    setChatStatus('idle')
    chatSendBtn.disabled = false
    chatClearBtn.disabled = false
  }
}

async function onChatClear(sessionStore, sessionId) {
  await sessionStore.clearEvents(sessionId)
  await renderChat(sessionStore, sessionId)
}

// -------------------------
// Boot
// -------------------------

settingsBtn?.addEventListener('click', () => chrome.runtime.openOptionsPage())

tabChat.addEventListener('click', () => setTabActive('chat'))
tabInspector.addEventListener('click', () => setTabActive('inspector'))

toolsSelect.addEventListener('change', renderSelectedTool)
refreshBtn.addEventListener('click', refreshTools)
callBtn.addEventListener('click', callTool)
grantBtn.addEventListener('click', () => grantCurrentSite().catch((e) => setResult(String(e?.message ?? e))))
fillExampleBtn.addEventListener('click', fillExample)

;(async () => {
  const sessionStore = new ChromeSessionStore()
  const sessionId = await getOrCreateSessionId(sessionStore)

  chatSendBtn.addEventListener('click', () => onChatSend(sessionStore, sessionId))
  chatClearBtn.addEventListener('click', () => onChatClear(sessionStore, sessionId))
  chatInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onChatSend(sessionStore, sessionId)
  })

  setTabActive('chat')
  setStatus('idle')
  setChatStatus('idle')

  await renderChat(sessionStore, sessionId)
  await refreshSite().catch(() => {})
  // Pre-load tool list in background (Inspector still requires explicit Refresh).
  wmcpRefreshTools().catch(() => {})
})().catch((e) => {
  setStatus('error')
  setChatStatus('error')
  const msg = String(e?.message ?? e)
  chatMessagesEl.innerHTML = ''
  chatMessagesEl.appendChild(renderChatEvent({ type: 'assistant.message', text: `Boot error: ${msg}` }))
})

