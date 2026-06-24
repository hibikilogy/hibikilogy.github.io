+++
title = "Markdown"
template = "docs.html"
in_search_index = false

[extra]
catalog = true
+++

# Markdown {#markdown-extensions}

《京吹学报》支持的内置的 Markdown 相关语法。

## 标题

# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

### 输入

```md
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
```

---

## 链接

### Demo

[Join Us](@/docs/join-us.md)

### 输入

```md
[Join Us](@/docs/join-us.md)
```

---

## 引用

### Demo

> 她的眼中，究竟映照出了什么呢？

### 输入

```md
> 她的眼中，究竟映照出了什么呢？
```

## 分割线

### Demo

Before

---

After

### 输入

```md
Before

---

After
```

---

## 无序列表

### Demo

- Foo
- Bar
- Baz

### 输入

```md
- Foo
- Bar
- Baz
```

---

## 有序列表

### Demo

1. Foo
2. Bar
3. Baz

### 输入

```md
1. Foo
2. Bar
3. Baz
```

---

## 段落

### Demo

她的眼中，究竟映照出了什么呢？

### 输入

```md
她的眼中，究竟映照出了什么呢？
```

---

## 加粗

### Demo

**Just a strong paragraph.**

### 输入

```md
**Just a strong paragraph.**
```

---

## 斜体

### Demo

_Just an italic paragraph._

### 输入

```md
_Just an italic paragraph._
```

## 删除线

### Demo

~~The world is flat.~~ We now know that the world is round.~~

### 输入

```md
~~The world is flat.~~ We now know that the world is round.~~
```

## Task List

### Demo

- [x] Write the press release
- [ ] Update the website
- [ ] Contact the media

### 输入

```markdown
- [x] Write the press release
- [ ] Update the website
- [ ] Contact the media
```

## 标题锚点 {#header-anchors}

标题会自动应用锚点。可以使用 `markdown.anchor` 选项配置锚点的渲染。

### 自定义锚点 {#custom-anchors}

要为标题指定自定义锚点而不是使用自动生成的锚点，请向标题添加后缀：

```markdown
# 使用自定义锚点 {#my-anchor}
```

这允许将标题链接为 `#my-anchor`，而不是默认的 `#使用自定义锚点`。

## 链接 {#links}

内部和外部链接都会被特殊处理。

## Footnote {#footnote}

### Demo

Here's a simple footnote[^1]

[^1]: This is the first footnote.

### 输入

```markdown
Here's a simple footnote[^1]

[^1]: This is the first footnote.

```

### 内部链接 {#internal-links}

内部链接将转换为单页导航的路由链接。此外，子目录中包含的每个 `index.md` 都会自动转换为 `index.html`，并带有相应的 URL `/`。

例如，给定以下目录结构：

```
.
├─ index.md
├─ foo
│  ├─ index.md
│  ├─ one.md
│  └─ two.md
└─ bar
   ├─ index.md
   ├─ three.md
   └─ four.md
```

假设现在处于 `foo/one.md` 文件中：

```md
[Home](/) <!-- 将用户导航至根目录下的 index.html -->
[foo](/foo/) <!-- 将用户导航至目录 foo 下的 index.html -->
[foo heading](./#heading) <!-- 将用户锚定到目录 foo 下的index文件中的一个标题上 -->
[bar - three](../bar/three) <!-- 可以省略扩展名 -->
[bar - three](../bar/three.md) <!-- 可以添加 .md -->
[bar - four](../bar/four.html) <!-- 或者可以添加 .html -->
```

## Frontmatter {#frontmatter}

