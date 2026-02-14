# ECN-0013 — File Agent 支持 Skill + 引入 WebFetch/WebSearch（参考 openagentic-sdk-ts）

## Context

- File Agent 原本仅允许 Filesystem 工具，无法加载 Skill 文档来约束/指导其行为。
- 需要把 `openagentic-sdk-ts` 的网络访问能力（`WebFetch` / `WebSearch`）引入本扩展，以支持研究/检索类工作流。

## Decision

1) **File Agent 工具集扩展**
- 仍以 Filesystem 工具为主，但额外允许：
  - `ListSkills`
  - `Skill`

2) **引入 Web 工具**
- 新增 `WebFetch` / `WebSearch` 工具（实现风格与 openagentic-sdk-ts 对齐）：
  - `WebFetch`：`credentials: "omit"`；限制返回字节数；支持有限 redirect 跟随；默认阻止访问本地/私网 host（可通过入参放开）。
  - `WebSearch`：优先 Tavily（需要 `tavilyApiKey`），否则 DuckDuckGo HTML best-effort fallback。

3) **Settings 新增可选 Tavily Key**
- 存储在 `settings.llm.v1` 下的 `tavilyApiKey` 字段（可选）。

## Evidence

- `powershell -File scripts/verify.ps1`
- `npm run test:e2e`

