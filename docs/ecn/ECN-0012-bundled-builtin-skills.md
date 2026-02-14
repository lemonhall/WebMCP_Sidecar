# ECN-0012 — 打包内置 Skills 到扩展（落盘到 OPFS）

## Context

在 Phase 1 里，Agent 需要能直接使用一些“通用技能文档”（Skill Meta Tool 的输入），否则每次都要从外部拷贝/手工创建 `.agents/skills/*`，不利于调试与复用。

## Decision

- 将以下技能作为扩展内置资源随包携带，并在首次需要时写入 OPFS：
  - `skill-creator`
  - `brainstorming`
  - `find-skills`
  - `deep-research`
- 内置技能资源位置：`extension/builtin_skills/<name>/SKILL.md`
- 落盘位置：OPFS shadow workspace 的 `.agents/skills/<name>/SKILL.md`
- 初始化策略：**best-effort**（缺失某个内置文件不应阻塞其它能力；仅跳过该技能）

## Consequences

- `ListSkills` / `Skill` 首次调用时会触发一次 OPFS 初始化与落盘。
- 这些技能可被后续 “Files” 文件管理器查看/编辑（仍仅在扩展内可见）。

