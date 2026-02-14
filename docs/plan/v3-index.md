# v3 Index — Phase 1 Agent MVP（Chat + Settings）

- 日期：2026-02-14
- 关联 PRD：
  - Phase 0：`docs/prd/PRD-0001-webmcp-sidecar.md`
  - Phase 1：`docs/prd/PRD-0002-webmcp-sidecar-phase1-agent.md`

## Milestones

### M1: Phase1-Agent-MVP（planned）

范围（先这样）：
- Side Panel 主界面：Chat + 历史记录（默认）
- Tool Inspector：保留，但从主界面入口进入（不放到 Settings 里）
- Settings（Options Page）：配置大模型 `baseUrl/apiKey/model` + “Test LLM”
- 复用现有 Phase 0 工具调用管线（发现工具 → 调用 execute → 渲染结果），作为 Agent 的工具层

DoD（硬口径）：
- 不回归 Phase 0 / v2：`powershell -File scripts/verify.ps1` 与 `npm run test:e2e` 仍通过
- Settings 配置可持久化（`chrome.storage.local`），且不会把 secrets 进入 MAIN world
- Chat 能触发至少一次工具调用并在 UI 呈现工具调用事件（含 tool name + args + result/error）

非目标（v3 不做 / 先记一笔）：
- SKILL 注入体系与 SKILL 管理器（柠檬叔已确认后续一定要做，但先不抢占 Phase 1 的第一优先级）

## Plans

- `docs/plan/v3-settings-options.md`
- `docs/plan/v3-sidepanel-chat.md`
- `docs/plan/v3-agent-runtime.md`
- `docs/plan/v3-e2e-agent.md`

## Traceability Matrix（v3）

| Req ID | v3 Plan | 验证 | 状态 |
|---|---|---|---|
| REQ-0002-001 | v3-settings-options | 手工 + v3 E2E | todo |
| REQ-0002-002 | v3-settings-options | 手工 + v3 E2E | todo |
| REQ-0002-003 | v3-sidepanel-chat | 手工 + v3 E2E | todo |
| REQ-0002-004 | v3-sidepanel-chat | 手工 | todo |
| REQ-0002-005 | v3-agent-runtime | 手工 + v3 E2E | todo |
| REQ-0002-006 | v3-agent-runtime | 代码审计 + 手工 | todo |
| REQ-0002-007 | v3-settings-options + v3-agent-runtime | 代码审计 | todo |
| REQ-0002-008 | v3-e2e-agent | `verify.ps1` + `npm run test:e2e` | todo |
| REQ-0002-009 | v3-e2e-agent | `npm run test:e2e` | todo |

## ECN Index

- （v3 新增如有变更再补）

## Differences

- （待开始实现后补齐证据与偏差记录）

## Evidence

- `docs/plan/v3-evidence.md`
