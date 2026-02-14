# ECN-0003: Phase 0 增加 Playwright 自动化 E2E Gate

- 日期：2026-02-14
- 关联 PRD：`docs/prd/PRD-0001-webmcp-sidecar.md`

## 变更原因

Phase 0 当前主要依赖手工 E2E。为了让后续迭代稳定可回归，需要把“Refresh → Call” 核心用户流程固化为 Playwright 自动化用例。

## 变更内容

- 新增 REQ-0001-007：`npm run test:e2e` 必须可通过
- 新增 v1 里程碑 M2（E2E-Playwright）与计划文档 `docs/plan/v1-e2e-playwright.md`

## 影响范围

- 受影响文档：PRD/Plan
- 受影响代码：仅测试与配置（不改变扩展行为）
