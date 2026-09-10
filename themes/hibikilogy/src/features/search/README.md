# 搜索架构、流程与行为契约

搜索是浏览器内的本地能力。Zola 生成正文索引和页面展示元数据，客户端优先在 Web Worker 中建立 Fuse.js 索引并执行查询；Worker 不可用或运行失败时，才动态加载主线程 fallback。

## 依赖方向

```text
app/useRoute
  → features/search/hooks/useSearch
  → SearchService
  → Worker (Comlink)
  → core

useSearch
  → computed ViewModel
  → page/searchView
  → Lit render
```

生产代码位于 `themes/hibikilogy/src/features/search/`：

```text
features/search/
├─ core/       纯查询、规范化、结果合并和标签聚合
├─ hooks/      URL 驱动的搜索状态与全局搜索入口交互
├─ page/       搜索页 DOM adapter、Lit 模板、分页和动效
├─ runtime/    Worker/主线程客户端、缓存和索引生命周期
├─ index.ts    公开入口
├─ searchPage.ts
├─ config.ts
├─ debug.ts
├─ types.ts
└─ utils.ts
```

边界约束：

- `core` 不依赖 DOM、Vue Reactivity、Worker、IndexedDB 或 Swup。
- `useSearch` 是搜索页面状态的唯一写入者。
- renderer 只消费 readonly state/computed ViewModel，不修改 URL、快照或业务状态。
- SearchService 不依赖 `@vue/reactivity`。
- 搜索模块不导入 Waterfall，也不发出手动刷新命令。
- 模块外部只通过 `features/search/index.ts` 使用搜索能力。

## 数据来源

| 数据 | 生成位置 | 用途 |
| --- | --- | --- |
| `search_index.zh.json` | Zola `build_search_index` | 标题、描述、正文、路径和日期 |
| `searchArticlesDataUrl`（`search-articles/`） | `templates/search-articles.html` | 副标题、封面、作者和发布日期 |
| `searchTagsDataUrl`（`search-tags/`） | `templates/search-tags.html` | 标签检索与当前页相关标签 |

索引 URL 和 Worker URL 来自 `hibikilogy-runtime-config` JSON 节点。旧的 `window.__HIBIKILOGY_*` 配置和 `window.navigateToSearch` 已删除。

展示元数据在引擎边界合并进 `SearchResultRecord`。页面不再为每篇文章异步查询元数据，也不会二次扫描结果 DOM。

## 单向数据流

```text
搜索操作
  → route.replace(SearchLocation)
  → useRoute.current
  → useSearch 监听 q/p/sort
  → Snapshot 恢复或 SearchService.search
  → SearchPageState
  → computed results/tags/pagination
  → 单次 Lit render
```

规则：

- `q`、`p`、`sort` 是查询状态的持久化权威来源。
- loading/result/error 不写入 URL。
- 同一搜索词的排序和翻页只重新计算 ViewModel，不重复查询引擎。
- 每个请求都有递增 request id；旧请求完成后不能覆盖新状态。
- Snapshot 只提交成功响应，并使用完整 SearchLocation 作为 key。
- 相关标签只从当前可见页的结果派生。
- 页面 scope 销毁时 watcher、DOM listener 和 service subscription 一并清理。

## Worker 与 fallback

`SearchService` 通过 Comlink 调用 `src/features/search/runtime/worker.ts`。Worker 初始化或请求失败时：

1. 终止失败 Worker；
2. 只创建一个共享 fallback Promise，避免并发失败重复建立索引；
3. 动态导入 `mainThreadClient.ts`；
4. 使用同一套纯 core 和 IndexedDB 缓存继续查询。

产物由 rolldown 自动代码分割：Fuse 与搜索引擎只从 Worker 入口和懒加载页面可达，首屏 `ui.js` 不静态加载它们；进入搜索页只加载页面层，Worker 正常时主线程仍不会加载 Fuse。

## URL 参数

| 参数 | 值 | 默认值 |
| --- | --- | --- |
| `q` | 非空查询字符串 | 空 |
| `p` | 大于等于 1 的整数 | `1` |
| `sort` | `title` | `relevance` |

第一页不写 `p`，相关度排序不写 `sort`。清空查询时同时删除三个参数。

示例：`/search?q=北宇治&p=2&sort=title`。

## 查询语法

| 形式 | 示例 | 语义 |
| --- | --- | --- |
| 普通词 | `北宇治` | 单词允许模糊匹配 |
| 多词 | `北宇治 久美子` | 默认 AND |
| 短语 | `"北宇治吹奏乐部"` | 严格短语 |
| 或 | `京吹 OR 北宇治` | 任一条件匹配 |
| 排除 | `京吹 NOT 久美子` | 排除指定条件 |
| 字段 | `title:京吹` | 严格字段查询 |

字段包括 `title`、`author`、`tag`、`body`、`description`、`slug` 及对应中文别名。未知字段按普通查询词处理。

## 展示与可访问性

- 标题不高亮，避免破坏排版和标题视图过渡；摘要最多高亮 6 个正向条件。
- 搜索结果由一次 Lit render 提交。
- 排序和分页只在结果超过一页时显示。
- `aria-busy` 反映加载状态，消息区域使用 `aria-live`。
- WaterfallController 监听结果容器增删和尺寸变化，搜索 renderer 无需协调布局。

## 验证

- `pnpm typecheck`
- `pnpm test:ts`
- `pnpm lint:ts`
- `pnpm build:vite`
- `pnpm benchmark:search`

Vitest 覆盖 SearchLocation、Snapshot、过期请求、当前页标签和 Waterfall 帧合并/销毁行为。
