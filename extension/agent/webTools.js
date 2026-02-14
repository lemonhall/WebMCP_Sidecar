function bindDefaultFetch() {
  const f = globalThis.fetch
  if (typeof f !== 'function') throw new Error('WebFetch: fetch is not available in this environment')
  return f.bind(globalThis)
}

function isIpv4(host) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(host)
}

function parseIpv4(host) {
  if (!isIpv4(host)) return null
  const parts = host.split('.').map((x) => Number.parseInt(x, 10))
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null
  return parts
}

function isPrivateIpv4(host) {
  const p = parseIpv4(host)
  if (!p) return false
  const [a, b] = p
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

function isPrivateIpv6(host) {
  const h = host.toLowerCase()
  if (h === '::1') return true
  if (h.startsWith('fe80:')) return true // link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true // unique local
  return false
}

function isBlockedHost(hostname) {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local')) return true
  if (isPrivateIpv4(host)) return true
  if (host.includes(':') && isPrivateIpv6(host)) return true
  return false
}

function validateUrl(url, allowPrivateNetworks) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('WebFetch: invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('WebFetch: only http/https URLs are allowed')
  if (!parsed.hostname) throw new Error('WebFetch: URL must include a hostname')
  if (!allowPrivateNetworks && isBlockedHost(parsed.hostname)) throw new Error('WebFetch: blocked hostname')
  return parsed
}

function hostOf(url) {
  try {
    return (new URL(url).hostname || '').toLowerCase()
  } catch {
    return ''
  }
}

function domainAllowed(url, allowed, blocked) {
  const host = hostOf(url)
  if (!host) return allowed.size === 0
  for (const b of blocked) {
    if (host === b || host.endsWith(`.${b}`)) return false
  }
  if (allowed.size === 0) return true
  for (const a of allowed) {
    if (host === a || host.endsWith(`.${a}`)) return true
  }
  return false
}

function extractDuckDuckGoUrl(href) {
  if (typeof href !== 'string' || !href) return ''
  try {
    const u = new URL(href, 'https://duckduckgo.com')
    const uddg = u.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
    return u.toString()
  } catch {
    return href
  }
}

export function createWebTools(options = {}) {
  const fetchImpl = options.fetchImpl ?? bindDefaultFetch()
  const maxBytesDefault = typeof options.maxBytes === 'number' && options.maxBytes > 0 ? Math.trunc(options.maxBytes) : 1024 * 1024
  const maxRedirectsDefault = typeof options.maxRedirects === 'number' && options.maxRedirects >= 0 ? Math.trunc(options.maxRedirects) : 5
  const allowPrivateNetworksDefault = Boolean(options.allowPrivateNetworks ?? false)

  const tavilyApiKey = typeof options.tavilyApiKey === 'string' && options.tavilyApiKey.trim() ? options.tavilyApiKey.trim() : ''
  const tavilyEndpoint = (options.tavilyEndpoint ?? 'https://api.tavily.com/search').toString()

  const tools = []

  tools.push({
    name: 'WebFetch',
    description: 'Fetch a URL over HTTP(S).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'http(s) URL.' },
        headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Request headers (optional).' },
        max_bytes: { type: 'integer', description: 'Max bytes to return (default: 1048576).' },
        max_redirects: { type: 'integer', description: 'Max redirects (default: 5).' },
        allow_private_networks: { type: 'boolean', description: 'Allow localhost/private IPs (default: false).' },
      },
      required: ['url'],
    },
    run: async (toolInput) => {
      const urlRaw = toolInput?.url
      const requestedUrl = typeof urlRaw === 'string' ? urlRaw.trim() : ''
      if (!requestedUrl) throw new Error("WebFetch: 'url' must be a non-empty string")

      const allowPrivateNetworks = toolInput?.allow_private_networks != null ? Boolean(toolInput.allow_private_networks) : allowPrivateNetworksDefault
      validateUrl(requestedUrl, allowPrivateNetworks)

      const headersIn = toolInput?.headers ?? {}
      if (headersIn != null && (typeof headersIn !== 'object' || Array.isArray(headersIn))) throw new Error("WebFetch: 'headers' must be an object")
      const headers = {}
      for (const [k, v] of Object.entries(headersIn)) headers[String(k).toLowerCase()] = String(v)

      const maxBytesIn = toolInput?.max_bytes
      const maxBytes =
        typeof maxBytesIn === 'number' && Number.isFinite(maxBytesIn) && maxBytesIn > 0 ? Math.trunc(maxBytesIn) : maxBytesDefault

      const maxRedirectsIn = toolInput?.max_redirects
      const maxRedirects =
        typeof maxRedirectsIn === 'number' && Number.isFinite(maxRedirectsIn) && maxRedirectsIn >= 0 ? Math.trunc(maxRedirectsIn) : maxRedirectsDefault

      const chain = [requestedUrl]
      let current = requestedUrl

      for (let i = 0; i <= maxRedirects; i += 1) {
        const res = await fetchImpl(current, { method: 'GET', headers, redirect: 'manual', credentials: 'omit' })
        const status = Number(res?.status ?? 0)
        const location = res?.headers?.get?.('location')

        if ([301, 302, 303, 307, 308].includes(status) && typeof location === 'string' && location) {
          if (i === maxRedirects) throw new Error(`WebFetch: too many redirects (>${maxRedirects})`)
          const next = new URL(location, current).toString()
          validateUrl(next, allowPrivateNetworks)
          current = next
          chain.push(current)
          continue
        }

        let body = new Uint8Array(await res.arrayBuffer())
        const truncated = body.byteLength > maxBytes
        if (truncated) body = body.slice(0, maxBytes)

        const contentType = res?.headers?.get?.('content-type') ?? null
        const text = new TextDecoder().decode(body)

        return {
          requested_url: requestedUrl,
          url: current,
          final_url: current,
          redirect_chain: chain,
          status,
          content_type: contentType,
          bytes: body.byteLength,
          truncated,
          text,
        }
      }

      throw new Error(`WebFetch: too many redirects (>${maxRedirects})`)
    },
  })

  tools.push({
    name: 'WebSearch',
    description: 'Search the web (Tavily if configured; otherwise DuckDuckGo HTML fallback).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query.' },
        max_results: { type: 'integer', description: 'Max results (default: 5).' },
        allowed_domains: { type: 'array', items: { type: 'string' }, description: 'Allowlist domains (optional).' },
        blocked_domains: { type: 'array', items: { type: 'string' }, description: 'Blocklist domains (optional).' },
      },
      required: ['query'],
    },
    run: async (toolInput) => {
      const queryRaw = toolInput?.query
      const query = typeof queryRaw === 'string' ? queryRaw.trim() : ''
      if (!query) throw new Error("WebSearch: 'query' must be a non-empty string")

      const maxResultsRaw = toolInput?.max_results ?? 5
      const maxResults = typeof maxResultsRaw === 'number' && Number.isFinite(maxResultsRaw) ? Math.trunc(maxResultsRaw) : 5
      if (maxResults <= 0) throw new Error("WebSearch: 'max_results' must be a positive integer")

      const allowedDomains = toolInput?.allowed_domains
      const blockedDomains = toolInput?.blocked_domains
      if (allowedDomains != null && !Array.isArray(allowedDomains)) throw new Error("WebSearch: 'allowed_domains' must be a list of strings")
      if (blockedDomains != null && !Array.isArray(blockedDomains)) throw new Error("WebSearch: 'blocked_domains' must be a list of strings")
      const allowed = new Set((allowedDomains ?? []).map((d) => String(d).toLowerCase()))
      const blocked = new Set((blockedDomains ?? []).map((d) => String(d).toLowerCase()))

      // Tavily mode (preferred if configured)
      if (tavilyApiKey) {
        const payload = { api_key: tavilyApiKey, query, max_results: maxResults }
        const res = await fetchImpl(tavilyEndpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'omit',
        })
        if (Number(res?.status ?? 0) >= 400) throw new Error(`WebSearch: HTTP ${res.status}`)
        const obj = res.json ? await res.json() : JSON.parse((await res.text?.()) ?? '{}')
        const resultsIn = obj?.results
        const results = []
        if (Array.isArray(resultsIn)) {
          for (const r of resultsIn) {
            if (!r || typeof r !== 'object') continue
            const url = r.url
            if (typeof url !== 'string' || !url) continue
            if (!domainAllowed(url, allowed, blocked)) continue
            results.push({ title: r.title ?? null, url, content: r.content ?? r.snippet ?? null, source: 'tavily' })
            if (results.length >= maxResults) break
          }
        }
        return { query, results, total_results: results.length, source: 'tavily' }
      }

      // DuckDuckGo HTML fallback (best-effort; no API key)
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const res = await fetchImpl(url, { method: 'GET', redirect: 'follow', credentials: 'omit' })
      if (Number(res?.status ?? 0) >= 400) throw new Error(`WebSearch: HTTP ${res.status}`)
      const html = res.text ? await res.text() : new TextDecoder().decode(new Uint8Array(await res.arrayBuffer()))

      const doc = new DOMParser().parseFromString(html, 'text/html')
      const anchors = Array.from(doc.querySelectorAll('a.result__a'))

      const results = []
      for (const a of anchors) {
        const title = (a.textContent ?? '').trim()
        const href = a.getAttribute('href') ?? ''
        const realUrl = extractDuckDuckGoUrl(href)
        if (!realUrl) continue
        if (!domainAllowed(realUrl, allowed, blocked)) continue

        const card = a.closest('.result') ?? a.parentElement
        const snippetEl = card?.querySelector?.('.result__snippet') ?? null
        const content = (snippetEl?.textContent ?? '').trim() || null

        results.push({ title: title || null, url: realUrl, content, source: 'duckduckgo' })
        if (results.length >= maxResults) break
      }

      return { query, results, total_results: results.length, source: 'duckduckgo' }
    },
  })

  return tools
}

