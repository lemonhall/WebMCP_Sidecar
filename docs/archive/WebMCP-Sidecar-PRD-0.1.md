明白了柠檬叔，你这篇文章写得很透彻，信息量完全够了。我直接基于你的理解来写这份 PRD 草案。

核心思路我 get 到了：你要做的不是跟着 Google 走 Gemini 那条路，而是用自己的插件 + 国产模型，去驱动 WebMCP 这套协议，甚至还能给别人的网站"补"上这套能力。

我来写：

好，让我把这份文档写出来。考虑到内容比较长，我分几次写入。

先确认一下你的项目目录：

这份文档我直接写到你的开发目录下，文件名就叫 `WebMCP-Sidecar-PRD.md`，你拿去给别的 agent 用就行。

我先把整体框架和愿景部分写出来：

```markdown
# WebMCP Sidecar — 产品需求文档（草案 v0.1）

> 状态：早期草案 / 概念验证阶段
> 作者：柠檬叔
> 日期：2026-01-xx
> 本文档为初始构想，供后续 Agent 辅助开发时作为上下文参考。

---

## 一、愿景

Google 在 Chrome 146+ 中推出了 WebMCP 协议——让网站通过 `navigator.modelContext.registerTool()` 主动向 AI Agent 暴露结构化的工具接口。这是一个非常优秀的设计，但 Google 当前的实现（Model Context Tool Inspector 插件）本质上是为自家 Gemini 服务的。

我们的目标是：**做一个独立的 Chrome Sidecar 插件，用自己的国产大模型（或任意 LLM），驱动 WebMCP 这套协议。**

核心价值主张：

1. **模型无关** — 不绑定 Gemini，通过已有的 TS SDK 接入任意 LLM（国产模型优先：DeepSeek、Qwen、GLM 等）
2. **双向能力** —
   - 对于已支持 WebMCP 的网站：直接发现并调用其注册的工具
   - 对于未支持 WebMCP 的网站：通过注入脚本，为其"补"上一套工具注册，让 Agent 也能结构化操控
3. **Sidecar 体验** — 类似 VS Code 的 AI 侧边栏，占据浏览器右侧约 1/3 区域，用户在左侧正常浏览，右侧与 AI 对话并观察 Agent 的操作
4. **SKILL 驱动** — 复用柠檬叔已有的 SKILL 技能体系，将"如何操控某类网站"封装为可复用的 SKILL 规范

最终形态的一句话描述：**一个跑在 Chrome 侧边栏里的 AI Agent，能直接调用网页暴露的工具函数，也能给任意网页注入工具能力，用你自己选的模型驱动一切。**

---

## 二、用户场景

### 场景 1：操控已支持 WebMCP 的网站

用户打开一个航班预订网站（如 Google 的 react-flightsearch demo），该网站已通过 `navigator.modelContext.registerTool()` 注册了 `searchFlights`、`listFlights`、`setFilters` 等工具。

1. 用户打开 Sidecar 侧边栏
2. Sidecar 自动检测到当前页面注册了 4 个 WebMCP 工具，在面板中列出
3. 用户对 AI 说："帮我搜一下明天从北京到上海的航班，只看直飞、2000 以下的"
4. AI 解析意图 → 依次调用 `searchFlights` → `setFilters` → `listFlights`
5. 页面实时更新（用户能看到），AI 在侧边栏返回结构化的航班推荐

### 场景 2：给未支持 WebMCP 的网站"补"能力

用户打开某个国内电商网站，该网站没有任何 WebMCP 支持。

1. 用户在 Sidecar 中加载一个预定义的 SKILL（如 `taobao-search.skill`）
2. SKILL 定义了该网站的工具映射：搜索框 → `searchProduct` 工具，筛选栏 → `setFilters` 工具等
3. Sidecar 通过 `world: "MAIN"` 注入脚本，在页面上注册这些工具
4. 后续流程与场景 1 一致——AI 通过工具接口操控页面

### 场景 3：开发者调试模式

前端开发者正在给自己的网站接入 WebMCP 支持。

1. 开发者打开自己的本地开发站点
2. Sidecar 的 Inspector 模式列出所有已注册的工具、schema、参数类型
3. 开发者可以手动触发工具调用，查看返回值和页面变化
4. 相当于一个增强版的 Model Context Tool Inspector，但额外支持用真实 LLM 做端到端测试

---

## 三、技术架构

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     Chrome 浏览器                        │
│                                                          │
│  ┌─────────────────────────┐  ┌───────────────────────┐ │
│  │      目标网页 (左侧)     │  │   Side Panel (右侧)   │ │
│  │                         │  │                       │ │
│  │  ┌───────────────────┐  │  │  ┌─────────────────┐  │ │
│  │  │ 页面原生 JS 上下文  │  │  │  │  Chat UI        │  │ │
│  │  │                   │  │  │  │  (对话界面)      │  │ │
│  │  │ navigator         │  │  │  │                 │  │ │
│  │  │  .modelContext     │  │  │  ├─────────────────┤  │ │
│  │  │  .registerTool()  │  │  │  │  Tool Inspector  │  │ │
│  │  │                   │  │  │  │  (工具面板)      │  │ │
│  │  │ 已注册的工具:      │  │  │  │                 │  │ │
│  │  │  - searchFlights  │  │  │  ├─────────────────┤  │ │
│  │  │  - listFlights    │  │  │  │  SKILL 管理器    │  │ │
│  │  │  - setFilters     │  │  │  │                 │  │ │
│  │  │  - resetFilters   │  │  │  └─────────────────┘  │ │
│  │  └──────▲────────────┘  │  │           │           │ │
│  │         │               │  │           │           │ │
│  └─────────│───────────────┘  └───────────│───────────┘ │
│            │                              │             │
│  ┌─────────│──────────────────────────────│───────────┐ │
│  │         │     Service Worker           │           │ │
│  │         │    (后台调度中心)              │           │ │
│  │         │                              │           │ │
│  │    ┌────┴──────────┐  ┌───────────────┴────────┐  │ │
│  │    │ Content Script │  │   消息路由 & 调度       │  │ │
│  │    │ (MAIN world)  │  │                        │  │ │
│  │    │               │  │  Side Panel ←→ CS 通信  │  │ │
│  │    │ - 发现工具     │  │  工具调用编排           │  │ │
│  │    │ - 调用工具     │  │  结果回传              │  │ │
│  │    │ - 注入工具     │  │                        │  │ │
│  │    └───────────────┘  └────────────┬───────────┘  │ │
│  │                                    │              │ │
│  └────────────────────────────────────│──────────────┘ │
└───────────────────────────────────────│────────────────┘
                                        │
                              ┌─────────▼──────────┐
                              │   LLM API 层        │
                              │                     │
                              │  TS SDK (已有)       │
                              │  ┌───────────────┐  │
                              │  │ DeepSeek      │  │
                              │  │ Qwen          │  │
                              │  │ GLM           │  │
                              │  │ OpenAI        │  │
                              │  │ ...任意模型    │  │
                              │  └───────────────┘  │
                              └─────────────────────┘
```

