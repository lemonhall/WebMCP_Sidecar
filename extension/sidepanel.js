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
  } else if (e.type === 'assistant.delta') {
    meta = 'assistant.delta'
    text = e.textDelta ?? ''
    isTool = true
  } else if (e.type === 'system.notice') {
    meta = 'system.notice'
    text = e.text ?? ''
    isTool = true
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
  for (const e of events) {
    // Avoid noisy history: streaming deltas are for live UI only.
    if (e?.type === 'assistant.delta') continue
    chatMessagesEl.appendChild(renderChatEvent(e))
  }
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

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return typeof tab?.url === 'string' ? tab.url : ''
}

function makeSystemNoticeForNav(beforeUrl, afterUrl) {
  return `Notice: active tab navigated.
from: ${beforeUrl || '(unknown)'}
to: ${afterUrl || '(unknown)'}
Action: tools have been reloaded for the new page. Do NOT answer the user task yet; re-check available tools and continue with tool calls if needed.`
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

async function onChatSend(sessionStore, sessionId) {
  const text = String(chatInputEl.value ?? '').trim()
  if (!text) return
  chatInputEl.value = ''

  setChatStatus('running...')
  chatSendBtn.disabled = true
  chatClearBtn.disabled = true
  let navWatcher = null

  try {
    await renderChat(sessionStore, sessionId)

    let liveAssistantEl = null
    let liveText = ''

    const settings = await loadSettings()
    if (!settings.baseUrl || !settings.model || !settings.apiKey) {
      chatMessagesEl.appendChild(
        renderChatEvent({
          type: 'assistant.message',
          text: 'LLM settings missing. Click Settings and fill baseUrl / model / apiKey, then Test.',
        })
      )
      scrollChatToBottom()
      return
    }

    const registry = new ToolRegistry()
    const emitLocal = (ev) => {
      chatMessagesEl.appendChild(renderChatEvent(ev))
      scrollChatToBottom()
    }

    let lastKnownUrl = await getActiveTabUrl().catch(() => '')
    let navHandling = false

    const refreshRegistryTools = async () => {
      // Retry briefly because during navigation, content scripts may not be ready yet.
      for (let i = 0; i < 6; i += 1) {
        const toolsMeta = await wmcpRefreshTools().catch(() => [])
        const tools = []
        for (const t of toolsMeta) {
          if (!t?.name) continue
          const toolName = t.name
          tools.push({
            name: toolName,
            description: t.description ?? '',
            inputSchema: t.inputSchema,
            run: async (input) => {
              const beforeUrl = await getActiveTabUrl().catch(() => '')
              const out = await wmcpCallTool(toolName, input)

              // URL change is a strong signal that tools/context may have changed.
              // Poll briefly because navigation can land just after the tool returns.
              let afterUrl = await getActiveTabUrl().catch(() => '')
              if (afterUrl === beforeUrl) {
                await new Promise((r) => setTimeout(r, 250))
                afterUrl = await getActiveTabUrl().catch(() => '')
              }
              if (afterUrl === beforeUrl) {
                await new Promise((r) => setTimeout(r, 500))
                afterUrl = await getActiveTabUrl().catch(() => '')
              }

              await handleNavChange(beforeUrl, afterUrl)
              return out
            },
          })
        }
        registry.replaceAll(tools)
        if (tools.length) return
        await new Promise((r) => setTimeout(r, 250))
      }
    }

    const handleNavChange = async (beforeUrl, afterUrl) => {
      if (!afterUrl || afterUrl === lastKnownUrl) return
      if (navHandling) return
      navHandling = true
      try {
        const prev = beforeUrl || lastKnownUrl || ''
        lastKnownUrl = afterUrl

        await refreshRegistryTools()
        const notice = makeSystemNoticeForNav(prev, afterUrl)
        await sessionStore.appendEvent(sessionId, { type: 'system.notice', text: notice, ts: Date.now() })
        emitLocal({ type: 'system.notice', text: notice })
      } finally {
        navHandling = false
      }
    }

    await refreshRegistryTools()
    const runner = new ToolRunner({ tools: registry, sessionStore })
    const provider = new OpenAIResponsesProvider({ baseUrl: settings.baseUrl })
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const tabUrl = typeof tab?.url === 'string' ? tab.url : ''
    const tabTitle = typeof tab?.title === 'string' ? tab.title : ''

    const runtime = new AgentRuntime({
      sessionStore,
      toolRunner: runner,
      tools: registry,
      provider,
      model: settings.model,
      apiKey: settings.apiKey,
      systemPrompt: `You are a browser side-panel agent.
Current tab title: ${tabTitle || '(unknown)'}
Current tab URL: ${tabUrl || '(unknown)'}
Available tool names: ${registry.names().join(', ') || '(none)'}
Use available tools when needed.`,
      maxSteps: 8,
    })

    navWatcher = setInterval(() => {
      getActiveTabUrl()
        .then((url) => handleNavChange(lastKnownUrl, url))
        .catch(() => {})
    }, 600)

    for await (const ev of runtime.runTurn({ sessionId, userText: text })) {
      if (ev.type === 'assistant.delta') {
        if (!liveAssistantEl) {
          liveAssistantEl = renderChatEvent({ type: 'assistant.message', text: '' })
          const meta = liveAssistantEl.querySelector('.meta')
          if (meta) meta.textContent = 'assistant (streaming)'
          chatMessagesEl.appendChild(liveAssistantEl)
        }
        liveText += ev.textDelta ?? ''
        const txt = liveAssistantEl.querySelector('.text')
        if (txt) txt.textContent = liveText
        scrollChatToBottom()
        continue
      }

      if (ev.type === 'assistant.message' && liveAssistantEl) {
        const meta = liveAssistantEl.querySelector('.meta')
        if (meta) meta.textContent = 'assistant'
        const txt = liveAssistantEl.querySelector('.text')
        if (txt) txt.textContent = ev.text ?? ''
        liveAssistantEl = null
        liveText = ''
        scrollChatToBottom()
        continue
      }

      chatMessagesEl.appendChild(renderChatEvent(ev))
      scrollChatToBottom()
    }

  } catch (e) {
    await sessionStore.appendEvent(sessionId, { type: 'assistant.message', text: `Agent error: ${String(e?.message ?? e)}`, ts: Date.now() })
  } finally {
    if (navWatcher) clearInterval(navWatcher)
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
