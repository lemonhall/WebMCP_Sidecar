const BRIDGE_NAMESPACE = '__wmcp_sidecar_bridge_v1__'

function createRequestId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function safeJsonClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function hasModelContextTesting() {
  const mct = navigator?.modelContextTesting
  return !!mct && typeof mct.listTools === 'function' && typeof mct.executeTool === 'function'
}

function normalizeToolsList(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && Array.isArray(value.tools)) return value.tools
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.tools)) return parsed.tools
    } catch (_) {
      return []
    }
  }
  return []
}

async function listToolsViaTesting() {
  const tools = await navigator.modelContextTesting.listTools()
  return safeJsonClone(normalizeToolsList(tools))
}

async function callToolViaTesting(toolName, params) {
  try {
    const result = await navigator.modelContextTesting.executeTool(toolName, params ?? {})
    return safeJsonClone(result)
  } catch (e1) {
    const argsJson = JSON.stringify(params ?? {})
    const result = await navigator.modelContextTesting.executeTool(toolName, argsJson)
    return safeJsonClone(result)
  }
}

function postToMain(payload) {
  window.postMessage(
    safeJsonClone({
      __ns: BRIDGE_NAMESPACE,
      ...payload,
    }),
    '*'
  )
}

function callMain(action, data) {
  const requestId = createRequestId()
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve({ ok: false, error: 'timeout' })
    }, 5000)

    function onMessage(event) {
      const msg = event?.data
      if (!msg || msg.__ns !== BRIDGE_NAMESPACE) return
      if (msg.type !== 'response' || msg.requestId !== requestId) return
      clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      resolve(msg.payload)
    }

    window.addEventListener('message', onMessage)
    postToMain({ type: 'request', requestId, action, data })
  })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ;(async () => {
    if (!message || typeof message !== 'object') return

    if (message.type === 'wmcp:listTools') {
      if (hasModelContextTesting()) {
        const tools = await listToolsViaTesting()
        sendResponse({ tools, error: null })
        return
      }
      const payload = await callMain('listTools', {})
      sendResponse({ tools: payload.ok ? payload.tools : [], error: payload.ok ? null : payload.error })
      return
    }

    if (message.type === 'wmcp:callTool') {
      const { toolName, params } = message
      if (hasModelContextTesting()) {
        const result = await callToolViaTesting(toolName, params)
        sendResponse({ ok: true, result })
        return
      }
      const payload = await callMain('callTool', { toolName, params })
      sendResponse(payload)
      return
    }
  })().catch((error) => {
    sendResponse({ ok: false, error: String(error?.message ?? error) })
  })
  return true
})

// Phase 0 injection: add a <script> tag for the extension resource.
// Note: page CSP can block this approach. Phase 1 will switch to chrome.scripting.executeScript({ world: 'MAIN' }).
;(function ensureMainBridge() {
  // As of v1, MAIN bridge is loaded as a dedicated MAIN-world content script
  // (see manifest.json `content_scripts[].world = "MAIN"`). Keep this stub
  // to avoid older notes becoming misleading if referenced elsewhere.
  return
})()
