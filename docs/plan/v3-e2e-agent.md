# v3 — Playwright E2E（Phase 1 Agent MVP）

## Goal

把 Phase 1 的核心用户流程固化为可重复回归的 E2E，避免未来继续手工验证。

## PRD Trace

- REQ-0002-008
- REQ-0002-009

## Scope

做：
- 新增至少 1 条用例覆盖：
  - 打开 demo 页
  - 打开 Side Panel（默认 Chat）
  - 触发一次对话（或固定“Call tool”路径）
  - 断言工具调用事件与结果可见

不做：
- 真实联网调用 LLM 的稳定性验证（如果引入，则必须可被 CI/本机稳定复现；否则先用 stub）

## Acceptance（硬口径）

- `npm run test:e2e` exit code 0（或新增脚本并纳入 CI Gate）
- 失败时可诊断（最少：Playwright trace 或 screenshot，后续 v3.1 再增强）

## Notes

- 现有 E2E 里已加入人眼可读延迟（Call 后等待 3 秒）；v3 用例沿用该约定。

