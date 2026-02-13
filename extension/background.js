const WMCP = {
  PANEL_TO_BG: {
    REFRESH: 'wmcp:refresh',
    CALL: 'wmcp:call',
  },
  BG_TO_CS: {
    LIST_TOOLS: 'wmcp:listTools',
    CALL_TOOL: 'wmcp:callTool',
  },
}

chrome.runtime.onInstalled?.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {})
})

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]
  if (!tab?.id) throw new Error('No active tab')
  return tab.id
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ;(async () => {
    if (!message || typeof message !== 'object') return

    if (message.type === WMCP.PANEL_TO_BG.REFRESH) {
      const tabId = await getActiveTabId()
      const result = await chrome.tabs.sendMessage(tabId, { type: WMCP.BG_TO_CS.LIST_TOOLS })
      sendResponse({ ok: true, tools: result?.tools ?? [], error: result?.error ?? null })
      return
    }

    if (message.type === WMCP.PANEL_TO_BG.CALL) {
      const { toolName, params } = message
      if (typeof toolName !== 'string') throw new Error('toolName must be string')
      const tabId = await getActiveTabId()
      const result = await chrome.tabs.sendMessage(tabId, {
        type: WMCP.BG_TO_CS.CALL_TOOL,
        toolName,
        params: params ?? {},
      })
      sendResponse({ ok: true, result })
      return
    }
  })()
    .catch((error) => {
      sendResponse({ ok: false, error: String(error?.message ?? error) })
    })

  return true
})
