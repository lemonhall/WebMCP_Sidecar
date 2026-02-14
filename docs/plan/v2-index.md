# v2 Index — Tool Inspector + Permissions + CI

- 日期：2026-02-14
- 关联 PRD：`docs/prd/PRD-0001-webmcp-sidecar.md`

## Milestones

### M1: Tool-Inspector-Schema（done）

DoD：
- Side Panel 选中工具后显示 `inputSchema`（JSON）
- 提供“一键填充示例参数”按钮（至少对 `searchFlights` 有已验证模板）

验证：
- 手工：按 `docs/plan/v2-tool-inspector.md`
- Playwright：`npm run test:e2e` 仍通过

### M2: Optional-Permissions-Whitelist（done）

DoD：
- Side Panel 提供“一键授权当前站点”能力（`chrome.permissions.request`）
- 授权成功后，在当前 tab 立即注入必要脚本（无需手动刷新/重载页面）

验证：
- 手工：按 `docs/plan/v2-permissions.md`

### M3: CI-Gate（done）

DoD：
- GitHub Actions 在 Windows 上跑 `scripts/verify.ps1` + `npm run test:e2e` 全绿

验证：
- 触发 CI（push）并查看 workflow 结果

## Plans

- `docs/plan/v2-tool-inspector.md`
- `docs/plan/v2-permissions.md`
- `docs/plan/v2-ci.md`

## Traceability Matrix（v2）

| Req ID | v2 Plan | 验证 | 状态 |
|---|---|---|---|
| REQ-0001-008 | v2-tool-inspector | 手工 + `npm run test:e2e` | done |
| REQ-0001-009 | v2-permissions | 手工 | done |
| REQ-0001-010 | v2-ci | GitHub Actions | done |

## ECN Index

- （v2 新增如有变更再补）

## Differences

- 证据记录：`docs/plan/v2-evidence.md`
- 未满足/延期项（进入 v3）：
  - `registerToolsChangedCallback` 自动刷新（testing API 路径）
  - 站点白名单 UI/管理页（查看已授权 origins、撤销授权）
  - CI 增加 artifact（Playwright trace / screenshot）便于排障
