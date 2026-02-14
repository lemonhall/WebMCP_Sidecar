# v2 — CI Gate

## Goal

把 Phase 0 的验证固化为 CI：每次 push 都必须通过结构校验与 Playwright E2E。

## PRD Trace

- REQ-0001-010

## Acceptance

- GitHub Actions（Windows）通过：
  - `powershell -File scripts/verify.ps1`
  - `npm ci`
  - `npx playwright install chromium`
  - `npm run test:e2e`

