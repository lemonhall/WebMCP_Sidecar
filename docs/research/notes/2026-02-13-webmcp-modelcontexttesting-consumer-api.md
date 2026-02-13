哈哈对不起柠檬叔，你之前文章里就提到过这个 demo。让我直接去看。

好，看到了目录结构和 README。关键文件是 `src/webmcp.ts`。让我去看核心源码。

好，源码全部读到了。现在让我再去看看 Inspector 扩展的消费端代码，特别是 `content.js` 和 `sidebar.js`。

404 了，说明 Inspector 可能是独立仓库或者被移到别的地方了。让我搜一下。

找到了，是独立仓库 `beaufortfrancois/model-context-tool-inspector`。

好，确认了仓库结构。现在让我读取 Inspector 的核心文件：`content.js`、`sidebar.js`、`manifest.json`。

全部核心源码都读完了。现在我有了完整的画面。让我写报告。

---

柠檬叔，全部源码读完了。下面是完整的分析报告。

---

## WebMCP 工具提供端 & 消费端 完整链路分析报告

### 一、两个角色，两套 API

WebMCP 协议里有两个截然不同的角色，它们用的 API 完全不同：

| 角色 | 谁 | 用什么 API | 运行在哪 |
|---|---|---|---|
| 工具提供端（Provider） | 网页本身 | `navigator.modelContext` | 页面 MAIN world |
| 工具消费端（Consumer） | 浏览器/扩展 | `navigator.modelContextTesting` | content script（默认 ISOLATED world） |

这是最关键的发现：**这是两个不同的 API 对象，面向不同的角色。**

### 二、工具提供端（网页侧）怎么做的

以 `react-flightsearch` demo 的 `src/webmcp.ts` 为例：

```typescript
// 1. 类型声明 — 网页只看到 modelContext，只有两个方法
declare global {
  interface Navigator {
    modelContext?: {
      registerTool: (tool: object) => void;
      unregisterTool: (name: string) => void;
    };
  }
}

// 2. 定义工具对象 — 包含 execute 回调函数
export const searchFlightsTool = {
  execute: searchFlights,          // ← 关键：这是一个 JS 函数引用
  name: "searchFlights",
  description: "Searches for flights...",
  inputSchema: { type: "object", properties: { ... }, required: [...] },
  outputSchema: { ... },
  annotations: { readOnlyHint: "false" },
};

// 3. 注册 — 检测 modelContext 存在后调用
export function registerFlightSearchTools() {
  const modelContext = window.navigator.modelContext;
  if (modelContext) {
    modelContext.registerTool(searchFlightsTool);
  }
}

// 4. 注销 — 页面离开时清理
export function unregisterFlightSearchTools() {
  const modelContext = window.navigator.modelContext;
  if (modelContext) {
    modelContext.unregisterTool(searchFlightsTool.name);
  }
}
```

工具提供端的核心模式：

1. Feature detection：`if (navigator.modelContext)` — 没有就什么都不做，页面正常运行
2. `registerTool(toolObject)` — 把包含 `execute` 函数的完整工具对象交给浏览器
3. `unregisterTool(name)` — 按名字注销
4. 工具的 `execute` 函数是真正的业务逻辑，浏览器在收到调用请求时会回调它
5. 工具通过 `CustomEvent` + `dispatchAndWait` 模式与 React UI 通信（requestId 匹配）

**网页侧完全不知道谁在消费这些工具。** 它只管注册，浏览器引擎负责存储和调度。

### 三、工具消费端（Inspector 扩展）怎么做的

Inspector 扩展用的是 `navigator.modelContextTesting` — 一个完全不同的 API：

```javascript
// content.js — 运行在 ISOLATED world（默认 content script）
// 注意：不是 MAIN world！

// 列出所有工具
navigator.modelContextTesting.listTools()
// 返回工具数组，每个工具包含 name, description, inputSchema 等

// 执行工具
navigator.modelContextTesting.executeTool(name, inputArgs)
// 返回 Promise<result>

// 监听工具变更
navigator.modelContextTesting.registerToolsChangedCallback(callback)

// 跨文档结果获取（form target 场景）
navigator.modelContextTesting.getCrossDocumentScriptToolResult()
```

完整的消费链路：

```
sidebar.js (Side Panel UI)
    │
    │  chrome.tabs.sendMessage({ action: 'LIST_TOOLS' })
    │  chrome.tabs.sendMessage({ action: 'EXECUTE_TOOL', name, inputArgs })
    ▼
content.js (Content Script, ISOLATED world)
    │
    │  navigator.modelContextTesting.listTools()
    │  navigator.modelContextTesting.executeTool(name, inputArgs)
    ▼
Chrome 引擎内部
    │
    │  找到网页通过 navigator.modelContext.registerTool() 注册的工具
    │  调用工具的 execute 函数
    ▼
网页 MAIN world
    │  execute 函数执行，操作 DOM/状态
    │  返回结果
    ▼
Chrome 引擎 → content.js → sidebar.js
```

### 四、架构的精妙之处

这个设计非常聪明：

1. **网页（Provider）只接触 `modelContext`** — 极简 API，只有 register/unregister。网页不需要知道谁在调用，也不需要处理通信协议。`execute` 函数就是普通的 JS 函数，浏览器引擎负责调度。

2. **扩展（Consumer）只接触 `modelContextTesting`** — 在 ISOLATED world 就能用，不需要注入 MAIN world。浏览器引擎做了跨 world 的桥接。

