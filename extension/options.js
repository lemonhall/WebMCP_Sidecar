import { OPFSWorkspace } from './agent/opfsWorkspace.js'
import { ensureHelloWorldSkill, createShadowWorkspaceTools } from './agent/shadowTools.js'
import { ChromeSessionStore } from './agent/sessionStoreChrome.js'
import { ToolRegistry } from './agent/toolRegistry.js'
import { ToolRunner } from './agent/toolRunner.js'
import { AgentRuntime } from './agent/agentRuntime.js'
import { OpenAIResponsesProvider } from './agent/openaiResponsesProvider.js'

const STORAGE_KEY = 'settings.llm.v1'

// Tabs
const tabLlm = document.getElementById('tabLlm')
const tabFiles = document.getElementById('tabFiles')
const llmSection = document.getElementById('llmSection')
const filesSection = document.getElementById('filesSection')

// Shared
const statusEl = document.getElementById('status')

function setStatus(text) {
  statusEl.textContent = text
}

function setTabActive(which) {
  tabLlm.classList.toggle('active', which === 'llm')
  tabFiles.classList.toggle('active', which === 'files')
  llmSection.classList.toggle('hidden', which !== 'llm')
  filesSection.classList.toggle('hidden', which !== 'files')
}

// -------------------------
// LLM settings
// -------------------------

const baseUrlEl = document.getElementById('baseUrl')
const modelEl = document.getElementById('model')
const apiKeyEl = document.getElementById('apiKey')
const saveBtn = document.getElementById('save')
const testBtn = document.getElementById('test')
const resultEl = document.getElementById('result')

function setResult(obj) {
  resultEl.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)
}

function normalizeBaseUrl(raw) {
  if (!raw) return ''
  let s = String(raw).trim()
  if (!s) return ''
  s = s.replace(/\/+$/, '')
  if (s.endsWith('/chat/completions')) s = s.slice(0, -'/chat/completions'.length)
  if (s.endsWith('/responses')) s = s.slice(0, -'/responses'.length)
  s = s.replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  return s
}

function buildOpenAICompatibleUrl(baseUrl, apiPath) {
  const u = new URL(baseUrl)
  const basePath = u.pathname.replace(/\/+$/, '')
  const endsWithV1 = /\/v1$/i.test(basePath)
  const effectiveApiPath = endsWithV1 ? apiPath.replace(/^\/v1\b/i, '') : apiPath
  const joinedPath = `${basePath}${effectiveApiPath}`
  u.pathname = joinedPath.startsWith('/') ? joinedPath : `/${joinedPath}`
  return u.toString()
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const v = stored?.[STORAGE_KEY] ?? {}
  baseUrlEl.value = v.baseUrl ?? ''
  modelEl.value = v.model ?? ''
  apiKeyEl.value = v.apiKey ?? ''
}

async function saveSettings() {
  const baseUrl = normalizeBaseUrl(baseUrlEl.value)
  const model = String(modelEl.value ?? '').trim()
  const apiKey = String(apiKeyEl.value ?? '').trim()

  await chrome.storage.local.set({
    [STORAGE_KEY]: { baseUrl, model, apiKey, updatedAt: new Date().toISOString() },
  })

  baseUrlEl.value = baseUrl
  setResult({ ok: true, saved: { baseUrl, model, apiKey: apiKey ? '***' : '' } })
}

