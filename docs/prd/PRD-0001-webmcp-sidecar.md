# PRD-0001: WebMCP Sidecar（Phase 0 验证内核）

- 状态：草案 / 概念验证阶段
- 日期：2026-02-13
- 来源：由 `docs/archive/WebMCP-Sidecar-PRD-0.2.md` 归档提炼，并补齐 Req ID + 验收口径

## Vision

做一个基于 Chrome 扩展（MV3 + Side Panel）的 Sidecar：在用户浏览网页时，右侧 Side Panel 提供一个 AI Agent，能够发现并调用页面通过 WebMCP（`navigator.modelContext`）注册的工具，并把工具调用过程与结果透明呈现给用户。

Phase 0 目标：验证“发现工具 → 调用工具 execute → 返回结果”闭环可跑通（先不接入真实 LLM）。

## Scope（Phase 0）

- 支持已启用 WebMCP 的页面（优先官方 demo）工具发现与调用
- Side Panel 最小 UI：刷新工具列表 + 选择工具 + 输入 JSON 参数 + 显示 JSON 结果
- Service Worker：消息路由（Panel ⇄ tab）与最小校验
- ISOLATED Content Script：MAIN bridge 的安全中继（`postMessage` 过滤 + requestId 关联）
- MAIN world bridge：hook tool 注册 + list/call（极薄、无敏感信息）
- Phase 0 允许存在 `navigator.modelContextTesting` 时优先走 testing API（减少注入与 CSP 风险）；无该 API 时再 fallback 到 MAIN bridge（见 ECN-0001）
- 普通稳定版 Chrome（无 `modelContextTesting`/无原生 WebMCP）通过 MAIN world polyfill 让 demo 页面完成工具注册（见 ECN-0002）

## Non-Goals（Phase 0 明确不做）

- 不做 Web Store 上架
- 不做 SKILL 注入 / polyfill（未支持 WebMCP 的站点留到 Phase 1+）
- 不做多模型切换、流式 UI、完整的操作日志系统
- 不做 `requestUserInteraction` 的完整产品级 UX（仅留最小 stub）

## Requirements

### REQ-0001-001：Side Panel 可用

- 需求：扩展提供 Side Panel 页面，能够显示按钮与结果区域。
- 验收：加载 `extension/` 后，打开 Side Panel，UI 可见且无未捕获异常。

### REQ-0001-002：三层通信闭环（Panel ⇄ SW ⇄ CS ⇄ MAIN）

- 需求：Side Panel 能请求“刷新工具列表”和“调用工具”；Service Worker 能路由到当前活动 tab；ISOLATED content script 能与 MAIN bridge 通过 `window.postMessage` 交互并回传结果。
- 验收：在目标页面点击 `Refresh`，Side Panel 显示工具列表；点击 `Call` 后能显示工具返回值或结构化错误（含 message）。

### REQ-0001-003：工具注册表与 hook

- 需求：当 `navigator.modelContext` 存在时，MAIN bridge hook：`registerTool/unregisterTool/provideContext/clearContext`，并维护工具注册表（name → 元数据 + execute 引用）。
- 验收：页面注册工具后，`Refresh` 返回的列表包含工具 `name/description/inputSchema/annotations`；不跨边界传递 execute 函数。

### REQ-0001-004：工具调用（execute）

- 需求：从 Side Panel 发起工具调用请求后，MAIN bridge 以 `tool.execute(input, client)` 调用并 await 结果，并把结果传回 Side Panel。
- 验收：对官方 demo 页面中的任一工具调用，Side Panel 显示非空结果（或可解释的失败原因）。

### REQ-0001-005：跨边界载荷强制 JSON-serializable

- 需求：跨 MAIN/ISOLATED/SW/Panel 边界传递的数据必须是 JSON 可序列化；所有 MAIN → ISOLATED 响应在 MAIN 内先做显式 JSON clone；不可序列化时返回结构化错误。
- 验收：Side Panel 永远可渲染结果（JSON 或错误对象），不会出现“静默失败”。

### REQ-0001-006：Phase 0 目标站点验证

- 需求：至少在 1 个已支持 WebMCP 的页面上验证闭环（优先官方 demo）。
- 验收：按 `docs/plan/v1-phase0-kernel.md` 的手工 E2E 步骤完成一次“发现工具 + 调用工具”。

### REQ-0001-007：自动化 E2E（Playwright）

- 需求：提供可重复运行的 Playwright E2E，用于验证 Phase 0 核心用户流程（`Refresh → Call searchFlights`），避免长期依赖手工回归。
- 验收：`npm run test:e2e` 在本机通过（至少 1 条用例全绿）。

### REQ-0001-008：Tool Inspector 显示 Schema + 示例填充（v2）

- 需求：Side Panel 选中工具后展示 `inputSchema`（JSON），并提供“一键填充示例参数”能力，减少手工试错。
- 验收：选中 `searchFlights` 时能看到 schema；点击 Fill Example 后可直接 Call 成功。

### REQ-0001-009：可选 Host 权限与站点授权（v2）

- 需求：Side Panel 提供“一键授权当前站点”的可选 host 权限申请，并在授权成功后对当前 tab 立即注入脚本（无需刷新页面）。
- 验收：在非 demo 域名页面点击 Grant 后，权限申请成功，且不会报 “Receiving end does not exist”。

### REQ-0001-010：CI Gate（v2）

- 需求：在 GitHub Actions（Windows）上运行结构校验与 Playwright E2E，作为合并门槛。
- 验收：workflow 通过（verify + e2e）。

## 安全与隐私约束（Phase 0）

- API key / 模型配置不进入 MAIN world
- 所有来自页面（MAIN）的输入都视为不可信；SW/Panel 层做 type + shape 的最小校验

## 参考资料（证据链）

- `docs/research/deep-research/WebMCP-navigator-modelContext-API-Deep-Research-2026-02-13.md`
- `docs/research/deep-research/MV3-chrome-scripting-world-MAIN-Boundaries-Deep-Research-2026-02-13.md`
- `docs/research/deep-research/Chrome-sidePanel-API-Deep-Research.md`
- `docs/archive/WebMCP-Sidecar-PRD-0.2.md`
