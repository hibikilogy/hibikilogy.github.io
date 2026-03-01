# 🎉 京吹学报优化更新

## 更新日期：2024

本次更新为京吹学报添加了三个重要功能，提升了网站的可用性和贡献体验。

---

## ✨ 新增功能

### 1. 🧪 自动化内容验证

**文件：** `.github/workflows/content-validation.yml`

每次提交代码时自动运行以下检查：

- ✅ YAML Front Matter 格式验证
- ✅ 文件命名规范检查（YYYY-MM-DD-title.md）
- ✅ 图片引用完整性验证
- ✅ 外部链接有效性检查
- ✅ Jekyll 构建测试

**好处：**
- 防止格式错误的文章被合并
- 提前发现问题，减少返工
- 保证网站构建成功
- 提升内容质量

### 2. 🌙 深色模式

**文件：**
- `less/dark-mode.less` - 深色模式样式源文件
- `css/dark-mode.css` - 编译后的样式文件
- `_includes/head.html` - 添加深色模式支持
- `_includes/nav.html` - 添加主题切换按钮

**功能特点：**
- 🌓 一键切换深色/浅色主题
- 💾 自动保存用户偏好
- ⚡ 无闪烁加载
- 🎨 完整的深色主题适配
- 👁️ 护眼设计，适合夜间阅读

**使用方法：**
点击导航栏右上角的月亮/太阳图标即可切换主题。

### 3. 📝 投稿模板系统

**文件：**
- `.github/ISSUE_TEMPLATE/submit-article.md` - Issue 投稿模板
- `.github/ISSUE_TEMPLATE/config.yml` - Issue 模板配置
- `.github/pull_request_template.md` - PR 模板
- `_posts/_TEMPLATE.md` - 文章模板
- `CONTRIBUTING.md` - 详细投稿指南

**功能特点：**
- 📋 标准化的投稿流程
- 📝 详细的文章模板
- ✅ 提交前检查清单
- 📖 完整的使用说明
- 🎯 降低贡献门槛

**投稿方式：**
1. **GitHub Issue**：适合不熟悉 Git 的用户
2. **Pull Request**：适合熟悉 Git 的开发者

---

## 📁 新增文件清单

```
.github/
├── ISSUE_TEMPLATE/
│   ├── submit-article.md          # Issue 投稿模板
│   └── config.yml                 # Issue 配置
├── pull_request_template.md       # PR 模板
└── workflows/
    └── content-validation.yml     # 自动化测试

_posts/
└── _TEMPLATE.md                   # 文章模板

less/
└── dark-mode.less                 # 深色模式样式源文件

css/
└── dark-mode.css                  # 深色模式编译后样式

CONTRIBUTING.md                    # 投稿指南
OPTIMIZATION_GUIDE.md              # 优化功能使用指南
UPDATES.md                         # 本文件
```

---

## 🚀 快速开始

### 启用深色模式

1. 访问网站
2. 点击导航栏右上角的月亮图标
3. 主题自动切换并保存

### 投稿文章

**方式一：GitHub Issue（推荐新手）**
1. 访问 [Issues 页面](https://github.com/hibikilogy/hibikilogy.github.io/issues/new/choose)
2. 选择"📝 投稿文章"
3. 填写表单并提交

**方式二：Pull Request（推荐熟悉 Git 的用户）**
```bash
# 1. Fork 并克隆仓库
git clone https://github.com/YOUR_USERNAME/hibikilogy.github.io.git

# 2. 使用模板创建文章
cp _posts/_TEMPLATE.md _posts/2024-06-15-my-article.md

# 3. 编辑文章
vim _posts/2024-06-15-my-article.md

# 4. 提交
git add _posts/2024-06-15-my-article.md
git commit -m "Add: 我的新文章"
git push

# 5. 在 GitHub 上创建 Pull Request
```

### 本地开发

```bash
# 安装依赖
gem install jekyll jekyll-paginate

# 启动本地服务器
jekyll serve

# 访问 http://127.0.0.1:4000
```

---

## 🔧 开发者指南

### 编译深色模式样式

如果修改了 `less/dark-mode.less`，需要重新编译：

```bash
# 安装 Less
npm install -g less less-plugin-clean-css

# 编译
lessc less/dark-mode.less css/dark-mode.css

# 或使用 Grunt（如果配置了 package.json）
grunt less
```

### 自定义深色模式颜色

编辑 `less/dark-mode.less` 中的颜色变量：

```less
@dark-bg: #1a1a1a;              // 背景色
@dark-bg-secondary: #2d2d2d;    // 次要背景色
@dark-text: #e0e0e0;            // 文字色
@dark-text-secondary: #b0b0b0;  // 次要文字色
@dark-border: #404040;          // 边框色
@dark-link: #6eb5ff;            // 链接色
@dark-link-hover: #9fd3ff;      // 链接悬停色
```

### 修改投稿模板

- **Issue 模板**：编辑 `.github/ISSUE_TEMPLATE/submit-article.md`
- **PR 模板**：编辑 `.github/pull_request_template.md`
- **文章模板**：编辑 `_posts/_TEMPLATE.md`

### 调整自动化测试

编辑 `.github/workflows/content-validation.yml` 来修改验证规则。

---

## 📊 功能对比

| 功能 | 更新前 | 更新后 |
|------|--------|--------|
| 内容验证 | ❌ 手动检查 | ✅ 自动化测试 |
| 主题切换 | ❌ 仅浅色 | ✅ 深色/浅色 |
| 投稿流程 | ⚠️ 不够规范 | ✅ 标准化模板 |
| 文章模板 | ❌ 无 | ✅ 完整模板 |
| 使用文档 | ⚠️ 简单 | ✅ 详细指南 |

---

## 🎯 未来计划

- [ ] 添加搜索功能
- [ ] 优化移动端体验
- [ ] 添加文章评分系统
- [ ] 集成更多社交分享
- [ ] 性能优化（图片懒加载等）
- [ ] 添加 RSS 订阅优化
- [ ] 集成 Algolia 搜索

---

## 📚 相关文档

- [投稿指南](CONTRIBUTING.md) - 详细的投稿说明
- [优化功能使用指南](OPTIMIZATION_GUIDE.md) - 三个新功能的详细使用方法
- [README](README.md) - 项目基本信息

---

## 🙏 致谢

感谢所有为京吹学报做出贡献的作者和读者！

如有问题或建议，欢迎在 [Issues](https://github.com/hibikilogy/hibikilogy.github.io/issues) 中反馈。

---

**京吹学报** 🎺
让我们一起记录和分享对《吹响！上低音号》的热爱！
