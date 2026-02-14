# v2 — Tool Inspector（显示 inputSchema + 示例填充）

## Goal

Side Panel 不再要求用户“猜参数名/类型”。选中工具后直接显示 `inputSchema`，并提供示例参数一键填充。

## PRD Trace

- REQ-0001-008

## Acceptance

- 选中工具后能看到 `inputSchema` JSON
- 点击 `Fill Example` 会把示例 JSON 写入 Params 文本框（可被 `Call` 使用）

## Verify

- 手工：打开 demo → Refresh → 选 `searchFlights` → 确认 schema 显示 → Fill Example → Call
- 自动化：`npm run test:e2e`

