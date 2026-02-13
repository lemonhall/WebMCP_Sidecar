const statusEl = document.getElementById('status')
const refreshBtn = document.getElementById('refresh')
const callBtn = document.getElementById('call')
const toolsSelect = document.getElementById('tools')
const paramsEl = document.getElementById('params')
const resultEl = document.getElementById('result')

function setStatus(text) {
  statusEl.textContent = text
}

function setResult(obj) {
  resultEl.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)
}

function setTools(tools) {
  toolsSelect.innerHTML = ''
  for (const tool of tools) {
    const opt = document.createElement('option')
    opt.value = tool.name
    opt.textContent = tool.description ? `${tool.name} — ${tool.description}` : tool.name
    toolsSelect.appendChild(opt)
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

refreshTools().catch((e) => setResult(String(e?.message ?? e)))
