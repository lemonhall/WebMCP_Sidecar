const statusEl = document.getElementById('status')
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

function setResult(obj) {
  resultEl.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)
}

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

async function refreshTools() {
  setStatus('refreshing...')
  setResult('')
  const res = await chrome.runtime.sendMessage({ type: 'wmcp:refresh' })
  if (!res?.ok) {
    setStatus('error')
    setResult(res?.error ?? 'unknown error')
    return
  }
  setTools(res.tools ?? [])
  setStatus(`tools=${(res.tools ?? []).length}`)
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

  // Known-good demo params for humans (react-flightsearch).
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
  const res = await chrome.runtime.sendMessage({ type: 'wmcp:call', toolName, params })
  if (!res?.ok) {
    setStatus('error')
    setResult(res?.error ?? 'unknown error')
    return
  }
  setStatus('done')
  setResult(res.result)
}

refreshBtn.addEventListener('click', refreshTools)
callBtn.addEventListener('click', callTool)
grantBtn.addEventListener('click', () => grantCurrentSite().catch((e) => setResult(String(e?.message ?? e))))
fillExampleBtn.addEventListener('click', fillExample)
toolsSelect.addEventListener('change', renderSelectedTool)

refreshTools().catch((e) => setResult(String(e?.message ?? e)))
refreshSite().catch(() => {})