### 3.2 核心模块

#### 模块 1：Service Worker（后台调度中心）

职责：
- 管理 Side Panel 与 Content Script 之间的消息路由
- 编排工具调用序列（一次用户请求可能触发多个工具调用）
- 管理 LLM API 的请求/响应
- 维护会话状态

#### 模块 2：Content Script（MAIN world 注入层）

职责：
- 检测当前页面是否已有 `navigator.modelContext`
- 如果有：枚举已注册的工具，上报给 Service Worker
- 如果没有：根据 SKILL 定义，注入工具注册代码
- 执行工具调用，将结果回传

关键技术点：
```typescript
// 在 MAIN world 中运行，可以直接访问页面的 JS 上下文
chrome.scripting.executeScript({
  target: { tabId },
  world: "MAIN",
  func: async (toolName: string, params: Record<string, unknown>) => {
    const ctx = (navigator as any).modelContext;
    if (!ctx) throw new Error("WebMCP not available on this page");

    // 获取已注册的工具列表
    const tools = await ctx.tools();

    // 找到目标工具并调用
    const tool = tools.find(t => t.name === toolName);
    if (!tool) throw new Error(`Tool "${toolName}" not found`);

    return await tool.invoke(params);
  },
  args: [toolName, params]
});
```

#### 模块 3：Side Panel（用户界面）