[TOML 格式的 frontmatter](https://www.getzola.org/documentation/content/page/)

```yaml
title = ""
description = ""

# 文章的发布日期。
# 允许两种格式：YYYY-MM-DD（2012-10-02）和 RFC3339（2002-10-02T15:00:00Z）。
# 不要用引号包裹日期；下面这一行只是表示没有默认日期。
# 设置此项会覆盖文件名中设置的日期。
date =

# 文章的最后更新日期，如果与发布日期不同。
# 格式与 `date` 相同。
updated =

# 权重，其定义见文档中的 Section 页面。
# 如果 section 变量 `sort_by` 设置为 `weight`，那么任何缺少 `weight`
# 的页面都不会被渲染。
weight = 0

# 草稿页面只有在向 `zola build`、`zola serve` 或 `zola check`
# 传入 `--drafts` 标志时才会被加载。
draft = false

# 设置为 "false" 时，Zola 不会为该页面创建一个单独的文件夹，
# 也不会在其中生成 index.html。
render = false

# 如果设置了此项，将使用该 slug 代替文件名来生成 URL。
# section 路径仍然会被使用。
slug = ""

# 内容将出现的路径。
# 如果设置了此项，它不能是空字符串，并且会覆盖 `slug` 和文件名。
# section 的路径不会被使用。
# 它不应以 `/` 开头；如果以 `/` 开头，该斜杠会被移除。
path = ""

# 如果你正在移动内容，但希望将旧 URL 重定向到当前 URL，
# 可以使用 aliases。这里接受的是路径数组，而不是 URL。
aliases = []

# 页面作者列表。如果启用了站点 feed，第一个作者（如果存在）
# 会在默认 feed 模板中作为页面作者使用。
authors = []

# 设置为 "true" 时，页面会进入搜索索引。仅当 Zola 配置中的
# `build_search_index` 设置为 "true"，并且父 section 没有在 front matter 中
# 将 `in_search_index` 设置为 "false" 时，此项才会生效。
in_search_index = true

# 用于渲染该页面的模板。
template = "page.html"

[taxonomies]
# 文章的相关 Tags
tags = ["剑崎梨梨花", "久石奏", "黄前久美子", "黄前十八年", "驳文", "NGA"]
# 文章作者
author = ["JF123258"]

[extra]
# 文章原文链接
original = "https://www.bilibili.com/read/cv4947159"

# 是否启用文章页面右边的目录导航
catalog = true

# 文章封面图片链接（Optional）
cover = "/imgs/2020-02-06-weishenmelishixuanzeleririka/001-ptgjwaq3avsoylb.png"

# 文章摘要 
abstract = "本文系统性的驳斥了《[为什么历史选择了久石奏](@/articles/2020-01-07-weishenmelishixuanzelekanade.md)》中种种错误观点，并对于黄前四年北宇治吹奏部新一代领导核心，建立了自己的科学预测成果  关键词：吹响吧上低音号 政治光谱 性格分析"
```

## GitHub 风格的表格 {#github-style-tables}

**输入**

```
| Tables        |      Are      |  Cool |
| ------------- | :-----------: | ----: |
| col 3 is      | right-aligned | $1600 |
| col 2 is      |   centered    |   $12 |
| zebra stripes |   are neat    |    $1 |
```

**输出**

| Tables        |      Are      |   Cool |
| ------------- | :-----------: | -----: |
| col 3 is      | right-aligned | \$1600 |
| col 2 is      |   centered    |   \$12 |
| zebra stripes |   are neat    |    \$1 |

## Emoji :tada:

**输入**

```
:tada: :100:
```

**输出**

:tada: :100:

## GitHub 风格的警报 {#github-flavored-alerts}

支持以标注的方式渲染 [GitHub 风格的警报](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts)。

```md
> [!NOTE]
> 强调用户在快速浏览文档时也不应忽略的重要信息。

> [!TIP]
> 有助于用户更顺利达成目标的建议性信息。

> [!IMPORTANT]
> 对用户达成目标至关重要的信息。

> [!WARNING]
> 因为可能存在风险，所以需要用户立即关注的关键内容。

> [!CAUTION]
> 行为可能带来的负面影响。
```

> [!NOTE]
> 强调用户在快速浏览文档时也不应忽略的重要信息。

> [!TIP]
> 有助于用户更顺利达成目标的建议性信息。

> [!IMPORTANT]
> 对用户达成目标至关重要的信息。

> [!WARNING]
> 因为可能存在风险，所以需要用户立即关注的关键内容。

> [!CAUTION]
> 行为可能带来的负面影响。

## 代码块中的语法高亮 {#syntax-highlighting-in-code-blocks}

Zola 使用 [Giallo](https://github.com/getzola/giallo) 在 Markdown 代码块中使用彩色文本实现语法高亮。这是一个基于 VSCode 语法和主题的库。

您可以在 README 中查看支持的语言和主题的完整列表：<https://github.com/getzola/giallo?tab=readme-ov-file#built-in>

## 数学方程 {#math-equations}

**输入**

```md
When $a \ne 0$, there are two solutions to $(ax^2 + bx + c = 0)$ and they are
$$ x = {-b \pm \sqrt{b^2-4ac} \over 2a} $$

**Maxwell's equations:**

| equation                                                                                                                                                                  | description                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| $\nabla \cdot \vec{\mathbf{B}}  = 0$                                                                                                                                      | divergence of $\vec{\mathbf{B}}$ is zero                                               |
| $\nabla \times \vec{\mathbf{E}}\, +\, \frac1c\, \frac{\partial\vec{\mathbf{B}}}{\partial t}  = \vec{\mathbf{0}}$                                                          | curl of $\vec{\mathbf{E}}$ is proportional to the rate of change of $\vec{\mathbf{B}}$ |
| $\nabla \times \vec{\mathbf{B}} -\, \frac1c\, \frac{\partial\vec{\mathbf{E}}}{\partial t} = \frac{4\pi}{c}\vec{\mathbf{j}}    \nabla \cdot \vec{\mathbf{E}} = 4 \pi \rho$ | _wha?_                                                                                 |
```

**输出**

When $a \ne 0$, there are two solutions to $(ax^2 + bx + c = 0)$ and they are
$$ x = {-b \pm \sqrt{b^2-4ac} \over 2a} $$

**Maxwell's equations:**

| equation                                                                                                                                                                  | description                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| $\nabla \cdot \vec{\mathbf{B}}  = 0$                                                                                                                                      | divergence of $\vec{\mathbf{B}}$ is zero                                               |
| $\nabla \times \vec{\mathbf{E}}\, +\, \frac1c\, \frac{\partial\vec{\mathbf{B}}}{\partial t}  = \vec{\mathbf{0}}$                                                          | curl of $\vec{\mathbf{E}}$ is proportional to the rate of change of $\vec{\mathbf{B}}$ |
| $\nabla \times \vec{\mathbf{B}} -\, \frac1c\, \frac{\partial\vec{\mathbf{E}}}{\partial t} = \frac{4\pi}{c}\vec{\mathbf{j}}    \nabla \cdot \vec{\mathbf{E}} = 4 \pi \rho$ | _wha?_                                                                                 |

## 图片处理 {#image-lazy-loading}

Zola 支持对图片进行自动调整图片大小，和指定输出格式。

详见：<https://www.getzola.org/documentation/content/image-processing/>

## Accordion Shortcode {#accordion-shortcode}

### Demo

{% accordion(type="single", collapsible=true, defaultValue="item-1") %}
:::item item-1
:::title
What is this shortcode?
:::content
A native `details` / `summary` based accordion for Markdown content pages.

:::item item-2
:::title
Can the content render Markdown?
:::content
Yes. You can use **bold text**, lists, and other inline Markdown in the content body.

:::item item-3
:::title
Does it support multiple open items?
:::content
Set `type` to `multiple` to allow more than one item to stay open at the same time.
{% end %}

### 输出

````md
{%/* accordion(type="single", collapsible=true, defaultValue="item-1") %}
:::item item-1
:::title
What is this shortcode?
:::content
A native `details` / `summary` based accordion for Markdown content pages.

:::item item-2
:::title
Can the content render Markdown?
:::content
Yes. You can use **bold text**, lists, and other inline Markdown in the content body.

:::item item-3
:::title
Does it support multiple open items?
:::content
Set `type` to `multiple` to allow more than one item to stay open at the same time.
{% end */%}
````

### Parameters

- `accordion`
- `type`: `single` or `multiple`
- `collapsible`: whether the currently open item can be collapsed
- `defaultValue`: default open item value, or an array of values when `type="multiple"`
- `:::item <value>`: item identifier used by `defaultValue`
- `:::title`: item title slot, rendered as Markdown
- `:::content`: item content slot, rendered as Markdown

## Collapsible {#collapsible}

### Demo

{% collapsible(defaultOpen=true) %}
:::title
What does this component do?
:::content
It provides a single native `details` block with a title slot and a content slot.
{% end %}

### 输出

````md
{%/* collapsible(defaultOpen=true) %}
:::title
What does this component do?
:::content
It provides a single native `details` block with a title slot and a content slot.
{% end */%}
````

## Bilibili Iframe {#bilibili-iframe}

### Demo

{{ bilibili(
  bvid="BV1vq421F7c5"
  aid="1452814123",
  title="吹響吧！上低音號 第三季",
  ratio="16 / 9"
) }}

一个自定义空降地址的 B 站视频

{{ bilibili(
  bvid="BV1vq421F7c5"
  aid="1452814123",
  title="吹響吧！上低音號 第三季",
  ratio="16 / 9"
  time="120"
) }}


### Input

````md
{{/* bilibili(
  bvid="BV1vq421F7c5"
  aid="1452814123",
  title="吹響吧！上低音號 第三季",
  ratio="16 / 9"
) */}}


{{/* bilibili(
  bvid="BV1vq421F7c5"
  aid="1452814123",
  title="吹響吧！上低音號 第三季",
  ratio="16 / 9"
  time="120"
) */}}
````

### Parameters

- `bilibili`: shortcode name
- `bvid`: B 站视频 `bvid`
- `aid`: B 站视频 `aid`
- `cid`: B 站视频 `cid`, when used with `aid`
- `title`: iframe title text, default `A BiliBili video`
- `page`: 分P视频默认为 1 ，设置视频分 P 时，必须提供 aid 和 cid，并且可以忽略 bvid 属性
- `width`: iframe width, default `100%`
- `height`: iframe height; if omitted, component uses `ratio`
- `ratio`: CSS `aspect-ratio`, default `16 / 9`
- `time`: start time in seconds, default `0`
- `autoplay`: whether autoplay is enabled

---

## UnoCSS {#unocss}

我们集成了 [UnoCSS](https://unocss.dev/) 作为原子化 CSS 引擎，你可以在 Markdown 内容中通过行内 HTML 直接使用工具类。

### Wind4 预设 {#unocss-wind4}

基于x `presetWind4` 提供了与 Tailwind CSS / Windi CSS 兼容的工具类，涵盖文字、颜色、布局、间距、尺寸等常用样式。

**输入**

```html
<span class="text-red-500 font-bold text-lg">红色加粗文字</span>

<div class="flex flex-wrap gap-2">
  <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded">标签 1</span>
  <span class="bg-green-100 text-green-800 px-2 py-1 rounded">标签 2</span>
</div>
```

**输出**

<span class="text-red-500 font-bold text-lg">红色加粗文字</span>

<div class="flex flex-wrap gap-2">
  <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded">标签 1</span>
  <span class="bg-green-100 text-green-800 px-2 py-1 rounded">标签 2</span>
</div>

更多可用工具类请参考 [UnoCSS 交互文档](https://unocss.dev/interactive/)。

### Attributify 模式 {#unocss-attributify}

除了标准 class 写法，也同时支持 Attributify 模式，可将工具类直接作为 HTML 属性书写：

**输入**

```html
<div flex="~ wrap" gap-2>
  <span bg="blue-100" text="blue-800" p="x-2 y-1" rounded>标签</span>
</div>
```

**输出**

<div flex="~ wrap" gap-2>
  <span bg="blue-100" text="blue-800" p="x-2 y-1" rounded>标签</span>
</div>

### 图标 {#unocss-icons}

站点通过 UnoCSS 的 `presetIcons` 内置了一套自定义 SVG 图标，以 `i-custom-{name}` 的 class 形式提供。图标源文件位于 `static/svg/` 目录。

**输入**

```html
<span class="i-custom-down inline-block h-[1.25em] w-[1.25em] align-sub"></span>
```

**输出**

<span class="i-custom-down inline-block h-[1.25em] w-[1.25em] align-sub"></span>

**添加自定义图标**

将 SVG 文件放入 `static/svg/` 目录，UnoCSS 会自动将其注册为 `i-custom-{文件名}` 图标类。在 Markdown 或模板中使用该类名后，构建系统会自动生成对应的 CSS。
