# Agent Notes (WebMCP_Sidecar)

## Project Overview
这是一个 Chrome 扩展（Manifest V3 + Side Panel）的 Phase 0 验证仓库：在 WebMCP demo 页面上发现工具并调用 `execute()`，把结果展示在右侧 Side Panel。

## Quick Commands (PowerShell)
- Verify (结构校验): `powershell -File scripts/verify.ps1`
- Docs: PRD `docs/prd/PRD-0001-webmcp-sidecar.md`，Plan `docs/plan/v1-index.md`

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

## Safety & Conventions
- 不要把任何 API Key / Token 写进代码、文档或提交历史；本项目 Phase 0 不需要也不允许把 secrets 传入 MAIN world。
- 不要做批量删除（`Remove-Item -Recurse -Force` / `rm -rf`）除非用户明确要求且再次确认目标路径。
- `extension/content_isolated.js` 与 `extension/main_bridge.js` 属于安全边界关键路径：改动后必须跑 `scripts/verify.ps1`，并在 PRD/Plan/ECN 中补齐追溯说明。

## Testing Strategy
### Phase 0
- 结构校验（必须）: `powershell -File scripts/verify.ps1`
- 手工 E2E（必须）：按 `docs/plan/v1-phase0-kernel.md` 在 WebMCP demo 页面验证 “Refresh → Call” 闭环。
  - `searchFlights` 已验证可跑通入参：`{"origin":"LON","destination":"NYC","tripType":"round-trip","outboundDate":"2026-02-14","inboundDate":"2026-02-21","passengers":2}`

## Doc Policy (Tashan loop)
- 需求变更/新发现：先写 `docs/ecn/ECN-*.md`，再改 PRD/Plan，再改代码；禁止只改代码不留痕。
- 版本化计划：以 `docs/plan/vN-*.md` 为准，确保 PRD ↔ Plan ↔ 代码 ↔ 验收命令可追溯。

## Local Workflow Note
- 该仓库默认按 Windows 11 + PowerShell 7.x 使用；连续命令用 `;` 分隔。
- 每次“阶段性完成”（文档归档/实现可跑通/修复 bug）后，按用户约定用 `apn-pushtool` 发一条 ≤10 字的完成通知。