职责：
- 聊天对话界面（用户与 AI 交互）
- 工具 Inspector 面板（展示当前页面注册的所有工具、schema、参数）
- SKILL 管理器（加载、编辑、启用/禁用 SKILL）
- 操作日志（展示 Agent 的每一步操作，透明可审计）

技术选型建议：
- 框架：Preact 或 Solid.js（轻量，适合扩展场景，bundle 小）
- 样式：Tailwind CSS
- 构建：Vite + CRXJS（Chrome 扩展开发的 Vite 插件）

#### 模块 4：LLM 适配层

职责：
- 封装已有的 TS SDK，提供统一的 function calling 接口
- 将 WebMCP 工具的 schema 转换为 LLM 的 function/tool 定义格式
- 处理流式响应
- 模型切换（用户可在设置中选择不同的 LLM provider）

关键设计：
```typescript
// WebMCP tool schema → LLM function calling format
function webmcpToolToLLMFunction(tool: WebMCPTool): LLMFunctionDef {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema  // WebMCP 用的就是 JSON Schema，大部分 LLM 也是
  };
}
```

这里有个天然的优势：WebMCP 的工具定义本身就是 JSON Schema 格式，和主流 LLM 的 function calling 格式几乎一致，转换成本极低。

### 3.3 数据流：一次完整的用户请求

```
用户在 Side Panel 输入: "帮我搜明天北京到上海的直飞航班"
  │
  ▼
Side Panel → chrome.runtime.sendMessage → Service Worker
  │
  ▼
Service Worker:
  1. 向 Content Script 请求当前页面的工具列表
  2. Content Script (MAIN world) 调用 navigator.modelContext.tools()
  3. 拿到工具列表: [searchFlights, listFlights, setFilters, resetFilters]
  4. 将工具 schema 转换为 LLM function calling 格式
  5. 构造 prompt: 用户消息 + 可用工具定义 → 发给 LLM
  │
  ▼
LLM 返回 function_call:
  { name: "searchFlights", arguments: { origin: "PEK", destination: "SHA", date: "2026-01-xx" } }
  │
  ▼
Service Worker → Content Script:
  "请调用 searchFlights，参数如下..."
  │
  ▼
Content Script (MAIN world):
  调用 navigator.modelContext 上的 searchFlights 工具
  → 页面派发 CustomEvent("searchFlights")
  → React 组件更新状态、重新渲染
  → 页面 UI 实时变化（用户在左侧看到）
  → 返回结果: "A new flight search was started."
  │
  ▼
Service Worker 收到结果，可能继续调用下一个工具:
  LLM 判断需要再调 setFilters({ stops: [0] })
  → 重复上述流程
  │
  ▼
最终 LLM 生成自然语言总结:
  "已帮你搜索明天北京到上海的直飞航班，共找到 5 个结果，最便宜的是..."
  │
  ▼
Side Panel 展示 AI 回复 + 操作日志
```

### 3.4 SKILL 注入机制（给不支持 WebMCP 的网站"补"能力）

这是本项目的差异化能力。核心思路：

```typescript
// skill 定义文件示例: taobao-search.skill.ts
export const skill: SkillDefinition = {
  name: "taobao-search",
  match: ["*.taobao.com", "*.tmall.com"],  // URL 匹配规则
  tools: [
    {
      name: "searchProduct",
      description: "在淘宝搜索商品",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "搜索关键词" }
        },
        required: ["keyword"]
      },
      // 实现：操控页面 DOM 完成搜索
      handler: async (params) => {
        const input = document.querySelector("#q") as HTMLInputElement;
        input.value = params.keyword;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        (document.querySelector(".btn-search") as HTMLElement).click();
        // 等待结果加载...
        return "搜索已发起";
      }
    }
  ]
};
```

