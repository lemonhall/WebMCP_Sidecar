# PRD-0002: WebMCP Sidecar（Phase 1 — Agent MVP）

- 状态：草案 / Phase 1 施工口径
- 日期：2026-02-14
- 依赖：Phase 0/2 已完成（PRD-0001 + v2）

## Vision

把 Phase 0 的“工具发现/调用内核”升级成一个**可用的浏览器侧 Agent**：

- Side Panel 默认是 **Chat + 历史**（而不是 Inspector）
- Agent 可以在对话中**选择并调用页面工具**（WebMCP `navigator.modelContext` 工具）
- 用户可以在 Settings（Options Page）里配置 LLM（`baseUrl/apiKey/model`）并做连通性测试

> 注：SKILL 与更深的自动化能力已确认一定会做，但不作为 Phase 1 的第一优先级（进入 Phase 1.5 / Phase 2 再展开）。

## Scope（Phase 1）

做：
- Side Panel 主界面：Chat + 历史（持久化）
- Tool Inspector：保留（作为入口/工具调试页），不放到 Settings
- Settings（Options Page）：
  - 配置 `baseUrl/apiKey/model`
  - “Test LLM” 按钮（最短闭环）
- Agent Runtime（复用 `openagentic-sdk-ts` 的核心抽象）：
  - Provider：至少支持 OpenAI-compatible（`baseUrl` 可配）
  - Tool Adapter：把当前页面工具适配成 Agent 工具（底层仍走现有 Phase 0 `list/call` 管线）
- 安全边界：
  - **secrets 只在扩展域**（SW/Side Panel/Options），不得进入 MAIN world
  - MAIN world 仅承载 bridge + tool.execute 调用（无网络、无 key）

不做（Phase 1 明确不做）：
- SKILL 注入体系（定义规范/管理器/示例 SKILL）
- Web Store 上架与审核策略优化
- 多 Provider 深度兼容（国产模型协议差异：先留到 Phase 1+）
- 产品级权限向导（仍保持最小可用）

## Requirements（Phase 1）

### REQ-0002-001：Options Page（Settings）可配置 LLM

- 需求：提供 Options Page，支持配置并持久化：
  - `baseUrl`（OpenAI-compatible）
  - `apiKey`
  - `model`
- 验收：刷新/重启浏览器后配置仍存在；UI 无未捕获异常。

### REQ-0002-002：Options Page 提供 “Test LLM” 最短闭环

- 需求：Settings 提供 “Test LLM” 按钮，发起一次最小请求并显示结果/错误。
- 验收：配置正确时显示成功；配置错误时显示结构化错误（含 message）。

### REQ-0002-003：Side Panel 默认界面为 Chat + 历史

- 需求：Side Panel 打开时默认展示 Chat 输入框与历史消息区。
- 验收：发送一条消息后，消息追加到历史；刷新 Side Panel 仍能看到历史（至少本地持久化一次）。

### REQ-0002-004：Tool Inspector 保留且可从主界面进入

- 需求：Inspector 不消失，作为调试工具页保留；从 Chat UI 顶部入口进入。
- 验收：能切换到 Inspector，仍可 Refresh/Call；能回到 Chat。

### REQ-0002-005：Agent 能调用页面工具并呈现工具事件

- 需求：Agent 在对话中触发工具调用时，UI 明确呈现：
  - tool name
  - args（JSON）
  - result/error（JSON）
- 验收：对 demo 页 `searchFlights` 触发一次工具调用，UI 看到调用事件与结果。

### REQ-0002-006：Tool Adapter 复用现有 Phase 0 管线

- 需求：Agent 工具调用必须复用既有 `Panel → SW → CS → MAIN` 管线（避免双实现）。
- 验收：Phase 0 Inspector 的 `Call` 与 Agent 触发的 tool call 都走同一套后端消息协议（同一个 handler/消息类型）。

### REQ-0002-007：安全约束（secrets 不进 MAIN）

- 需求：任何 `apiKey/baseUrl` 不得通过 `postMessage` 或参数传入 MAIN world。
- 验收：代码审计可证明：MAIN bridge 无 secrets；网络请求仅发生在扩展域。

### REQ-0002-008：不回归 Phase 0/2（现有验证必须仍通过）

- 需求：升级 Phase 1 不得破坏 Phase 0/2 的闭环能力。
- 验收：`powershell -File scripts/verify.ps1` 与 `npm run test:e2e` 仍通过。

### REQ-0002-009：新增 Phase 1 的 E2E Gate

- 需求：新增至少 1 条 Playwright E2E 覆盖 Phase 1 核心流程（Chat → 工具调用事件可见）。
- 验收：CI/本机 `npm run test:e2e` 仍为 exit code 0（或新增脚本并在 CI 中纳入 Gate）。

## 参考资料（证据链）

- 既有 PRD：`docs/prd/PRD-0001-webmcp-sidecar.md`
- MAIN world 边界研究：`docs/research/deep-research/MV3-chrome-scripting-world-MAIN-Boundaries-Deep-Research-2026-02-13.md`
- sidePanel API 研究：`docs/research/deep-research/Chrome-sidePanel-API-Deep-Research.md`
- modelContext/polyfill 研究：`docs/research/deep-research/WebMCP-navigator-modelContext-API-Deep-Research-2026-02-13.md`
- SDK 参考：`https://github.com/lemonhall/openagentic-sdk-ts`
- UI/Provider 坑参考：`https://github.com/lemonhall/Smart_Bookmark`

