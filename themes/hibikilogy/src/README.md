# TypeScript 架构

适用于 `themes/hibikilogy/src/`。Lit Web Components 位于 `../components/`，CMS 位于根目录 `cms/`。

## 生命周期

入口：`ui/ui.ts -> startApp -> AppContext -> PageContext -> page modules`。

| Scope | 生命周期 | 内容 |
|---|---|---|
| AppScope | 启动至 `pagehide` | Route、SearchService、全局导航 |
| PageScope | 当前 `#app` 存在期间 | PageData、Layout、页面 Feature |

Swup 替换 `#app` 时先销毁旧 PageScope。应用服务不能保存页面 DOM；listener、watcher、observer、timer 和 subscription 必须随 scope 清理。

## 分层与依赖

| 目录 | 职责 |
|---|---|
| `app/` | 生命周期、依赖组合、PageKind 调度 |
| `features/` | Search、Waterfall 等业务能力 |
| `infrastructure/` | Swup 适配、网络质量监测 |
| `ui/` | DOM adapter、ARIA、动画 |
| `shared/` | 小型通用函数和稳定契约 |

```text
entry -> app -> features / infrastructure / ui
features -> infrastructure / shared
ui -> shared
infrastructure -> shared
```

- `app` 只组合，不实现业务算法。
- Feature 内按需拆为 `core/`、`hooks/`、`runtime/`、`page/`。
- `core` 只接收显式输入，不读取 DOM、Worker、缓存或 Swup。
- Infrastructure 封装外部机制；UI 只渲染并派发 action。
- Shared 不作杂项目录。`shared/runtime-config/` 存放站点运行时配置（虚拟模块），其余共享代码集中在 `shared/` 各文件。
- 跨模块从 `index.ts` 导入；模块内部直接导入实现文件。
- `index.ts` 只组合或导出，禁止从自己的 barrel 回引。

PageKind 模块：

| PageKind | 模块 |
|---|---|
| `article` | Article、Accordion、Outline |
| `journal` | Waterfall |
| `search` | Waterfall、Search page |
| `default` | 无 |

## 状态与数据流

| 状态 | 所有者 |
|---|---|
| URL、导航类型和进度 | `useRoute` |
| 导航进度条 | `useNavigationProgress` |
| 请求优先级、fetch 延迟样本 | `useNavigationPriority` |
| 页面预加载队列与在途预加载 | `SwupPagePreloadPlugin` |
| Navbar、滚动和视口 | `useLayout` |
| 页面类型 | `resolvePageData` |
| 搜索 query、phase、response、error | `useSearch` |
| 搜索索引状态 | `SearchService` |
| 搜索成功快照 | `SnapshotStore` |
| Waterfall 布局 | `WaterfallController` |
| class、ARIA、动画节点 | 对应 UI adapter |

```text
event -> action -> owning hook/service -> state -> computed ViewModel -> render
```

禁止：

- 多个 hook 保存同一字段；
- watcher 互相回写；
- renderer 修改 Route、History、Snapshot 或业务状态；
- DOM 同时作为业务状态和渲染结果；
- 用 `window` 或全局 `CustomEvent` 同步内部模块；
- 保存可由 `computed` 得到的值。

## Hooks 与 DOM

项目仅使用 `@vue/reactivity`，不使用完整 Vue renderer。

- Hook 命名为 `useXxx.ts`，只在 AppScope 或 PageScope 创建。
- 返回 readonly state、computed 和语义化 action。
- Watcher 只连接外部副作用；所有副作用随 scope 清理。
- 纯解析和集合操作放在 core 或 utility。

共享 selector 放在最近的所有者：

| 范围 | 配置 |
|---|---|
| 页面 | `shared/selectors.ts#pageDom` |
| Navbar | `ui/navbar/config.ts#navbarDom` |
| Outline | `ui/outline/config.ts#outlineDom` |
| Search | `features/search/searchDom.ts#searchDom` |

单文件 selector 保持局部。DOM contract 变更同时检查模板、CSS、TS、fixture 和 Shadow DOM。内部意图使用 `data-action`；Web Component 可使用具名 `CustomEvent`，由所属 Feature 消费。

## 错误处理

```ts
const [data, error] = catchError(() => parseValue(raw))
const [response, requestError] = await catchAsyncError(() => service.search(query))
```

用于安全解析、可选能力和“异常即结果”。涉及资源清理、重试、fallback、重抛或多阶段恢复时保留显式 `try/catch/finally`。不要吞掉错误或上下文。

## 关键 Feature

### Search

`q`、`p`、`sort` 的 URL 是持久化权威来源：

```text
action -> route.replace -> useRoute -> useSearch
       -> Snapshot/SearchService -> SearchPageState -> SearchView
```

- requestId 阻止旧请求提交。
- Snapshot 只缓存成功响应，以完整 SearchLocation 为 key。
- Worker 失败后才加载主线程 fallback。
- Fuse 和搜索引擎不进入主 `ui.js` 初始依赖图。
- 搜索分页事件在 Search page 边界消费。

### Waterfall

Controller 自行监听内容、尺寸、图片、字体和窗口变化；布局合并到 animation frame，签名未变化时跳过写入。外部模块不得调用 `refreshWaterfall()`。

### Outline

Hash 链接使用原生滚动并绕过 Swup。无滚动 hash 同步由 Route/History adapter 处理。

## 文件约定

- 文件 camelCase；多词目录 kebab-case。
- Hook 使用 `useXxx.ts`；注册型初始化使用 `setupXxx.ts`；纯解析使用 `resolveXxx`。
- 公开入口使用 `index.ts`。
- 类型放在最近的 `types.ts`。
- 测试与实现同目录，命名为 `*.test.ts`。
- 按职责拆文件，不按行数拆分。

新增功能时依次明确权威状态、scope、外部边界、hook actions、page module、DOM adapter 和测试；最后检查 bundle 与浏览器行为。

## Review 清单

- 状态是否只有一个所有者？
- 快速操作、直接加载、前进/后退是否一致？
- 旧请求和已销毁 scope 能否继续提交？
- 文件是否位于正确层，是否出现反向依赖或循环 barrel？
- Renderer 是否越权写状态？
- 抽象是否有真实复用和清晰语义？
- Selector、模板、CSS、fixture 是否同步？
- class、ARIA、focus 是否由同一 adapter 更新？
- 是否错误穿透 Shadow DOM？
- 错误应作为结果、fallback 还是传播？
- `catchError` 是否隐藏清理或上下文？
- 是否增加主 bundle 或形成 observer 自循环？
- 动画是否可取消并支持 reduced motion？
- 是否覆盖 race、cleanup、popstate 和无效输入？
- 是否误改构建产物，PR 是否说明验证结果和限制？

## 验证

主 Vite 构建先清空并写入根目录 `dist/`，再按 bundle 清单同步到主题 `static/`。不要直接修改 `dist/` 或 `static/js/` 中的生成文件。

```bash
pnpm verify:ts       # typecheck、测试、TS lint、Vite、Admin
pnpm lint            # Vite + zola check
zola build
cargo test --locked
```

Route、Search、Outline、Navbar、Waterfall 和页面过渡还需验证直接加载、Swup 导航、前进/后退、hash 滚动和重复 listener。