注入流程：
1. 用户打开淘宝 → Content Script 检测 URL 匹配到 `taobao-search` SKILL
2. 通过 `world: "MAIN"` 注入 SKILL 中定义的工具到 `navigator.modelContext`（如果页面没有 modelContext，先 polyfill 一个）
3. 后续流程与原生 WebMCP 网站完全一致

---

## 四、Manifest V3 配置骨架

```json
{
  "manifest_version": 3,
  "name": "WebMCP Sidecar",
  "version": "0.1.0",
  "description": "AI Sidecar for WebMCP — 用你自己的模型驱动网页工具",

  "permissions": [
    "sidePanel",
    "activeTab",
    "scripting",
    "storage",
    "tabs"
  ],

  "host_permissions": [
    "<all_urls>"
  ],

  "side_panel": {
    "default_path": "sidepanel.html"
  },

  "background": {
    "service_worker": "background.js",
    "type": "module"
  },

  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content-isolated.js"],
      "run_at": "document_idle",
      "world": "ISOLATED"
    }
  ],

  "action": {
    "default_title": "Toggle WebMCP Sidecar"
  },

  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

说明：
- `content-isolated.js`：ISOLATED world 的 Content Script，负责与 Service Worker 通信
- MAIN world 的脚本通过 `chrome.scripting.executeScript({ world: "MAIN" })` 动态注入，不在 manifest 中静态声明（更灵活，按需注入）

---

## 五、技术风险与待决事项

### 5.1 WebMCP API 稳定性
- WebMCP 目前需要 Chrome 146 Canary + feature flag，API 随时可能变
- 对策：抽象一层 `WebMCPAdapter`，隔离对 `navigator.modelContext` 的直接依赖，API 变了只改适配层

### 5.2 MAIN world 注入的安全边界
- `world: "MAIN"` 注入的代码与页面共享 JS 上下文，理论上页面可以检测到注入行为
- 对策：注入代码尽量轻量，核心逻辑留在 ISOLATED world 和 Service Worker 中

### 5.3 LLM function calling 的兼容性
- 不同模型的 function calling 格式略有差异（OpenAI 风格 vs Anthropic 风格 vs 国产模型各自的格式）
- 对策：TS SDK 层已经处理了这个问题（柠檬叔已有的 SDK），确认其 function calling 适配覆盖度

### 5.4 SKILL 注入的维护成本
- 给第三方网站"补"WebMCP 能力，本质上依赖 DOM 结构，网站改版就会失效
- 对策：SKILL 定义中加入版本号和健康检查机制；社区共建 SKILL 仓库

### 5.5 Chrome Web Store 审核
- `<all_urls>` + `scripting` + `world: "MAIN"` 这个权限组合比较敏感
- 对策：初期不上架 Web Store，以开发者模式加载；后期考虑收窄 host_permissions

---

## 六、开发路线图（建议）

### Phase 0：最小可验证原型（1-2 周）
- [ ] Chrome 扩展骨架：Service Worker + Side Panel + Content Script
- [ ] Side Panel 中实现最简聊天界面
- [ ] Content Script (MAIN world) 能检测并列出页面的 WebMCP 工具
- [ ] 用 Google 的 react-flightsearch demo 验证：能通过 Side Panel 对话触发工具调用
- [ ] 接入一个 LLM（DeepSeek 或 Qwen），跑通完整链路

### Phase 1：核心功能完善（2-4 周）
- [ ] Tool Inspector 面板（可视化展示工具 schema、手动触发调用）
- [ ] 多轮工具调用编排（一次请求触发多个工具的串行/并行调用）
- [ ] 操作日志面板（每步操作透明可见）
- [ ] 模型切换功能（设置页面选择不同 LLM provider）
- [ ] 流式响应支持

### Phase 2：SKILL 注入体系（4-6 周）
- [ ] SKILL 定义规范设计
- [ ] SKILL 加载器（从本地文件或远程 URL 加载）
- [ ] navigator.modelContext polyfill（给不支持 WebMCP 的页面补上）
- [ ] 2-3 个示范 SKILL（如：某电商搜索、某文档站导航）
- [ ] SKILL 编辑器（在 Side Panel 中简单编辑和测试）

### Phase 3：打磨与开放（6-8 周）
- [ ] SKILL 社区仓库（GitHub repo，接受 PR）
- [ ] 权限精细化控制（用户可控制哪些网站允许注入）
- [ ] 多标签页支持（同时操控多个页面）
- [ ] 考虑 Chrome Web Store 上架

---

## 七、与现有生态的关系

| 项目 | 关系 |
|---|---|
| Google WebMCP 协议 | 我们是这套协议的消费者和扩展者，不是竞争者 |
| Model Context Tool Inspector | Google 官方的调试工具，我们的 Phase 0 目标是达到它的能力，Phase 1 开始超越它 |
| browser-use / Playwright 等 | 它们是"猜"页面结构来操控；我们是通过结构化工具接口操控，更准确更高效 |
| 柠檬叔的 TS SDK | 核心依赖，提供 LLM 调用能力 |
| 柠檬叔的 SKILL 体系 | 核心依赖，SKILL 定义规范直接复用 |

---

## 八、命名备选

- WebMCP Sidecar
- Lemon Sidecar
- ToolPilot
- PageAgent
- SideMCP

（待定，柠檬叔你挑一个或者另起一个都行）

---

> 本文档为草案 v0.1，核心目的是把想法固化下来，供后续开发 Agent 作为上下文使用。
> 技术细节会在实际开发中持续迭代。
```

