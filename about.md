---
layout: page
title: 如何贡献
header-img: https://i.loli.net/2020/03/18/DMS4XLyuNsYK8c3.png
---
## 简介
本站为广大吹学爱好者记录吹学著作所用，使用 [Jekyll](http://jekyllcn.com) 在 ghpages 上部署。

## 如何贡献

### 自动化工具
本项目需要自动化工具的支持，但尚未完成。您可以选择到[项目仓库](https://github.com/hibikilogy/spiders)进行贡献。

目前已经适配的网站有：贴吧、bilibili、虎扑、Stage1、NGA，其中除了贴吧外都有一些小 bug，可能需要手工校正。

#### 使用方法
下载[项目仓库](https://github.com/hibikilogy/spiders)内对应的 .py 文件，根据 README 操作。

#### 其他
您也可以使用 [Copy as Markdown](https://chrome.google.com/webstore/detail/fkeaekngjflipcockcnpobkpbbfbhmdn)、[Copy Better](https://chrome.google.com/webstore/detail/hpihdokfdmmghaclaojfpmbckkhjgebc) 等插件来进行辅助。

### 基础
**Markdown 很简单，就跟 bbcode 一样，任何人可以参与。**

如需贡献，请注册一个 GitHub 账号，并把[本网站的仓库 fork 下来](https://github.com/hibikilogy/hibikilogy.github.io/fork)，在仓库的  `_posts` 目录下新建名称格式为 `yyyy-mm-dd-title.md` （例如 `2020-03-09-hello-world.md`）的文件，按照以下格式添加：

```markdown
---
layout: post
title: 标题
subtitle: 副标题，可空缺
author: 作者
original: 原文地址
header-img: 顶部图片，可空缺
catalog: true
tags:
    - 发布论坛（如 Stage1、NGA、虎扑、贴吧）
---
## 小标题
这是一个[示例文章](链接)。

### 小小标题
每一段要空行。

* 无序
* 列表

1. 有序
2. 列表

输入**粗体**，输入*斜体*。[^1]

输入<span style="color: red;">红色的字</span>。

[^1]: 可以添加注释

![图片文字](图片链接)
```

更多请查询 [markdown 语法](https://www.runoob.com/markdown/md-tutorial.html)。

添加完成后，再回到本网站仓库的界面，[提交 Pull Request](https://github.com/hibikilogy/hibikilogy.github.io/compare)。

如果有其他问题，请访问 [GitHub 官方文档](https://guides.github.com/)，或百度一下。

### 进阶
#### Jekyll
如果你了解 Jekyll 相关的技术，可以选择修改其他目录内的文件并提交 PR。
#### 脱离 Jekyll 单独修改 less
首先安装相关工具： 
```shell
npm i -g less && npm i -g less-plugin-clean-css
```
修改 `less` 目录下的文件，之后在根目录下运行以下命令：
```shell
lessc ./less/hux-blog.less ./css/hux-blog.css & lessc --clean-css ./less/hux-blog.less ./css/hux-blog.min.css
```
#### 长期贡献
如果需要进行长期的贡献<del>或者想要在 GitHub 用户界面添加一个组织</del>，请在[网站仓库的 issues](https://github.com/hibikilogy/hibikilogy.github.io/issues) 里添加加入申请。

<del>本组织目前持有者学业繁忙，很可能失踪，欢迎有意接替者。</del>