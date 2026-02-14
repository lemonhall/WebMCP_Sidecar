const baseUrlEl = document.getElementById('baseUrl')
const modelEl = document.getElementById('model')
const apiKeyEl = document.getElementById('apiKey')
const saveBtn = document.getElementById('save')
const testBtn = document.getElementById('test')
const statusEl = document.getElementById('status')
const resultEl = document.getElementById('result')

const STORAGE_KEY = 'settings.llm.v1'

function setStatus(text) {
  statusEl.textContent = text
}

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

function buildUrl(baseUrl, path) {
  const u = new URL(baseUrl)
  const basePath = u.pathname.replace(/\/+$/, '')
  u.pathname = `${basePath}${path}`
  return u.toString()
}

function buildOpenAICompatibleUrl(baseUrl, apiPath) {
  const u = new URL(baseUrl)
  const basePath = u.pathname.replace(/\/+$/, '')
  const endsWithV1 = /\/v1$/i.test(basePath)

  // Allow user to configure baseUrl either as:
  // - https://host            (we call /v1/...)
  // - https://host/v1         (we call /... without duplicating /v1)
  // - https://host/prefix/v1  (same behavior)
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

async function ensureHostPermissionForBaseUrl(baseUrl) {
  const origin = new URL(baseUrl).origin
  const originPattern = `${origin}/*`

  const has = await chrome.permissions.contains({ origins: [originPattern] })
  if (has) return { ok: true, originPattern, already: true }

  const granted = await chrome.permissions.request({ origins: [originPattern] })
  if (!granted) return { ok: false, originPattern, error: 'Permission request was denied' }
  return { ok: true, originPattern, already: false }
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

  const perm = await ensureHostPermissionForBaseUrl(baseUrl)
  if (!perm.ok) {
    setStatus('error')
    setResult({ ok: false, message: perm.error, originPattern: perm.originPattern })
    return
  }

  const responsesUrl = buildOpenAICompatibleUrl(baseUrl, '/v1/responses')
  // Match Smart_Bookmark's "Test LLM connection" request shape (OpenAI Responses API).
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

loadSettings().catch((e) => setResult({ ok: false, message: String(e?.message ?? e) }))
