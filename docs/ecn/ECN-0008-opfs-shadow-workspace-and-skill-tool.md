# ECN-0008 — OPFS Shadow Workspace + Skill Meta Tool

- Date: 2026-02-14
- Scope: Phase 1（Agent MVP）扩展能力（原本 deferred 的 SKILL/Skill）

## Context

柠檬叔确认“先做 SKILL”，但此处的 SKILL 语义是 **openagentic-sdk-ts 的 Claude 风格 Meta Tool：`Skill`**（向模型加载一段技能文档），而不是“给站点注入 WebMCP 工具”的 Skill 注入体系。

同时，需要给插件一个“独立的假的文件系统”，用于存储 `.agents/skills/<skill-name>/SKILL.md` 树形目录，便于开发/调试/后续扩展。

## Decision

1) 采用 **OPFS（Origin Private File System）** 作为 Shadow Workspace 的存储后端（`navigator.storage.getDirectory()`）。

2) 在 Agent runtime 的 ToolRegistry 中常驻注入以下工具（shadow workspace tools）：
- `Skill`：从 `.agents/skills/<name>/SKILL.md` 读取 skill 文档并返回给模型
- `ListDir/Read/Write/Edit/Glob/Grep`：用于浏览与编辑 shadow workspace（为后续技能调试做准备）

3) 调试阶段默认预置一个 `hello-world` skill（首次运行自动写入）：
- `.agents/skills/hello-world/SKILL.md`

## Rationale

- OPFS 天然具备“目录 + 文件”的语义，适配 `.agents/skills/...` 的结构化存储。
- Shadow workspace 与页面隔离，不会把 secrets 注入 MAIN world。
- `Skill` + 文件工具让 Agent 具备“自解释与自修复”的基础能力（能查看/加载/修改 skills）。

## Verification

- `powershell -File scripts/verify.ps1`
- `npm run test:e2e`
  - Phase0 regression：Inspector Refresh + Call
  - Phase1 regression：Chat Agent（跨导航 tool call）
  - Phase1 regression：`Skill` 能加载 `hello-world`（OPFS）

