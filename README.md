# WebMCP Sidecar

目标：基于 Chrome 扩展（Manifest V3 + Side Panel）实现一个 Sidecar，在浏览网页时发现并调用页面通过 WebMCP（`navigator.modelContext`）注册的工具，并在侧边栏里呈现工具列表与调用结果。

## 文档

- PRD：`docs/prd/PRD-0001-webmcp-sidecar.md`
- PRD（Phase 1）：`docs/prd/PRD-0002-webmcp-sidecar-phase1-agent.md`
- v1 计划：`docs/plan/v1-index.md`（Phase 0）
- v2 计划：`docs/plan/v2-index.md`（Inspector/权限/CI）
- v3 计划：`docs/plan/v3-index.md`（Phase 1 Agent MVP）
- 研究资料归档：`docs/research/`

## Phase 0（验证内核）快速开始

1. Chrome（建议 Canary + 开启 WebMCP flags）打开 WebMCP demo 页面  
2. 扩展管理页开启开发者模式，加载目录：`extension/`  
3. 打开右侧 Side Panel，点击 `Refresh`，然后选工具 `Call`

结构/清单校验（不含浏览器 E2E）：`powershell -File scripts/verify.ps1`
