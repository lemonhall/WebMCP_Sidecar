# 公众号文章初稿｜WebMCP Sidecar：一个“能用工具、会做调研”的 Chrome 侧边栏助手

如果你经常一边看网页、一边查资料、一边做总结，还要频繁在各种窗口之间切来切去——那你可能会喜欢我最近在做的这个小东西：**WebMCP Sidecar**。

它本质上是一个 **Chrome 扩展（Manifest V3 + Side Panel）**：右侧开一个侧边栏，把“网页能提供的工具”和“一个会用工具的 Agent”放进来，让浏览器变成一个更好用的工作台。

GitHub 地址（源码 + 体验方式都在这里）：

```text
https://github.com/lemonhall/WebMCP_Sidecar
```

---

## 它是干啥的（一句话）

在浏览网页时：
- **发现并调用网页提供的 WebMCP 工具**（如果网页有暴露的话）
- 同时在侧边栏跑一个 **Chat Agent**，让它能用工具来完成任务（抓网页、搜索、汇总、写调研稿）

---

## 现在已经能做什么（现状能力清单）

### 1) WebMCP Inspector（Phase 0）

如果页面通过 WebMCP 暴露了工具（例如官方 demo），Side Panel 的 Inspector 可以：
- Refresh 列出工具
- 选择工具并 Call
- 显示结果（并做了截断，避免刷屏）

### 2) Chat Agent（Phase 1）

侧边栏的主界面是 Chat：
- 支持 streaming 输出
- 对话里可见 tool.use / tool.result（结果过大时自动截断）
- 侦测到 tab URL 变化，会自动重载工具
- 一键 Copy 整段对话 transcript（便于粘贴到笔记/工单/PR）

### 3) 抓网页/搜网页（WebFetch / WebSearch）

Agent 目前内置了两类 Web 工具：
- `WebFetch`：抓取一个 HTTP(S) URL 的内容（默认会阻止访问 localhost/内网；需要时可显式开启 `allow_private_networks: true`）
- `WebSearch`：网页搜索（可选 Tavily；也有 fallback 模式）

### 4) Skill（Meta Tool）+ OPFS “影子工作区”

为了让 Agent 可控、可复用、可调试，我给它加了一个“扩展内部可见”的文件树（OPFS）：
- `.agents/skills/*`
- `.agents/sessions/*`

并提供：
- `ListSkills` / `Skill`（把技能文档加载进模型上下文）
- 文件工具（`ListDir/Read/Write/Edit/Glob/Grep/Mkdir/Delete`）

有几个常用技能是内建的，首次调用 `ListSkills` / `Skill` 会自动安装进 OPFS：
- `hello-world`
- `deep-research`
- `find-skills`
- `brainstorming`
- `skill-creator`

你在对话里写 `$deep-research`，就是在显式要求它“加载 deep-research 这个技能文档，然后按技能流程来做事”。

---

## 怎么安装体验（小白版）

目前项目以 **开发者模式加载 unpacked 扩展** 为主（不走 Chrome 商店）。

1) 下载/克隆仓库

```text
https://github.com/lemonhall/WebMCP_Sidecar
```

2) 打开 Chrome 扩展页：`chrome://extensions`，打开右上角 **开发者模式**

3) 点 **加载已解压的扩展程序（Load unpacked）**

4) 选择目录：`WebMCP_Sidecar/extension/`

5) 点击扩展图标，打开 **Side Panel**

---

## 推荐一个立刻能跑通的 Demo（WebMCP 航班搜索）

打开这个页面：

```text
https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch/
```

然后在 Side Panel 的 Inspector 里：
- Refresh
- 选择 `searchFlights`
- Call

已验证可跑通的入参：

```json
{"origin":"LON","destination":"NYC","tripType":"round-trip","outboundDate":"2026-02-14","inboundDate":"2026-02-21","passengers":2}
```

---

## 接下来的展望（我准备把它做成什么）

我希望它不是“为了 demo 而 demo”，而是真能在日常工作里用起来。所以 Roadmap 大概会是：

1) **Shadow workspace 支持 Git**
- 在扩展内部的工作区里，能做 status/log/diff/commit 等基础操作

2) **find-skills + 自助安装**
- 让用户/Agent 可以一键把技能装进 `.agents/skills/*`（形成可复用的工作流库）

3) **Tab 自动化 + DOM 读写**
- 列 tab、切 tab、打开链接、读 DOM、在用户明确意图下写 DOM（自动化）

4) **总结文章 / 提炼要点 / 结构化输出**
- “读当前页面 → 提取结构化信息 → 生成摘要/提纲/要点/引用”

5) **更像产品的 Agent UI**
- 事件流、工具卡片、可展开的结果、可追溯的 sessions 管理

---

## 最后

如果你也对“浏览器里的 Agent + 工具生态”感兴趣，欢迎来 GitHub 围观/提 issue/一起玩：

```text
https://github.com/lemonhall/WebMCP_Sidecar
```

（配图建议：README 里的 `screenshot1/2/3.png` 直接当文章插图用就行。）

