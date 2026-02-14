# v3 — Side Panel：Chat + 历史（默认界面）

## Goal

把 Side Panel 从“工具调试器”升级为“对话式入口”，并保留 Inspector 作为调试入口。

## PRD Trace

- REQ-0002-003
- REQ-0002-004
- REQ-0002-008

## Scope

做：
- Side Panel 默认页为 Chat（消息列表 + 输入框 + 发送）
- 历史消息持久化（最小实现：`chrome.storage.local`）
- 顶部入口切到 Inspector，再可切回 Chat
- Chat 流式渲染（`assistant.delta`），避免长时间无反馈（见 ECN-0006）
- 当 active tab URL 变化时：重载 tools 并以 `system.notice` 提示 Agent 需要重新评估工具（见 ECN-0007）

不做：
- 多会话管理（先单会话）
- 完整的日志/回放系统（先把核心事件可见化）

## Acceptance（硬口径）

- 打开 Side Panel 默认是 Chat（不是 Inspector）
- 发送一条消息后：
  - 立刻出现在消息列表
  - 重新打开 Side Panel，历史仍可见（至少最近 N 条）
- Inspector 能正常使用且不回归 Phase 0/2（`Refresh/Call` 仍可跑通）
- Chat 发起一次请求时，能看到 `assistant.delta` 的逐字/逐段输出（或至少有持续变化的输出）

## Verify

- 手工：侧边栏打开/关闭多次，确认历史存在；切换到 Inspector 调用 `searchFlights` 可成功
- 自动化：见 `docs/plan/v3-e2e-agent.md`

## Files（预计）

- `extension/sidepanel.html`
- `extension/sidepanel.js`
- `tests/e2e/*`

## Risks

- Side Panel 生命周期/重建频繁：必须持久化最小状态（历史、当前 tab 绑定信息）。
