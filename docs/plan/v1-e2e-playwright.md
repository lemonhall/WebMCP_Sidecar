# v1 — Playwright 自动化 E2E（Phase 0）

## Goal

把 Phase 0 的核心用户流程固化为可重复的自动化 E2E，避免后续每天手工回归：

1) 打开 demo 页  
2) 打开 Side Panel（用 `sidepanel.html` 作为测试入口）  
3) 点击 `Refresh` 拉取工具列表  
4) 调用 `searchFlights` 并断言返回 `ok: true`  

## PRD Trace

- REQ-0001-007

## Scope

做：
- 添加 Playwright 配置与 1 条可跑通用例

不做：
- CI 集成（先本机可跑）
- 录屏/trace 上传（后续需要再加）

## Acceptance

- `npm run test:e2e` exit code 0

## Files

- `package.json`
- `playwright.config.ts`
- `tests/e2e/phase0-kernel.spec.ts`

## Steps

1) 安装依赖：`npm install`
2) 安装 Playwright Chromium：`npx playwright install chromium`
3) 运行用例：`npm run test:e2e`

## Notes

- 扩展 E2E 依赖 `chromium.launchPersistentContext`，因此默认非 headless。