async function postJson(url, apiKey, body) {
  const headers = {
    'content-type': 'application/json',
  }
  if (apiKey) headers.authorization = `Bearer ${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch (_) {
    json = null
  }

  return { ok: res.ok, status: res.status, statusText: res.statusText, json, text }
}

async function testLLM() {
  setStatus('testing...')
  setResult('')

  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const v = stored?.[STORAGE_KEY] ?? {}
  const baseUrl = normalizeBaseUrl(v.baseUrl ?? baseUrlEl.value)
  const model = String(v.model ?? modelEl.value ?? '').trim()
  const apiKey = String(v.apiKey ?? apiKeyEl.value ?? '').trim()

  if (!baseUrl) {
    setStatus('error')
    setResult({ ok: false, message: 'baseUrl is required' })
    return
  }
  if (!model) {
    setStatus('error')
    setResult({ ok: false, message: 'model is required' })
    return
  }
  if (!apiKey) {
    setStatus('error')
    setResult({ ok: false, message: 'apiKey is required' })
    return
  }

  const responsesUrl = buildOpenAICompatibleUrl(baseUrl, '/v1/responses')
  const body = {
    model,
    store: false,
    instructions: 'Reply with exactly: Hello world.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'Hello world' }] }],
  }

  const r1 = await postJson(responsesUrl, apiKey, body)
  if (r1.ok) {
    setStatus('ok')
    setResult({ ok: true, endpoint: '/v1/responses', status: r1.status, json: r1.json ?? r1.text })
    return
  }

  setStatus('error')
  setResult({ ok: false, endpoint: '/v1/responses', status: r1.status, error: r1.json ?? r1.text })
}

// -------------------------
// File manager (.agents/*)
// -------------------------

const fmUpBtn = document.getElementById('fmUp')
const fmRefreshBtn = document.getElementById('fmRefresh')
const fmPathEl = document.getElementById('fmPath')
const fmOpenBtn = document.getElementById('fmOpen')
const fmNewFileBtn = document.getElementById('fmNewFile')
const fmNewDirBtn = document.getElementById('fmNewDir')
const fmDeleteBtn = document.getElementById('fmDelete')
const fmSaveBtn = document.getElementById('fmSave')
const fmCwdEl = document.getElementById('fmCwd')
const fmListEl = document.getElementById('fmList')
const fmEditorEl = document.getElementById('fmEditor')
const fmOpenPathEl = document.getElementById('fmOpenPath')
const fmStatusEl = document.getElementById('fmStatus')

// File Agent UI
const fileAgentMessagesEl = document.getElementById('fileAgentMessages')
const fileAgentInputEl = document.getElementById('fileAgentInput')
const fileAgentSendBtn = document.getElementById('fileAgentSend')
const fileAgentClearBtn = document.getElementById('fileAgentClear')
const fileAgentStatusEl = document.getElementById('fileAgentStatus')

function setFmStatus(text) {
  fmStatusEl.textContent = text
}

function normalizePath(raw) {
  const s = String(raw ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!s) return ''
  const parts = s.split('/').filter(Boolean)
  for (const p of parts) {
    if (p === '.' || p === '..') throw new Error(`Invalid path segment: ${p}`)
  }
  return parts.join('/')
}

function parentDir(path) {
  const p = normalizePath(path)
  if (!p) return ''
  const idx = p.lastIndexOf('/')
  if (idx < 0) return ''
  return p.slice(0, idx)
}

function joinPath(a, b) {
  const aa = normalizePath(a)
  const bb = normalizePath(b)
  if (!aa) return bb
  if (!bb) return aa
  return `${aa}/${bb}`
}

let fmWorkspace = null
let fmCwd = '.agents'
let fmOpenPath = ''

function svgFolder() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>`
}

