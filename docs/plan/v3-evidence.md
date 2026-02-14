# v3 Evidence（Phase 1 Agent MVP）

> 本文件记录 v3（Phase 1）每个里程碑的验证证据（命令输出要点/截图/结论）。不接受“口头说通过”。

## M1: Phase1-Agent-MVP

- 日期：2026-02-14
- 环境：
  - OS：Windows 11（PowerShell）
  - Chrome：（未记录）
  - 扩展版本（commit）：（待本轮提交后补）

### Verify（必填）

- `powershell -File scripts/verify.ps1`：
  - 结果：OK（exit code 0）
- `npm run test:e2e`：
  - 结果：PASS（1 passed）

### Manual Notes（可选）

- Chat → tool call 闭环：（未开始）
- Settings → Test LLM：已实现 `/v1/responses` 测试（含 404/405 fallback 到 `/v1/chat/completions`），待手工验证不同 provider 兼容性与代理环境表现
