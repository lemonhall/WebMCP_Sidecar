# Agent Notes (WebMCP_Sidecar)

## Project Overview
这是一个 Chrome 扩展（Manifest V3 + Side Panel）的 Phase 0 验证仓库：在 WebMCP demo 页面上发现工具并调用 `execute()`，把结果展示在右侧 Side Panel。

## Phase 0 Status
- Phase 0 内核闭环已达成：手工 E2E + Playwright 自动化 E2E 都已具备（证据见 `docs/plan/v1-evidence.md`）。
- 两条执行路径：
  - **Canary/flags**：优先走 `navigator.modelContextTesting.listTools/executeTool`
  - **稳定版 Chrome**：走 MAIN world `navigator.modelContext` polyfill + 调用 `tool.execute()`（不依赖 flags）

## Roadmap Notes
- Phase 1 先聚焦：Agent Chat + 历史 + Settings（LLM 配置与连通性测试）+ 复用页面工具（保持 Inspector 可用）。
- **Skill（Meta Tool）+ OPFS shadow workspace**：已接入（见 `docs/ecn/ECN-0008-opfs-shadow-workspace-and-skill-tool.md`）。技能文件存储在 OPFS：`.agents/skills/<skill-name>/SKILL.md`，调试预置 `hello-world`。
- **SKILL 注入体系（给站点补工具）**：后续再做。

## Quick Commands (PowerShell)
- Verify (结构校验): `powershell -File scripts/verify.ps1`
- Install (Playwright): `npm install ; npx playwright install chromium`
- E2E (Playwright): `npm run test:e2e`
- Docs: PRD `docs/prd/PRD-0001-webmcp-sidecar.md`，Plan `docs/plan/v1-index.md`
- v2 Plan: `docs/plan/v2-index.md`
- Phase 1 PRD: `docs/prd/PRD-0002-webmcp-sidecar-phase1-agent.md`，v3 Plan: `docs/plan/v3-index.md`

## Architecture Overview
### Areas
- Phase 0 扩展代码：`extension/`
  - Service Worker: `extension/background.js`
  - ISOLATED content script: `extension/content_isolated.js`
  - MAIN bridge (fallback): `extension/main_bridge.js`
  - Side Panel UI: `extension/sidepanel.html` + `extension/sidepanel.js`
- 文档与证据链：`docs/`
  - PRD: `docs/prd/`
  - Plan: `docs/plan/`
  - ECN: `docs/ecn/`
  - 研究资料: `docs/research/`
- 校验脚本：`scripts/`

### Data Flow (Phase 0)
Side Panel → `chrome.runtime.sendMessage` → SW → `chrome.tabs.sendMessage` → ISOLATED CS →
1) 优先：`navigator.modelContextTesting.listTools/executeTool`（无需 MAIN 注入）
2) fallback：`window.postMessage` → MAIN bridge（hook registry + `tool.execute`）→ 回传

## Code Style & Conventions
- 扩展运行时代码优先保持 **纯原生 JS**（不引入 bundler），以便更容易定位 MV3/权限/注入问题：`extension/*.js`
- E2E 测试使用 TypeScript（Playwright）：`tests/e2e/*.spec.ts`
- 约定：变量 `camelCase`，常量 `UPPER_SNAKE_CASE`，尽量避免引入无必要依赖

## Safety & Conventions
- 不要把任何 API Key / Token 写进代码、文档或提交历史；本项目 Phase 0 不需要也不允许把 secrets 传入 MAIN world。
- 不要做批量删除（`Remove-Item -Recurse -Force` / `rm -rf`）除非用户明确要求且再次确认目标路径。
- `extension/content_isolated.js` 与 `extension/main_bridge.js` 属于安全边界关键路径：改动后必须跑 `scripts/verify.ps1`，并在 PRD/Plan/ECN 中补齐追溯说明。
- 不要提交本地生成物：`node_modules/`、`test-results/` 等（见 `.gitignore`）。

## Testing Strategy
### Phase 0
- 结构校验（必须）: `powershell -File scripts/verify.ps1`
- 手工 E2E（必须）：按 `docs/plan/v1-phase0-kernel.md` 在 WebMCP demo 页面验证 “Refresh → Call” 闭环。
  - `searchFlights` 已验证可跑通入参：`{"origin":"LON","destination":"NYC","tripType":"round-trip","outboundDate":"2026-02-14","inboundDate":"2026-02-21","passengers":2}`
- 自动化 E2E（必须）: `npm run test:e2e`（默认非 headless，会停留 3 秒便于人眼观察）

## Doc Policy (Tashan loop)
- 需求变更/新发现：先写 `docs/ecn/ECN-*.md`，再改 PRD/Plan，再改代码；禁止只改代码不留痕。
- 版本化计划：以 `docs/plan/vN-*.md` 为准，确保 PRD ↔ Plan ↔ 代码 ↔ 验收命令可追溯。

## Local Workflow Note
- 该仓库默认按 Windows 11 + PowerShell 7.x 使用；连续命令用 `;` 分隔。
- 每次“阶段性完成”（文档归档/实现可跑通/修复 bug）后，按用户约定用 `apn-pushtool` 发一条 ≤10 字的完成通知。
