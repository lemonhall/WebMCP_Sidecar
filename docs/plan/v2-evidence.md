# v2 Evidence

- 日期：2026-02-14
- 关联计划：`docs/plan/v2-index.md`

## 本地验证（命令证据）

- `powershell -File scripts/verify.ps1`：exit code 0
- `npm run test:e2e`：exit code 0

## 功能点抽查（手工）

- Tool Inspector：选中工具后能看到 `inputSchema`，`Fill Example` 能生成可调用的 Params
- Grant Site：Side Panel 可发起可选 host 权限申请（需用户点击确认）

