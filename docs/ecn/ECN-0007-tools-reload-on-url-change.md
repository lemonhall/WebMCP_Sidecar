# ECN-0007: URL 变化触发工具重载（system.notice 注入到 Agent）

## 基本信息

- **ECN 编号**：ECN-0007
- **关联 PRD**：PRD-0002
- **关联 Req ID**：REQ-0002-005、REQ-0002-006
- **发现阶段**：v3（Phase 1）手工验收与通用性审查
- **日期**：2026-02-14

## 变更原因

在 flightsearch demo 中，`searchFlights` 会触发页面导航到 results URL。页面导航意味着：

- 页面 JS 上下文重建
- WebMCP 工具可能发生变化（注入/卸载/重新注册）

如果 runtime 在“导航后”仍使用旧的 tools registry，会导致 Agent 做出错误判断（例如“没有 listFlights”或无法继续拉取结果）。

同时，不能为 demo 写死链路（例如 `searchFlights → listFlights`），否则失去通用意义与可测性。

## 变更内容

- **通用策略**：当检测到 active tab URL 发生变化时：
  1) 立即重载 tools（重新 `wmcp:refresh` 并 `registry.replaceAll`）
  2) 向 session events 追加一条 `system.notice`（提示工具已重载，需要重新评估工具再继续，不要直接回答用户任务）
- 取消 demo 写死 follow-up（不再强行推断 “searchFlights 后一定要 listFlights”）

## 影响范围

- 受影响文件：
  - `extension/sidepanel.js`
  - `extension/agent/rebuild.js`（让 `system.notice` 进入 provider input）
  - `extension/agent/toolRunner.js`（移除 demo 写死 follow-up）

