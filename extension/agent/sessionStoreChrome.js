function now() {
  return Date.now()
}

function randomId() {
  return Math.random().toString(16).slice(2)
}

const META_KEY = 'wmcp.agent.sessions.meta.v1'
const EVENTS_KEY = 'wmcp.agent.sessions.events.v1'

export class ChromeSessionStore {
  async createSession(options = {}) {
    const sessionId = `s_${now()}_${randomId()}`
    const meta = { sessionId, createdAt: now(), metadata: options.metadata ?? {} }

    const stored = await chrome.storage.local.get([META_KEY, EVENTS_KEY])
    const metaMap = stored?.[META_KEY] && typeof stored[META_KEY] === 'object' ? stored[META_KEY] : {}
    const eventsMap = stored?.[EVENTS_KEY] && typeof stored[EVENTS_KEY] === 'object' ? stored[EVENTS_KEY] : {}

    metaMap[sessionId] = meta
    eventsMap[sessionId] = []

    await chrome.storage.local.set({ [META_KEY]: metaMap, [EVENTS_KEY]: eventsMap })
    return sessionId
  }

  async readMeta(sessionId) {
    const stored = await chrome.storage.local.get(META_KEY)
    const metaMap = stored?.[META_KEY] && typeof stored[META_KEY] === 'object' ? stored[META_KEY] : {}
    return metaMap?.[sessionId] ?? null
  }

  async appendEvent(sessionId, event) {
    const stored = await chrome.storage.local.get(EVENTS_KEY)
    const eventsMap = stored?.[EVENTS_KEY] && typeof stored[EVENTS_KEY] === 'object' ? stored[EVENTS_KEY] : {}
    const arr = Array.isArray(eventsMap?.[sessionId]) ? eventsMap[sessionId] : []
    arr.push(event)
    eventsMap[sessionId] = arr
    await chrome.storage.local.set({ [EVENTS_KEY]: eventsMap })
  }

  async readEvents(sessionId) {
    const stored = await chrome.storage.local.get(EVENTS_KEY)
    const eventsMap = stored?.[EVENTS_KEY] && typeof stored[EVENTS_KEY] === 'object' ? stored[EVENTS_KEY] : {}
    const arr = Array.isArray(eventsMap?.[sessionId]) ? eventsMap[sessionId] : []
    return arr
  }

  async clearEvents(sessionId) {
    const stored = await chrome.storage.local.get(EVENTS_KEY)
    const eventsMap = stored?.[EVENTS_KEY] && typeof stored[EVENTS_KEY] === 'object' ? stored[EVENTS_KEY] : {}
    eventsMap[sessionId] = []
    await chrome.storage.local.set({ [EVENTS_KEY]: eventsMap })
  }
}