柠檬叔，这份 PRD 草案涵盖了愿景、用户场景、技术架构（含完整数据流和架构图）、manifest 骨架、风险点、开发路线图，以及和现有生态的关系。

几个我特别想强调的设计决策：

- MAIN world 的脚本用动态注入而不是静态声明，这样可以按需加载，也方便 SKILL 机制的实现
- WebMCP 的 JSON Schema 和 LLM function calling 格式天然兼容，这是整个方案能跑通的关键前提，转换成本几乎为零
- SKILL 注入机制是你这个项目的真正差异化点——Google 只管"网站主动暴露工具"，你还能"给任意网站补上工具"

你要我把这个文件直接写到 `E:\development` 下面吗？还是你指定个位置？

# 额外的重要参考信息：
=====================

## web上能跑agent的库的位置

https://github.com/lemonhall/openagentic-sdk-ts

这也是我自己的项目，具备了能在web里跑skills的能力，这很重要

当然，为了可以操控左边的网页，以及未来需要支持的核心能力之一：WebMCP，肯定是需要很多的改造的


## WebMCP是什么？
=====================
参考，项目根目录下的：What_is_WebMCP.md

## Chrome 扩展 `chrome.sidePanel` API 深度研究报告
================================================
参考文件：Chrome-sidePanel-API-Deep-Research.md


## Chrome 插件（Manifest V3）Service Worker：API 调研报告
================================================
参考文件：Chrome-Extension-Service-Worker-API-Deep-Research.md


## Chrome 扩展的 `world` / `ExecutionWorld` 机制深度研究报告（ISOLATED vs MAIN）
================================================
参考文件：Chrome-Extension-World-Deep-Research-2026-02-13.md

## `navigator.modelContext`（WebMCP / Web Model Context API）完整规范深度研究报告
================================================
参考文件：WebMCP-navigator-modelContext-API-Deep-Research-2026-02-13.md

## `navigator.modelContext` polyfill 的可行性研究报告（注入方式、可写性、与未来原生实现的冲突风险）
================================================
参考文件：navigator-modelContext-Polyfill-Feasibility-Deep-Research-2026-02-13.md

## Manifest V3 下 `chrome.scripting.executeScript({ world: "MAIN" })` 的边界与限制深度研究报告
================================================
参考文件：MV3-chrome-scripting-world-MAIN-Boundaries-Deep-Research-2026-02-13.md