# v1 Index — Phase 0 Kernel

- 日期：2026-02-13
- 关联 PRD：`docs/prd/PRD-0001-webmcp-sidecar.md`

## Milestones

### M1: Phase0-Kernel（done）

范围：
- 仅验证“发现工具 + 调用 execute + 返回结果”的内核闭环

DoD（硬口径）：
- `scripts/verify.ps1` exit code 为 0
- 在目标站点完成一次 `Refresh` 并看到非空工具列表（含 `name/description/inputSchema`）
- 能调用任一工具并在 Side Panel 看到返回结果或结构化错误（含 message）

验证方式：
- 结构校验：`powershell -File scripts/verify.ps1`
- 手工 E2E：见 `docs/plan/v1-phase0-kernel.md`

### M2: E2E-Playwright（done）

范围：
- 用 Playwright 自动跑通 Phase 0 “Refresh → Call” 流程

DoD（硬口径）：
- `npm run test:e2e` exit code 为 0

验证方式：
- `npm install`
- `npx playwright install chromium`
- `npm run test:e2e`

## Plans

- `docs/plan/v1-phase0-kernel.md`
- `docs/plan/v1-e2e-playwright.md`

## Traceability Matrix（v1）

| Req ID | v1 Plan | 验证 | 状态 |
|---|---|---|---|
| REQ-0001-001 | v1-phase0-kernel | 手工 E2E + verify.ps1 | done |
| REQ-0001-002 | v1-phase0-kernel | 手工 E2E | done |
| REQ-0001-003 | v1-phase0-kernel | 手工 E2E（工具可见） | done |
| REQ-0001-004 | v1-phase0-kernel | 手工 E2E（调用可返回） | done |
| REQ-0001-005 | v1-phase0-kernel | 手工 E2E（返回可渲染） | done |
| REQ-0001-006 | v1-phase0-kernel | 手工 E2E | done |
| REQ-0001-007 | v1-e2e-playwright | `npm run test:e2e` | done |

## ECN Index

- `docs/ecn/ECN-0001-modelcontexttesting-fastpath.md`
- `docs/ecn/ECN-0002-stable-chrome-polyfill.md`
- `docs/ecn/ECN-0003-playwright-e2e-gate.md`

## Differences（愿景 vs 现实）

- 证据记录：`docs/plan/v1-evidence.md`
- 未满足/延期项（进入 v2）：
  - Tool Inspector 展示 `inputSchema`（避免猜参数名）
  - `registerToolsChangedCallback` 监听工具变更（testing API 路径）
  - host 权限/注入策略从 demo 域名扩展到白名单配置
