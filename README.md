![wordcloud.png](https://i.loli.net/2020/03/18/DMS4XLyuNsYK8c3.png)

# 京吹学报

## 简介

本站为广大吹学爱好者记录吹学著作所用，使用 [Zola](https://www.getzola.org/themes/) 在 [GitHub Pages](https://hibikilogy.github.io/) 上部署。

## 如何贡献

### 文章投稿

文章投稿相关请参考网页 [【我要投稿】](https://hibikilogy.github.io/docs/contribute) 相关指引

### 代码贡献

#### 概览

我们使用静态站点生成器（Zola）进行网站构建，Sass 作为 CSS 预处理工具，CommonMark 规范的 Markdown 进行内容编写。

项目文件夹架构如下：

- `.github`：存放 GitHub 项目相关配置文件和 Github Action 工作流配置文件。
- `content`：存放网站文章和相关文档。
- `static`：包含任何类型的文件。目录中的所有文件/目录都将按原样复制到输出目录。
- `public`：项目编译后的输出文件夹。
- `sass`：包含要编译的 Sass 文件。非 Sass 文件将被忽略。 复制已编译的文件时，将保留文件夹的目录结构。
- `template`：包含将用于呈现网站的所有 [Tera](https://keats.github.io/tera) 模板。 查看Zola的[模板文档](https://www.getzola.org/documentation/templates/)以了解有关默认模板的更多信息和可用变量
- `themes`：主题文件夹（TODO）
- `config.toml`：TOML格式的强制性Zola配置文件。具体可参照 Zola[配置文档](https://www.getzola.org/documentation/getting-started/configuration/)

#### 开发配置

开发要求：

- [Node.js](http://nodejs.org) **version 18+**
- [Zola](https://www.getzola.org/documentation/getting-started/installation/) **version 0.18+**

克隆代码仓库

启动开发服务器：


```bash
zola serve

# http://127.0.0.1:1111/
```

构建网站：

```bash
zola build 

# Output to public
```


构建搜索索引：

```bash
npx pagefind --site public

# 更新索引必须先完成构建网站
```

## 免责声明

京吹学报所收录文章仅代表作者个人观点，不代表《京吹学报》的立场与观点。

## LICENSE

本网站的代码使用 [MIT](./LICENSE) 协议进行开源授权，但其相关文章版权属于投稿作者不在其开源授权范围内，未经允许请勿转载。
