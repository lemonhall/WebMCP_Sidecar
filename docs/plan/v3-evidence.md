# v3 Evidence（Phase 1 Agent MVP）

> 本文件记录 v3（Phase 1）每个里程碑的验证证据（命令输出要点/截图/结论）。不接受“口头说通过”。

## M1: Phase1-Agent-MVP

- 日期：2026-02-14
- 环境：
  - OS：Windows 11（PowerShell）
  - Chrome：（未记录）
  - 扩展版本（commit）：（滚动：见 git log）

### Verify（必填）

- `powershell -File scripts/verify.ps1`：
  - 结果：OK（exit code 0）
- `npm run test:e2e`：
  - 结果：PASS（1 passed）

### Manual Notes（可选）

- Settings → Test LLM：已按 Smart_Bookmark 形态固定 `POST /v1/responses`（已手工验证可用）
- Side Panel 默认 Chat + 历史 + Inspector Tab：已实现（待补手工验收记录）
- Agent runtime + tool adapter：已实现（待补“对 demo 页触发一次 searchFlights 工具调用”的手工证据）
