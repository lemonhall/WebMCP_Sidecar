;(function () {
  const STATE_KEY = '__wmcp_sidecar_main_bridge_state_v1__'
  const BRIDGE_NAMESPACE = '__wmcp_sidecar_bridge_v1__'

  const state = window[STATE_KEY] || (window[STATE_KEY] = { installed: false, tools: new Map() })
  if (state.installed) {
    // Best-effort: if re-injected, just ensure polyfill/hook is present.
    try {
      if ('modelContext' in navigator && navigator.modelContext && navigator.modelContext.__wmcp_sidecar_hooked__) return
    } catch (_) {
      // ignore
    }
  }

  function safeJson(value) {
    try {
      return { ok: true, value: JSON.parse(JSON.stringify(value)) }
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }

  const tools = state.tools

  function snapshotTools() {
    return Array.from(tools.values()).map((t) => ({
      name: t?.name,
      description: t?.description,
      inputSchema: t?.inputSchema,
      annotations: t?.annotations,
    }))
  }

  function hookModelContext(mc) {
    if (!mc || mc.__wmcp_sidecar_hooked__) return
    Object.defineProperty(mc, '__wmcp_sidecar_hooked__', { value: true, configurable: true })

    const origRegister = mc.registerTool?.bind(mc)
    if (typeof origRegister === 'function') {
      mc.registerTool = function (tool) {
        if (tool?.name) tools.set(tool.name, tool)
        return origRegister(tool)
      }
    }

    const origUnregister = mc.unregisterTool?.bind(mc)
    if (typeof origUnregister === 'function') {
      mc.unregisterTool = function (name) {
        tools.delete(name)
        return origUnregister(name)
      }
    }

    const origProvide = mc.provideContext?.bind(mc)
    if (typeof origProvide === 'function') {
      mc.provideContext = function (opts) {
        tools.clear()
        if (opts?.tools && Array.isArray(opts.tools)) {
          for (const t of opts.tools) {
            if (t?.name) tools.set(t.name, t)
          }
        }
        return origProvide(opts)
      }
    }

    const origClear = mc.clearContext?.bind(mc)
    if (typeof origClear === 'function') {
      mc.clearContext = function () {
        tools.clear()
        return origClear()
      }
    }
  }

  function tryInit() {
    if ('modelContext' in navigator && navigator.modelContext) {
      hookModelContext(navigator.modelContext)
      return
    }

    // Polyfill for stable Chrome: provide a minimal WebMCP-like surface so
    // WebMCP-aware pages (feature-detecting `navigator.modelContext`) can register tools.
    const poly = {
      registerTool: function (tool) {
        if (tool?.name) tools.set(tool.name, tool)
      },
      unregisterTool: function (name) {
        tools.delete(name)
      },
      provideContext: function (opts) {
        tools.clear()
        if (opts?.tools && Array.isArray(opts.tools)) {
          for (const t of opts.tools) {
            if (t?.name) tools.set(t.name, t)
          }
        }
      },
      clearContext: function () {
        tools.clear()
      },
    }

    try {
      Object.defineProperty(navigator, 'modelContext', {
        value: poly,
        configurable: true,
      })
    } catch (_) {
      // If navigator is non-extensible, we can't polyfill. In that case the
      // page won't register tools, and the Sidecar will show an empty list.
    }
  }

  tryInit()

  if (state.installed) return
  state.installed = true

  window.addEventListener('message', (event) => {
    const msg = event?.data
    if (!msg || msg.__ns !== BRIDGE_NAMESPACE) return
    if (msg.type !== 'request') return

    const { requestId, action, data } = msg
    const reply = (payload) => {
      window.postMessage(
        {
          __ns: BRIDGE_NAMESPACE,
          type: 'response',
          requestId,
          payload,
        },
        '*'
      )
    }

    ;(async () => {
      tryInit()

      if (action === 'listTools') {
        const cloned = safeJson(snapshotTools())
        if (!cloned.ok) return reply({ ok: false, error: cloned.error })
        return reply({ ok: true, tools: cloned.value })
      }

      if (action === 'callTool') {
        const toolName = data?.toolName
        const params = data?.params ?? {}
        if (typeof toolName !== 'string') return reply({ ok: false, error: 'toolName must be string' })
        const tool = tools.get(toolName)
        if (!tool) return reply({ ok: false, error: `tool not found: ${toolName}` })
        if (typeof tool.execute !== 'function') return reply({ ok: false, error: `tool.execute missing: ${toolName}` })

        const client = {
          requestUserInteraction: async (callback) => {
            if (typeof callback !== 'function') throw new Error('callback must be function')
            return await callback()
          },
        }

        const result = await tool.execute(params, client)
        const cloned = safeJson(result)
        if (!cloned.ok) return reply({ ok: false, error: `result not serializable: ${cloned.error}` })
        return reply({ ok: true, result: cloned.value })
      }

      return reply({ ok: false, error: `unknown action: ${String(action)}` })
    })().catch((e) => reply({ ok: false, error: String(e?.message ?? e) }))
  })
})()
