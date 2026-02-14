# v3 — Options: `.agents/*` Files Manager

## Goal

在 Settings（Options Page）提供一个通用文件管理器，用于管理 OPFS 中 `.agents/*` 目录树，优先满足 skills 与未来 sessions 的统一管理入口。

## Scope

做：
- Settings 增加 `Files` 页签
- OPFS `.agents` 根目录初始化（自动创建 `.agents/skills`、`.agents/sessions`）
- 目录浏览：`cwd` + 列表（文件/目录）
- 文件操作：
  - `Open`：打开文本文件到编辑器
  - `Save`：保存编辑器内容
  - `New File`：创建空文件（支持嵌套路径）
  - `New Folder`：创建目录（支持嵌套路径）
  - `Delete`：删除文件/目录（目录递归；仅允许 `.agents/*`；带确认）

不做：
- 复杂的 rename/move（可后续通过 copy+delete 实现）
- 二进制预览（图片等）
- sessions 日志迁移（先铺路）

## Verify

- `powershell -File scripts/verify.ps1`
- `npm run test:e2e`
  - `tests/e2e/options-file-manager.spec.ts`

## Trace

- ECN: `docs/ecn/ECN-0009-options-file-manager-opfs-agents.md`

