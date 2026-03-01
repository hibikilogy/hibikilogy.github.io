# 投稿指南

欢迎为京吹学报贡献内容！本文档将帮助您了解如何投稿。

## 📝 投稿方式

### 方式一：通过 GitHub Issue（推荐新手）

1. 访问 [Issues 页面](https://github.com/hibikilogy/hibikilogy.github.io/issues/new/choose)
2. 选择"📝 投稿文章"模板
3. 填写文章信息和内容
4. 提交 Issue，等待审核

### 方式二：通过 Pull Request（推荐熟悉 Git 的用户）

1. Fork 本仓库
2. 在 `_posts` 目录下创建新文章
3. 提交 Pull Request

## 📄 文章格式要求

### 文件命名

文件名格式：`YYYY-MM-DD-title.md`

示例：`2024-06-15-kumiko-leadership-analysis.md`

### YAML Front Matter

每篇文章开头必须包含以下信息：

```yaml
---
layout: post
title: 文章标题
subtitle: 副标题（可选）
author: 作者名
original: 原文链接（如有）
header-img: 顶部图片链接（可选）
catalog: true
tags:
    - 标签1
    - 标签2
---
```

### 必填字段

- `layout`: 固定为 `post`
- `title`: 文章标题
- `author`: 作者名
- `tags`: 至少一个标签

### 推荐标签

- 角色名：黄前久美子、高坂丽奈、伞木希美、铠冢霙等
- 事件：南中之乱、部长失格、黄前十七年等
- 来源平台：bilibili、Stage1、NGA、虎扑、贴吧等

## 🖼️ 图片处理

### 图片存放

1. 在 `images/` 目录下创建日期文件夹：`images/YYYY-MM-DD/`
2. 将图片放入该文件夹
3. 使用相对路径引用：`../images/YYYY-MM-DD/filename.jpg`

### 图片格式

- 推荐使用 WebP 格式（体积小，加载快）
- 也支持 JPG、PNG 格式
- 图片文件名建议使用英文或数字

### 外部图床

也可以使用外部图床（如 i.loli.net），直接使用完整 URL。

## ✍️ Markdown 语法

### 标题

```markdown
## 二级标题
### 三级标题
#### 四级标题
```

### 强调

```markdown
**粗体文字**
*斜体文字*
```

### 列表

```markdown
无序列表：
* 项目一
* 项目二

有序列表：
1. 第一项
2. 第二项
```

### 引用

```markdown
> 这是引用的内容
> 可以多行
```

### 链接

```markdown
[链接文字](https://example.com)
```

### 图片

```markdown
![图片描述](../images/2024-06-15/example.jpg)
```

### 表格

```markdown
| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 内容1 | 内容2 | 内容3 |
```

## 🔍 本地预览

### 安装依赖

```bash
# 安装 Ruby 和 Jekyll
gem install bundler jekyll jekyll-paginate

# 克隆仓库
git clone https://github.com/hibikilogy/hibikilogy.github.io.git
cd hibikilogy.github.io
```

### 启动本地服务器

```bash
jekyll serve --config _config.yml
```

访问 `http://127.0.0.1:4000/` 预览网站。

## ✅ 提交前检查

- [ ] 文件名符合 `YYYY-MM-DD-title.md` 格式
- [ ] YAML front matter 完整且正确
- [ ] 文章内容无明显错别字
- [ ] 图片链接有效
- [ ] 标签准确且有意义
- [ ] 本地 Jekyll 构建成功（如果可以）

## 📋 文章模板

参考 `_posts/_TEMPLATE.md` 文件，里面包含了完整的文章结构示例。

## 🤝 审核流程

1. 提交 Issue 或 PR
2. 维护者审核内容
3. 如需修改，会在评论中说明
4. 审核通过后，文章将被发布到网站

## 💡 写作建议

1. **标题明确**：让读者一眼看出文章主题
2. **结构清晰**：使用标题层级组织内容
3. **论据充分**：引用原作情节或官方资料
4. **观点独特**：提出有见地的分析
5. **尊重他人**：理性讨论，避免人身攻击

## 📞 联系我们

- GitHub Issues: [提问或反馈](https://github.com/hibikilogy/hibikilogy.github.io/issues)
- GitHub Discussions: [参与讨论](https://github.com/hibikilogy/hibikilogy.github.io/discussions)

## 📜 版权说明

- 投稿文章的版权归原作者所有
- 转载文章需获得原作者授权
- 本站内容遵循 CC BY-NC-SA 4.0 协议

---

感谢您为京吹学报做出贡献！🎺
