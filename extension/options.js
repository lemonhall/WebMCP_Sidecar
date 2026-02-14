import { OPFSWorkspace } from './agent/opfsWorkspace.js'

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
    kind.textContent = ent.type === 'dir' ? 'DIR' : 'FILE'
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

setTabActive('llm')
setStatus('idle')
loadSettings().catch((e) => setResult({ ok: false, message: String(e?.message ?? e) }))

