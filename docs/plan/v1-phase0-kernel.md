# v1 — Phase 0 Kernel 计划（发现工具 + 调用 execute）

## Goal

用最小实现验证内核闭环：**Side Panel → SW → ISOLATED CS → MAIN bridge → tool.execute → 返回结果**。

## PRD Trace

- REQ-0001-001 ~ REQ-0001-006

## Scope

做：
- 纯原生 MV3 扩展骨架（不引入构建框架）
- MAIN bridge：hook + list/call
- Side Panel：最小 UI

不做：
- LLM 接入
- polyfill / SKILL
- Web Store 上架

## Acceptance

- `extension/` 可被 Chrome 以“加载已解压的扩展程序”方式加载成功
- 在 WebMCP demo 页面：能看到工具列表，能调用一个工具并获得返回值

## Files

创建/修改：
- `extension/manifest.json`
- `extension/background.js`
- `extension/content_isolated.js`
- `extension/main_bridge.js`
- `extension/sidepanel.html`
- `extension/sidepanel.js`
- `scripts/verify.ps1`

## Steps（按顺序）

1) 实现扩展骨架与最小 UI（REQ-0001-001）  
2) 实现 SW ⇄ CS ⇄ MAIN 的消息协议（REQ-0001-002）  
3) 在 MAIN bridge 中 hook `registerTool/...` 并维护注册表（REQ-0001-003）  
4) 实现 callTool → `execute` 调用（REQ-0001-004）  
5) 强制 JSON-serializable（REQ-0001-005）  

## E2E（手工，Phase 0）

前置：
- Chrome Canary（或你目标版本）已启用 WebMCP 相关 flags
- 打开页面：`https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch/`

步骤：
1. Chrome 扩展管理页开启开发者模式，加载目录：`extension/`
2. 打开该 demo 页面
3. 打开 Side Panel，点击 `Refresh`
4. 确认工具列表非空（至少看到 `searchFlights/listFlights/...`）
5. 选择一个工具，输入 JSON 参数（或空对象），点击 `Call`
   - 说明：当前 flightsearch demo 数据集/逻辑可能只支持非常有限的查询组合（例如 `London, UK` → `New York, US`、`round-trip`、`passengers: 2`）。如果你填 `PEK/SHA` 这类值，工具可能会正常执行但返回 “No results found”（这不是 Sidecar 失败）。
   - `searchFlights` 示例入参（已验证可跑通，IATA 代码 + 往返 + 日期 + 人数）：`{"origin":"LON","destination":"NYC","tripType":"round-trip","outboundDate":"2026-02-14","inboundDate":"2026-02-21","passengers":2}`
   - 备注：如果你传 `"New York, US"` 这类文本，可能会返回校验错误（例如 `destination must be a 3 letter ... IATA code`），这是 demo 的输入约束，不是 Sidecar 失败。
6. 确认结果区域显示 JSON（或结构化错误 message）

## Risks

- 使用 `<script src=chrome-extension://...>` 注入 MAIN bridge 可能被页面 CSP 阻断：Phase 0 先以官方 demo 为验证对象；Phase 1 改为 `chrome.scripting.executeScript({ world: 'MAIN' })` 注入
- 工具注册发生在桥接注入之前导致漏捕获：Phase 1 再做“更早注入”策略（registerContentScripts/更早 run_at）
