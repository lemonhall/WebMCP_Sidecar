# ECN-0002: 支持普通 Chrome（无 flags）通过 polyfill 跑通 Phase 0

- 日期：2026-02-13
- 关联 PRD：`docs/prd/PRD-0001-webmcp-sidecar.md`

## 变更原因

Canary + flags 路径下可以用 `navigator.modelContextTesting` 作为 Consumer API 直接 `listTools/executeTool`。

但普通稳定版 Chrome 通常没有 `modelContextTesting`，也没有原生 `navigator.modelContext`。要在稳定版上跑通官方 demo（其会 feature-detect `navigator.modelContext` 后才注册工具），必须由扩展在页面 MAIN world **尽早注入 polyfill**，让页面完成工具注册，然后由 Sidecar 再调用工具的 `execute()`。

## 变更内容

- 将 `extension/main_bridge.js` 作为 **MAIN world content script** 在 `document_start` 注入，避免用 `<script src=chrome-extension://...>` 的方式被页面 CSP 阻断。
- 当页面不存在 `navigator.modelContext` 时，MAIN bridge 安装一个最小 polyfill（`registerTool/unregisterTool/provideContext/clearContext`）以捕获工具对象（含 `execute` 函数引用）。

## 影响范围

- 受影响需求：REQ-0001-006（扩大验证环境：Canary/Stable 均可尝试）
- 受影响代码：`extension/manifest.json`、`extension/main_bridge.js`