function svgFile() {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`
}

function renderFileList(entries) {
  fmListEl.innerHTML = ''
  const sorted = Array.isArray(entries) ? entries.slice() : []
  sorted.sort((x, y) => {
    const ax = x?.type === 'dir' ? 0 : 1
    const ay = y?.type === 'dir' ? 0 : 1
    if (ax !== ay) return ax - ay
    return String(x?.name ?? '').localeCompare(String(y?.name ?? ''))
  })

  for (const ent of sorted) {
    const div = document.createElement('div')
    div.className = 'fileItem'
    const kind = document.createElement('div')
    kind.className = 'kind'
    kind.innerHTML = ent.type === 'dir' ? svgFolder() : svgFile()
    const name = document.createElement('div')
    name.className = 'name'
    name.textContent = ent.name
    div.appendChild(kind)
    div.appendChild(name)
    div.addEventListener('click', () => {
      const p = joinPath(fmCwd, ent.name)
      fmPathEl.value = p
      if (ent.type === 'dir') {
        fmCwd = p
        refreshFm().catch((e) => setFmStatus(String(e?.message ?? e)))
        return
      }
      openFile(p).catch((e) => setFmStatus(String(e?.message ?? e)))
    })
    fmListEl.appendChild(div)
  }
}

async function ensureAgentsRoot() {
  try {
    await fmWorkspace.listDir('.agents')
  } catch (_) {
    await fmWorkspace.mkdir('.agents')
    await fmWorkspace.mkdir('.agents/skills')
    await fmWorkspace.mkdir('.agents/sessions')
  }

  await fmWorkspace.mkdir('.agents/skills').catch(() => {})
  await fmWorkspace.mkdir('.agents/sessions').catch(() => {})
  await ensureHelloWorldSkill(fmWorkspace).catch(() => {})

  const sessionsReadme = '.agents/sessions/README.md'
  const exists = await fmWorkspace.stat(sessionsReadme).catch(() => null)
  if (!exists) {
    const text = [
      '# Sessions',
      '',
      '这里用于存放会话日志（未来会把 sidepanel/options 内置 agent 的 session events 同步到此目录）。',
      '',
    ].join('\n')
    await fmWorkspace.writeFile(sessionsReadme, new TextEncoder().encode(text)).catch(() => {})
  }
}

async function refreshFm() {
  if (!fmWorkspace) throw new Error('File manager: OPFS workspace not available')
  setFmStatus('refreshing...')
  await ensureAgentsRoot()
  fmCwdEl.textContent = `cwd: ${fmCwd || '(root)'}`
  const entries = await fmWorkspace.listDir(fmCwd)
  renderFileList(entries)
  setFmStatus('idle')
}

async function openFile(path) {
  if (!fmWorkspace) throw new Error('File manager: OPFS workspace not available')
  const p = normalizePath(path)
  if (!p) throw new Error('Open: path required')
  setFmStatus('opening...')
  const st = await fmWorkspace.stat(p)
  if (!st) throw new Error(`Open: not found: ${p}`)
  if (st.type !== 'file') throw new Error(`Open: not a file: ${p}`)
  const bytes = await fmWorkspace.readFile(p)
  fmEditorEl.value = new TextDecoder().decode(bytes)
  fmOpenPath = p
  fmOpenPathEl.textContent = `open: ${p}`
  setFmStatus('idle')
}

async function saveOpenFile() {
  if (!fmWorkspace) throw new Error('File manager: OPFS workspace not available')
  if (!fmOpenPath) throw new Error('Save: no file opened')
  setFmStatus('saving...')
  const bytes = new TextEncoder().encode(String(fmEditorEl.value ?? ''))
  await fmWorkspace.writeFile(fmOpenPath, bytes)
  setFmStatus('saved')
  setTimeout(() => setFmStatus('idle'), 800)
}

async function newFile(path) {
  if (!fmWorkspace) throw new Error('File manager: OPFS workspace not available')
  const p = normalizePath(path)
  if (!p) throw new Error('New File: path required')
  setFmStatus('creating file...')
  const exists = await fmWorkspace.stat(p)
  if (exists) throw new Error(`New File: already exists: ${p}`)
  await fmWorkspace.writeFile(p, new TextEncoder().encode(''))
  fmCwd = parentDir(p) || fmCwd
  await refreshFm()
  await openFile(p)
}

async function newDir(path) {
  if (!fmWorkspace) throw new Error('File manager: OPFS workspace not available')
  const p = normalizePath(path)
  if (!p) throw new Error('New Folder: path required')
  setFmStatus('creating folder...')
  const exists = await fmWorkspace.stat(p)
  if (exists) throw new Error(`New Folder: already exists: ${p}`)
  await fmWorkspace.mkdir(p)
  fmCwd = parentDir(p) || fmCwd
  await refreshFm()
  setFmStatus('idle')
}

async function deletePath(path) {
  if (!fmWorkspace) throw new Error('File manager: OPFS workspace not available')
  const p = normalizePath(path)
  if (!p) throw new Error('Delete: path required')
  if (!p.startsWith('.agents/')) throw new Error('Delete: only paths under .agents/ are allowed')

  const st = await fmWorkspace.stat(p)
  if (!st) throw new Error(`Delete: not found: ${p}`)

  const msg = st.type === 'dir' ? `确认删除目录（递归）：${p} ?` : `确认删除文件：${p} ?`
  // eslint-disable-next-line no-alert
  const ok = window.confirm(msg)
  if (!ok) return

  setFmStatus('deleting...')
  if (st.type === 'file') await fmWorkspace.deleteFile(p)
  else await fmWorkspace.deletePath(p, { recursive: true })

  if (fmOpenPath === p) {
    fmOpenPath = ''
    fmOpenPathEl.textContent = 'open: (none)'
    fmEditorEl.value = ''
  }
  await refreshFm()
  setFmStatus('idle')
}

async function initFileManager() {
  try {
    fmWorkspace = await OPFSWorkspace.open()
    fmCwd = '.agents'
    fmOpenPath = ''
    fmOpenPathEl.textContent = 'open: (none)'
    fmEditorEl.value = ''
    await refreshFm()
  } catch (e) {
    fmWorkspace = null
    fmCwdEl.textContent = 'cwd: (opfs unavailable)'
    fmListEl.innerHTML = ''
    fmEditorEl.value = ''
    fmOpenPathEl.textContent = 'open: (none)'
    setFmStatus(`error: ${String(e?.message ?? e)}`)
  }
}

function setFileAgentStatus(text) {
  fileAgentStatusEl.textContent = text
}

function scrollFileAgentToBottom() {
  const el = fileAgentMessagesEl
  el.scrollTop = el.scrollHeight
}

function renderAgentEvent(e) {
  const div = document.createElement('div')
  div.className = 'msg'

  let meta = ''
  let text = ''
  let isTool = false

  if (e.type === 'user.message') {
    meta = 'user'
    text = e.text ?? ''
    div.classList.add('role-user')
  } else if (e.type === 'assistant.message') {
    meta = 'assistant'
    text = e.text ?? ''
    div.classList.add('role-assistant')
  } else if (e.type === 'assistant.delta') {
    meta = 'assistant.delta'
    text = e.textDelta ?? ''
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

async function loadLlmSettingsForAgent() {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const v = stored?.[STORAGE_KEY] ?? {}
  return {
    baseUrl: normalizeBaseUrl(v.baseUrl ?? ''),
    model: String(v.model ?? '').trim(),
    apiKey: String(v.apiKey ?? '').trim(),
  }
}

function filterFsTools(allTools) {
  const allow = new Set(['ListDir', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Mkdir', 'Delete'])
  return (Array.isArray(allTools) ? allTools : []).filter((t) => t?.name && allow.has(t.name))
}

async function createFileAgent() {
  if (!fmWorkspace) await initFileManager()
  if (!fmWorkspace) throw new Error('File Agent: OPFS workspace not available')
  const settings = await loadLlmSettingsForAgent()
  if (!settings.baseUrl || !settings.model || !settings.apiKey) {
    throw new Error('File Agent: LLM settings missing (fill baseUrl/model/apiKey in LLM tab)')
  }

  const allShadowTools = createShadowWorkspaceTools({ workspace: fmWorkspace })
  const fsTools = filterFsTools(allShadowTools)

  const registry = new ToolRegistry()
  registry.replaceAll(fsTools)

  const sessionStore = new ChromeSessionStore()
  const sessionId = await sessionStore.createSession({ metadata: { kind: 'options.files.agent' } })

  const runner = new ToolRunner({ tools: registry, sessionStore, contextFactory: async () => ({ workspace: fmWorkspace }) })
  const provider = new OpenAIResponsesProvider({ baseUrl: settings.baseUrl })

  const runtime = new AgentRuntime({
    sessionStore,
    toolRunner: runner,
    tools: registry,
    provider,
    model: settings.model,
    apiKey: settings.apiKey,
    systemPrompt: `You are a file management agent.
You can ONLY use filesystem tools to manage the shadow workspace (.agents/*).
Never claim you performed an action unless you actually called a tool.
Prefer to operate under .agents/skills and .agents/sessions.
Start by inspecting the relevant directory with ListDir when needed.`,
    maxSteps: 10,
  })

  return { sessionStore, sessionId, runtime }
}

let fileAgent = null

async function ensureFileAgentReady() {
  if (fileAgent) return fileAgent
  fileAgent = await createFileAgent()
  return fileAgent
}

async function onFileAgentClear() {
  fileAgentMessagesEl.innerHTML = ''
  setFileAgentStatus('idle')
  fileAgent = null
}

async function onFileAgentSend() {
  const text = String(fileAgentInputEl.value ?? '').trim()
  if (!text) return
  fileAgentInputEl.value = ''

  setFileAgentStatus('running...')
  fileAgentSendBtn.disabled = true
  fileAgentClearBtn.disabled = true

  let liveAssistantEl = null
  let liveText = ''

  try {
    await ensureFileAgentReady()
    const { sessionStore, sessionId, runtime } = fileAgent
    for await (const ev of runtime.runTurn({ sessionId, userText: text })) {
      if (ev.type === 'assistant.delta') {
        if (!liveAssistantEl) {
          liveAssistantEl = renderAgentEvent({ type: 'assistant.message', text: '' })
          const meta = liveAssistantEl.querySelector('.meta')
          if (meta) meta.textContent = 'assistant (streaming)'
          fileAgentMessagesEl.appendChild(liveAssistantEl)
        }
        liveText += ev.textDelta ?? ''
        const txt = liveAssistantEl.querySelector('.text')
        if (txt) txt.textContent = liveText
        scrollFileAgentToBottom()
        continue
      }

      if (ev.type === 'assistant.message' && liveAssistantEl) {
        const meta = liveAssistantEl.querySelector('.meta')
        if (meta) meta.textContent = 'assistant'
        const txt = liveAssistantEl.querySelector('.text')
        if (txt) txt.textContent = ev.text ?? ''
        liveAssistantEl = null
        liveText = ''
        scrollFileAgentToBottom()
        continue
      }

      fileAgentMessagesEl.appendChild(renderAgentEvent(ev))
      scrollFileAgentToBottom()
    }
  } catch (e) {
    fileAgentMessagesEl.appendChild(renderAgentEvent({ type: 'assistant.message', text: `Agent error: ${String(e?.message ?? e)}` }))
  } finally {
    setFileAgentStatus('idle')
    fileAgentSendBtn.disabled = false
    fileAgentClearBtn.disabled = false
  }
}

// -------------------------
// Boot
// -------------------------

tabLlm.addEventListener('click', () => setTabActive('llm'))
tabFiles.addEventListener('click', () => {
  setTabActive('files')
  if (!fmWorkspace) initFileManager().catch(() => {})
})

saveBtn.addEventListener('click', () =>
  saveSettings()
    .then(() => setStatus('saved'))
    .catch((e) => {
      setStatus('error')
      setResult({ ok: false, message: String(e?.message ?? e) })
    })
)

testBtn.addEventListener('click', () =>
  testLLM().catch((e) => {
    setStatus('error')
    setResult({ ok: false, message: String(e?.message ?? e) })
  })
)

fmUpBtn.addEventListener('click', () => {
  try {
    fmCwd = parentDir(fmCwd)
    refreshFm().catch((e) => setFmStatus(String(e?.message ?? e)))
  } catch (e) {
    setFmStatus(String(e?.message ?? e))
  }
})
fmRefreshBtn.addEventListener('click', () => refreshFm().catch((e) => setFmStatus(String(e?.message ?? e))))
fmOpenBtn.addEventListener('click', () => openFile(fmPathEl.value).catch((e) => setFmStatus(String(e?.message ?? e))))
fmNewFileBtn.addEventListener('click', () => newFile(fmPathEl.value).catch((e) => setFmStatus(String(e?.message ?? e))))
fmNewDirBtn.addEventListener('click', () => newDir(fmPathEl.value).catch((e) => setFmStatus(String(e?.message ?? e))))
fmDeleteBtn.addEventListener('click', () => deletePath(fmPathEl.value).catch((e) => setFmStatus(String(e?.message ?? e))))
fmSaveBtn.addEventListener('click', () => saveOpenFile().catch((e) => setFmStatus(String(e?.message ?? e))))

fileAgentSendBtn.addEventListener('click', () => onFileAgentSend().catch(() => setFileAgentStatus('error')))
fileAgentClearBtn.addEventListener('click', () => onFileAgentClear().catch(() => setFileAgentStatus('error')))
fileAgentInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onFileAgentSend().catch(() => setFileAgentStatus('error'))
})

setTabActive('llm')
setStatus('idle')
loadSettings().catch((e) => setResult({ ok: false, message: String(e?.message ?? e) }))
