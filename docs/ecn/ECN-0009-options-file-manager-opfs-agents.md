# ECN-0009 — Options Files Tab: OPFS `.agents/*` File Manager

- Date: 2026-02-14
- Scope: Settings（Options Page）增加通用文件管理器，用于管理 OPFS 中 `.agents/*`

## Context

柠檬叔希望在 Settings 页面统一管理：
- Skills（`.agents/skills/*`）
- Sessions logs（未来放到 `.agents/sessions/*`）

因此需要一个通用的 `.agents/*` 文件管理器，而不是仅针对 skills 的 UI。

## Decision

在 `options.html` 增加 `Files` 页签，提供 OPFS 文件管理能力：
- 浏览当前目录（默认 `.agents`）
- 新建文件 / 新建目录（支持嵌套路径）
- 打开文件并编辑保存（文本）
- 删除文件/目录（目录递归删除；带 confirm；限制只能删 `.agents/*`）

## Rationale

- OPFS 具备目录语义，匹配 `.agents/*` 的树形结构。
- Files Tab 可作为未来 sessions 导出/导入/迁移的基础设施。

## Verification

- `powershell -File scripts/verify.ps1`
- `npm run test:e2e`
  - `tests/e2e/options-file-manager.spec.ts`

