const WMCP = {
  PANEL_TO_BG: {
    REFRESH: 'wmcp:refresh',
    CALL: 'wmcp:call',
    REGISTER_ORIGIN: 'wmcp:registerOrigin',
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

    if (message.type === WMCP.PANEL_TO_BG.REGISTER_ORIGIN) {
      const { originPattern, tabId } = message
      if (typeof originPattern !== 'string') throw new Error('originPattern must be string')
      const idBase = originPattern.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)
      const isolatedId = `wmcp_iso_${idBase}`
      const mainId = `wmcp_main_${idBase}`

      await chrome.scripting.unregisterContentScripts({ ids: [isolatedId, mainId] }).catch(() => {})

      await chrome.scripting.registerContentScripts([
        {
          id: isolatedId,
          matches: [originPattern],
          js: ['content_isolated.js'],
          runAt: 'document_start',
          persistAcrossSessions: true,
        },
        {
          id: mainId,
          matches: [originPattern],
          js: ['main_bridge.js'],
          runAt: 'document_start',
          persistAcrossSessions: true,
          world: 'MAIN',
        },
      ])

      // Best-effort immediate injection for current tab, so user doesn't need to reload.
      if (typeof tabId === 'number') {
        await chrome.scripting
          .executeScript({
            target: { tabId },
            files: ['main_bridge.js'],
            world: 'MAIN',
          })
          .catch(() => {})
        await chrome.scripting
          .executeScript({
            target: { tabId },
            files: ['content_isolated.js'],
          })
          .catch(() => {})
      }

      sendResponse({ ok: true })
      return
    }

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
