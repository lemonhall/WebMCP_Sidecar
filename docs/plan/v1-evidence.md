# v1 Evidence — Phase 0 Kernel

- 日期：2026-02-14
- 关联 PRD：`docs/prd/PRD-0001-webmcp-sidecar.md`

## 结构校验（命令证据）

- 命令：`powershell -File scripts/verify.ps1`
- 期望：exit code 0，输出包含 `OK: Phase 0 file layout and manifest look valid.`

## 手工 E2E（用户验收记录）

目标页面：
- `https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch/`

已验证现象（用户口述验收）：
- Side Panel `Refresh` 能看到工具列表（至少含 `searchFlights`）
- 调用 `searchFlights` 成功入参（已验证可跑通）：
  - `{"origin":"LON","destination":"NYC","tripType":"round-trip","outboundDate":"2026-02-14","inboundDate":"2026-02-21","passengers":2}`

备注：
- demo 对入参有约束（IATA code + 往返 + 日期等）；出现 “No results found / IATA 校验错误” 属于 demo 逻辑，不视为 Sidecar 失败。

## 自动化 E2E（Playwright）

- 命令：`npm run test:e2e`
- 期望：exit code 0，至少 1 条用例通过（`phase0: refresh tools and call searchFlights`）