3. **浏览器引擎是中间人** — 它持有工具注册表，负责：
   - 接收网页的 `registerTool()` 调用，存储工具定义和 execute 函数引用
   - 响应扩展的 `listTools()` 调用，返回工具元数据（序列化后的）
   - 响应扩展的 `executeTool()` 调用，在 MAIN world 执行 execute 函数，序列化结果返回

4. **不需要 postMessage** — 没有 MAIN ↔ ISOLATED 的 postMessage 通信。浏览器引擎内部处理了跨 world 调用。

### 五、回答你的核心问题

**"依赖 `modelContextTesting` 是否靠谱？"**

坦率说，有风险但也有机会：

- `modelContextTesting` 带着 "Testing" 后缀，明确是实验性 API
- 需要 `chrome://flags` 手动开启 "WebMCP for testing"
- Chrome 146+ 才有（目前是 Canary/Dev 通道）
- 未来正式版可能改名为 `modelContext`（消费端），或者直接内置到 Chrome 的 AI 功能里，不再暴露给第三方扩展

**但关键洞察是：即使 `modelContextTesting` 将来消失，网页侧的 `modelContext.registerTool()` 模式不会变。** 这是规范的核心。

### 六、对我们项目的影响 — 两条路

**路线 A：依赖 `modelContextTesting`（捷径）**

直接 fork Inspector，把 Gemini 换成多模型适配层。

- 优点：代码极少，通信链路浏览器引擎已经搞定
- 缺点：只能在开了 flag 的 Chrome 上用；`modelContextTesting` 可能随时改 API；无法给没有原生 WebMCP 的网站注入 SKILL

**路线 B：自建 MAIN world bridge（我们 PRD v0.2 的方案）**

自己在 MAIN world 注入 polyfill，hook `registerTool`，通过 postMessage 把工具信息传到 ISOLATED world。

- 优点：不依赖 flag；可以在任何 Chrome 上运行；可以注入 SKILL
- 缺点：架构复杂；需要处理序列化、CSP 等问题

**路线 C：两条腿走路（推荐）**

```
if (navigator.modelContextTesting) {
  // 走捷径：直接用浏览器原生 API
  // listTools() / executeTool() 一把梭
} else {
  // 走 polyfill：注入 MAIN world bridge
  // 自己维护工具注册表
}
```

Phase 0 先走路线 A 验证端到端，Phase 1 补上路线 B 作为 fallback。SKILL 注入只在路线 B 下生效。

### 七、Inspector 扩展的 manifest 极简

```json
{
  "manifest_version": 3,
  "permissions": ["sidePanel", "activeTab", "scripting"],
  "host_permissions": ["<all_urls>"],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "runAt": "document_start",
    "js": ["content.js"]
  }]
}
```

注意：没有 `storage` 权限（用的 `localStorage`），没有 `tabs` 权限（用 `chrome.tabs.query` 不需要 `tabs` 权限，只是返回的信息有限）。已经通过了 Chrome Web Store 审核。

这对我们的审核策略是个好消息 — 同样的权限组合 Google 自己的扩展已经过审了。

---

总结：网页侧用 `navigator.modelContext.registerTool()` 注册工具（传入包含 execute 函数的对象），浏览器引擎做中间人，扩展侧用 `navigator.modelContextTesting.listTools()` / `executeTool()` 消费。两套 API，浏览器引擎桥接，不需要 postMessage。我们的 Phase 0 可以直接基于 `modelContextTesting` 快速验证，后续再补 polyfill fallback。



好的，补充一下报告里涉及的两个关键 GitHub 仓库地址：

1. **工具消费端（Inspector 扩展）**
   https://github.com/nicolo-ribaudo/model-context-tool-inspector
   — Google 官方的 Chrome Side Panel 扩展，用 `navigator.modelContextTesting` 消费网页注册的工具，内置了 Gemini Agent loop。

   等等，之前搜的时候 nicolo-ribaudo 404 了。让我确认一下到底是谁的仓库。

好，确认了。现在让我也确认一下 webmcp-tools demo 的地址。

好，还发现了一个新的 demo — `french-bistro`（声明式工具定义）。现在地址全部确认了，补充如下：

---

报告里涉及的 GitHub 仓库地址：

1. **WebMCP 工具集合（总仓库）**
   https://github.com/GoogleChromeLabs/webmcp-tools
   — GoogleChromeLabs 官方仓库，包含 demos、evals-cli，以及 Inspector 扩展作为 git submodule

2. **工具提供端 Demo — 航班搜索（命令式）**
   https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/react-flightsearch
   — React 应用，展示网页如何通过 `navigator.modelContext.registerTool()` 注册工具，核心文件是 `src/webmcp.ts`

3. **工具提供端 Demo — 法式餐厅预订（声明式）**
   https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/french-bistro
   — 声明式工具定义的示例，用 form + 标准 HTML 属性暴露工具，不需要写 JS

4. **工具消费端 — Model Context Tool Inspector 扩展**
   https://github.com/beaufortfrancois/model-context-tool-inspector
   — Chrome Side Panel 扩展，用 `navigator.modelContextTesting` 消费网页注册的工具，内置 Gemini Agent loop。已上架 Chrome Web Store。

5. **WebMCP Evals CLI**
   https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/evals-cli
   — 评估 LLM 工具调用能力的 CLI 工具，定义测试用例验证 Agent 是否正确调用工具

这五个地址基本覆盖了 WebMCP 目前公开的全部官方参考实现。其中 1 是总入口，2/3 是 Provider 端的两种模式（命令式 vs 声明式），4 是 Consumer 端，5 是测试评估工具。