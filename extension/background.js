const WMCP = {
  PANEL_TO_BG: {
    REFRESH: 'wmcp:refresh',
    CALL: 'wmcp:call',
    GET_ACTIVE_TAB: 'wmcp:getActiveTab',
  },
  BG_TO_CS: {
    LIST_TOOLS: 'wmcp:listTools',
    CALL_TOOL: 'wmcp:callTool',
  },
}

chrome.runtime.onInstalled?.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {})
})

let lastHttpTabId = null

function isHttpUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))
}

async function recordIfHttpTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId)
    if (tab?.id && isHttpUrl(tab.url)) lastHttpTabId = tab.id
  } catch (_) {
    // ignore
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  recordIfHttpTab(activeInfo.tabId)
})

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId })
    if (tab?.id) await recordIfHttpTab(tab.id)
  } catch (_) {
    // ignore
  }
})

async function getActiveTabId() {
  if (typeof lastHttpTabId === 'number') return lastHttpTabId

  const tabs = await chrome.tabs.query({ currentWindow: true })
  const activeHttp = tabs.find((t) => t.active && isHttpUrl(t.url))
  if (activeHttp?.id) return activeHttp.id

  const anyHttp = tabs.find((t) => isHttpUrl(t.url))
  if (anyHttp?.id) return anyHttp.id

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!active?.id) throw new Error('No active tab')
  return active.id
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ;(async () => {
    if (!message || typeof message !== 'object') return

    if (message.type === WMCP.PANEL_TO_BG.GET_ACTIVE_TAB) {
      const tabId = await getActiveTabId()
      try {
        const tab = await chrome.tabs.get(tabId)
        sendResponse({
          ok: true,
          tab: { id: tab?.id ?? null, url: tab?.url ?? null, title: tab?.title ?? null },
        })
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message ?? e) })
      }
      return
    }

    if (message.type === WMCP.PANEL_TO_BG.REFRESH) {
      const tabId = await getActiveTabId()
      try {
        const result = await chrome.tabs.sendMessage(tabId, { type: WMCP.BG_TO_CS.LIST_TOOLS })
        sendResponse({ ok: true, tools: result?.tools ?? [], error: result?.error ?? null })
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message ?? e) })
      }
      return
    }

    if (message.type === WMCP.PANEL_TO_BG.CALL) {
      const { toolName, params } = message
      if (typeof toolName !== 'string') throw new Error('toolName must be string')
      const tabId = await getActiveTabId()
      try {
        const result = await chrome.tabs.sendMessage(tabId, {
          type: WMCP.BG_TO_CS.CALL_TOOL,
          toolName,
          params: params ?? {},
        })
        sendResponse({ ok: true, result })
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message ?? e) })
      }
      return
    }
  })()
    .catch((error) => {
      sendResponse({ ok: false, error: String(error?.message ?? error) })
    })

  return true
})
