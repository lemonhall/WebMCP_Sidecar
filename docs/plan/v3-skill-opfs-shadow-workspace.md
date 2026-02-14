# v3 — OPFS Shadow Workspace + Skill（Meta Tool）

## Goal

在扩展域内提供一个“假的文件系统”（shadow workspace），使用 OPFS 持久化 `.agents/skills/<skill-name>/SKILL.md`，并把 `Skill` 工具作为 Meta Tool 注入到 Agent Runtime，使 LLM 能加载技能文档并据此调整行为。

## Scope

做：
- Shadow workspace（OPFS）：实现 `Workspace` 级别能力：`readFile/writeFile/stat/listDir/deleteFile`
- 工具集（常驻注入到 Agent registry）：
  - `Skill`：从 `.agents/skills/<name>/SKILL.md` 加载技能内容
  - `ListDir/Read/Write/Edit/Glob/Grep`：用于浏览/编辑/检索 shadow workspace
- 调试预置：首次启动自动写入内置 skills（至少 `hello-world`）

不做：
- “给站点注入 WebMCP 工具”的 Skill 注入体系（那是另一条线）
- skills 的 UI 管理器（导入/导出/编辑器）

## Acceptance（硬口径）

- Chat Agent 可调用 `Skill` 加载 `hello-world`
- 技能文件位于 OPFS 的 `.agents/skills/hello-world/SKILL.md`
- 内置 skills 会落盘到 `.agents/skills/*/SKILL.md`（如 `brainstorming`、`deep-research`、`find-skills`、`skill-creator`）
- Phase 0 / Phase 1 现有回归仍全绿

## Verify

- `powershell -File scripts/verify.ps1`
- `npm run test:e2e`

## Trace

- ECN: `docs/ecn/ECN-0008-opfs-shadow-workspace-and-skill-tool.md`
- ECN: `docs/ecn/ECN-0012-bundled-builtin-skills.md`
