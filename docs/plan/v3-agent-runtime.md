# v3 — Agent Runtime（openagentic-sdk-ts + Tool Adapter）

## Goal

在扩展域内运行一个最小 Agent Runtime，使其能使用页面工具（WebMCP）完成一次真实的“对话 → 工具调用 → 回答”的闭环，并把工具事件呈现给用户。

## PRD Trace

- REQ-0002-005
- REQ-0002-006
- REQ-0002-007
- REQ-0002-008

## Scope

做：
- 引入并复用 `openagentic-sdk-ts` 的运行时抽象（session / events / tools / provider）
- Provider：先支持 1 种 OpenAI-compatible 形态（`baseUrl/apiKey/model`）
- Provider 支持 `stream`（SSE），并向 UI 发出 `assistant.delta`（见 ECN-0006）
- Tool Adapter：
  - 把页面工具（来自现有 `Refresh` 列表）转成 Agent 工具定义
  - tool.run 时复用现有 Phase 0 `callTool` 消息协议
- 工具重载：当 active tab URL 变化时重载 tools，并以 `system.notice` 形式注入到 Agent（见 ECN-0007）
- 事件呈现：Agent 的 tool call 事件在 Chat UI 可见（name/args/result/error）

不做：
- 多 Provider 深度兼容
- SKILL 注入与站点自动化（后续）

## Acceptance（硬口径）

- 在 demo 页发送一条固定 prompt（例如“查 2026-02-14 LON 到 NYC 往返 2 人”）：
  - Agent 至少触发 1 次 `searchFlights` 工具调用
  - UI 展示 tool call 事件与返回结果
  - 最终 assistant 输出一段总结（不要求质量，只要求闭环）
- secrets 不进入 MAIN world（代码审计可证明）
- Phase 0 Inspector 回归测试仍通过

## Verify

- 手工：按上述固定 prompt 走通一次闭环
- 自动化：见 `docs/plan/v3-e2e-agent.md`

## Files（预计）

- `extension/sidepanel.js`（集成 runtime）
- `extension/background.js`（如需转发/存储）
- `extension/*`（工具适配层、provider 封装）
- `tests/e2e/*`

## Risks

- SDK 抽象与 MV3 运行环境（SW/SidePanel/Options）存在差异：优先把 runtime 放在 Side Panel 页面里（UI 线程可见、易调试）。
- SSE/streaming 格式差异：Phase 1 先不追求“全兼容”，先把最短闭环跑通。
