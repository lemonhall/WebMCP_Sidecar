# ECN-0010 — Files Tab: SVG Icons + Embedded File Agent

- Date: 2026-02-14
- Scope: Options（Settings）→ Files 页签体验与能力增强

## Context

Files 页签是 `.agents/*` 的统一管理入口。需要：
- 按 Win/Mac 常见交互做按钮与图标（SVG）
- `.agents/skills` 与 `.agents/sessions` 至少有可见的默认内容，避免“空目录像没联动”
- 在 Files 页签内嵌一个专用 Agent，专职管理 `.agents/*`，并且只授予 Filesystem 工具（未来让它自管理目录）

## Decision

1) Files 页签按钮与文件类型标识改为 SVG（黑灰系），并保留可访问的文字标签。

2) Files 初始化时确保：
- `.agents/skills/hello-world/SKILL.md` 存在
- `.agents/sessions/README.md` 存在（占位说明）

3) Files 页签底部内嵌 File Agent：
- UI：消息列表 + 输入框 + Send/Clear
- 工具权限：仅 `ListDir/Read/Write/Edit/Glob/Grep/Mkdir/Delete`
- 使用与 Side Panel 同一套 LLM 配置（`settings.llm.v1`）

## Verification

- `powershell -File scripts/verify.ps1`
- `npm run test:e2e`

