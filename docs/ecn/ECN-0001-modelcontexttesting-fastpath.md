# ECN-0001: Phase 0 增加 `navigator.modelContextTesting` fast path

- 日期：2026-02-13
- 关联 PRD：`docs/prd/PRD-0001-webmcp-sidecar.md`
- 发现来源：`docs/research/notes/2026-02-13-webmcp-modelcontexttesting-consumer-api.md`

## 变更原因

发现 Chrome 官方 Inspector 扩展作为“工具消费端（Consumer）”并不需要 MAIN world 注入与 `postMessage` 桥接；它在 ISOLATED content script 中通过 `navigator.modelContextTesting` 完成：

- `listTools()`
- `executeTool(name, inputArgs)`
- `registerToolsChangedCallback(...)`（本项目 Phase 0 暂不实现）

这意味着 Phase 0 可以优先走 `modelContextTesting` 路径快速验证闭环，并把 MAIN bridge 作为 fallback（用于未来无 testing API 的环境与 SKILL/polyfill）。

## 变更内容

### 原设计（v1 初版）

Phase 0 统一通过 MAIN world bridge 维护注册表 + `callTool()` 调用 execute。

### 新设计（本 ECN）

Phase 0 的 ISOLATED content script 增加 feature detection：

```
if (navigator.modelContextTesting) {
  listTools → modelContextTesting.listTools()
  callTool  → modelContextTesting.executeTool()
} else {
  fallback → MAIN bridge（postMessage）
}
```

## 影响范围

- 受影响需求：REQ-0001-002 / REQ-0001-004 / REQ-0001-005（实现路径变化，不改变验收口径）
- 受影响代码：`extension/content_isolated.js`
- 受影响文档：v1 计划风险项（后续回填）
