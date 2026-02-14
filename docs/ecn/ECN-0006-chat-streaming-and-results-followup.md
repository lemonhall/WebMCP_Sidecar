# ECN-0006: Chat 需要流式体验 + 工具链路补齐（searchFlights → listFlights）

## 基本信息

- **ECN 编号**：ECN-0006
- **关联 PRD**：PRD-0002
- **关联 Req ID**：REQ-0002-003、REQ-0002-005
- **发现阶段**：v3（Phase 1）手工验收反馈
- **日期**：2026-02-14

## 变更原因

1) Chat 体验：当前实现为一次性等待 `complete()` 返回，用户主观体验为“卡很久”，不符合 side panel 聊天预期。

2) 工具结果：在 flightsearch demo 中，`searchFlights` 仅触发页面状态/导航（返回 “started”），真正结果需要继续调用 `listFlights`（或同类工具）拉取。否则 Agent 会给出“看不到结果”的反馈。

## 变更内容

- Provider 增加 `stream()` 并解析 SSE（即便服务端忽略 `stream:false` 也可处理）
- Runtime 支持 streamed turn，并在 UI 以 `assistant.delta` 逐步渲染
- 工具执行增加 demo 友好 follow-up：`searchFlights` 后自动尝试调用 `listFlights`（若存在）并展示其结果

## 影响范围

- 受影响文件：
  - `extension/agent/openaiResponsesProvider.js`
  - `extension/agent/agentRuntime.js`
  - `extension/sidepanel.js`
  - `extension/agent/toolRunner.js`

