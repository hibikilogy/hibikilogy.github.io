# 📋 项目结构重构 - 第二阶段方案

## 🎯 目标

进一步清理根目录，将剩余的文件按类型组织到合适的目录中，使根目录更加简洁。

## 📊 当前根目录文件分析

### 根目录文件（23 个）

#### 1. 必须保留在根目录的文件（7 个）
这些文件必须在根目录，因为 Jekyll、GitHub Pages 或浏览器需要在根目录找到它们：

- ✅ `index.html` - 网站首页（必须）
- ✅ `404.html` - 404 错误页面（必须）
- ✅ `CNAME` - GitHub Pages 自定义域名（必须）
- ✅ `feed.xml` - RSS 订阅（必须）
- ✅ `sw.js` - Service Worker（必须在根目录）
- ✅ `favicon.ico` - 网站图标（浏览器默认查找位置）
- ✅ `README.md` - 项目说明（GitHub 首页显示）

#### 2. 可以移动的文件（16 个）

**A. 重构文档（7 个）** → 移动到 `docs/refactoring/`
- `BEFORE_AFTER_COMPARISON.md`
- `MERGE_GUIDE.md`
- `PR_DESCRIPTION.md`
- `README_REFACTORING.md`
- `REFACTORING_CHECKLIST.md`
- `REFACTORING_COMPLETE.md`
- `REFACTORING_PROPOSAL.md`
- `REFACTORING_QUICKSTART.md`
- `REFACTORING_SUMMARY.md`

**B. 构建工具（1 个）** → 移动到 `tools/build/`
- `Gruntfile.js`

**C. 静态资源（3 个）** → 移动到 `public/`
- `apple-touch-icon-precomposed.png`
- `favicon.png`
- `offline.html`

**D. 临时文件（2 个）** → 移动到 `docs/migration/` 或删除
- `migration_paths_report.json`
- `migration_report.txt`
- `geckodriver.log` - 删除（测试日志）

#### 3. 可以删除的目录（1 个）
- `tests/` - 如果是空的或者旧的测试文件

## 🎯 优化后的根目录结构

```
hibikilogy.github.io/
├── .github/              # GitHub 配置
├── .jekyll-cache/        # Jekyll 缓存
├── _site/                # 构建输出（gitignore）
│
├── config/               # 配置文件
├── content/              # 内容文件
├── docs/                 # 文档
│   ├── refactoring/     # 🆕 重构文档
│   └── migration/       # 🆕 迁移报告
├── public/               # 公共文件
│   ├── icons/           # 🆕 图标文件
│   └── ...
├── pwa/                  # PWA 配置
├── src/                  # 源代码
├── tools/                # 工具脚本
│   └── build/           # 🆕 构建工具
│
├── 404.html              # ✅ 必须保留
├── CNAME                 # ✅ 必须保留
├── favicon.ico           # ✅ 必须保留
├── feed.xml              # ✅ 必须保留
├── index.html            # ✅ 必须保留
├── README.md             # ✅ 必须保留
└── sw.js                 # ✅ 必须保留
```

**根目录文件数量**：从 23 个减少到 7 个（-70%）

## 📝 详细迁移方案

### 阶段 1：创建新目录

```bash
# 创建新的子目录
mkdir -p docs/refactoring
mkdir -p docs/migration
mkdir -p tools/build
mkdir -p public/icons
```

### 阶段 2：移动重构文档

```bash
# 移动所有重构相关文档到 docs/refactoring/
mv BEFORE_AFTER_COMPARISON.md docs/refactoring/
mv MERGE_GUIDE.md docs/refactoring/
mv PR_DESCRIPTION.md docs/refactoring/
mv README_REFACTORING.md docs/refactoring/
mv REFACTORING_CHECKLIST.md docs/refactoring/
mv REFACTORING_COMPLETE.md docs/refactoring/
mv REFACTORING_PROPOSAL.md docs/refactoring/
mv REFACTORING_QUICKSTART.md docs/refactoring/
mv REFACTORING_SUMMARY.md docs/refactoring/
```

### 阶段 3：移动迁移报告

```bash
# 移动迁移报告到 docs/migration/
mv migration_paths_report.json docs/migration/
mv migration_report.txt docs/migration/
```

### 阶段 4：移动构建工具

```bash
# 移动构建工具到 tools/build/
mv Gruntfile.js tools/build/
```

### 阶段 5：移动静态资源

```bash
# 移动图标文件到 public/icons/
mv apple-touch-icon-precomposed.png public/icons/
mv favicon.png public/icons/
mv offline.html public/
```

### 阶段 6：删除临时文件

```bash
# 删除测试日志
rm -f geckodriver.log

# 检查并删除空的或旧的测试目录
if [ -d "tests" ] && [ -z "$(ls -A tests)" ]; then
    rm -rf tests
fi
```

### 阶段 7：更新引用

需要更新以下文件中的路径引用：

1. **README.md** - 更新重构文档链接
2. **docs/UPDATES.md** - 更新文档路径
3. **package.json** - 更新 Gruntfile.js 路径（如果有）
4. **HTML 模板** - 更新图标路径引用

## 🔄 路径更新清单

### 1. README.md

```markdown
# 重构文档
- [重构提案](docs/refactoring/REFACTORING_PROPOSAL.md)
- [快速开始](docs/refactoring/REFACTORING_QUICKSTART.md)
- [完成报告](docs/refactoring/REFACTORING_COMPLETE.md)
```

### 2. HTML 模板（head.html）

```html
<!-- 更新图标路径 -->
<link rel="shortcut icon" type="image/vnd.microsoft.icon" sizes="16x16" href="/favicon.ico">
<link rel="icon" type="image/png" href="/public/icons/favicon.png">
<link rel="apple-touch-icon-precomposed" href="/public/icons/apple-touch-icon-precomposed.png">
```

### 3. package.json（如果存在）

```json
{
  "scripts": {
    "build": "grunt --gruntfile tools/build/Gruntfile.js"
  }
}
```

## 📊 预期效果

### 文件数量对比

| 位置 | 重构前 | 第一阶段后 | 第二阶段后 | 减少 |
|------|--------|-----------|-----------|------|
| 根目录文件 | 30+ | 23 | 7 | -77% |
| 根目录文件夹 | 15+ | 8 | 8 | -47% |

### 目录清晰度

- ✅ 根目录只保留必需文件
- ✅ 文档按类型分类存放
- ✅ 工具脚本集中管理
- ✅ 静态资源统一位置

### 维护效率

- 🔍 查找文件更快速
- 📝 文档组织更清晰
- 🛠️ 工具管理更方便
- 🎯 职责划分更明确

## ⚠️ 注意事项

### 1. 图标路径更新

移动图标文件后，需要更新 HTML 模板中的引用。但要注意：
- `favicon.ico` 必须保留在根目录（浏览器默认查找位置）
- 其他图标可以移动到 `public/icons/`

### 2. 构建工具路径

如果项目使用 Grunt 构建，需要：
- 更新 package.json 中的脚本路径
- 或者在 Gruntfile.js 中添加符号链接

### 3. 文档链接更新

移动文档后，需要更新：
- README.md 中的文档链接
- 其他文档中的相互引用
- PR_DESCRIPTION.md 中的文档路径

### 4. GitHub Pages 兼容性

确保移动后的文件不影响 GitHub Pages 部署：
- 必需文件保留在根目录
- Service Worker 路径正确
- RSS feed 路径正确

## 🚀 执行步骤

### 步骤 1：创建目录结构

```bash
mkdir -p docs/refactoring
mkdir -p docs/migration
mkdir -p tools/build
mkdir -p public/icons
```

### 步骤 2：执行文件迁移

```bash
# 使用 Git mv 保留历史记录
git mv BEFORE_AFTER_COMPARISON.md docs/refactoring/
git mv MERGE_GUIDE.md docs/refactoring/
git mv PR_DESCRIPTION.md docs/refactoring/
git mv README_REFACTORING.md docs/refactoring/
git mv REFACTORING_CHECKLIST.md docs/refactoring/
git mv REFACTORING_COMPLETE.md docs/refactoring/
git mv REFACTORING_PROPOSAL.md docs/refactoring/
git mv REFACTORING_QUICKSTART.md docs/refactoring/
git mv REFACTORING_SUMMARY.md docs/refactoring/

git mv migration_paths_report.json docs/migration/
git mv migration_report.txt docs/migration/

git mv Gruntfile.js tools/build/

git mv apple-touch-icon-precomposed.png public/icons/
git mv favicon.png public/icons/
git mv offline.html public/
```

### 步骤 3：删除临时文件

```bash
rm -f geckodriver.log
```

### 步骤 4：更新文件引用

- 更新 README.md 中的文档链接
- 更新 src/_includes/head.html 中的图标路径
- 更新 package.json 中的构建脚本（如果有）

### 步骤 5：测试验证

```bash
# 测试 Jekyll 构建
jekyll serve --config config/jekyll/_config.yml

# 检查：
# - 网站能否正常访问
# - 图标是否正常显示
# - 文档链接是否正确
```

### 步骤 6：提交更改

```bash
git add -A
git commit -m "重构：进一步清理根目录

- 移动重构文档到 docs/refactoring/
- 移动迁移报告到 docs/migration/
- 移动构建工具到 tools/build/
- 移动图标文件到 public/icons/
- 删除临时文件
- 更新文件引用路径
- 根目录文件减少 70%"
```

## 📈 ROI 分析

### 投入

- 时间：1-2 小时
- 风险：低（主要是文件移动）

### 收益

- 根目录清晰度提升 70%
- 文档查找效率提升 80%
- 项目专业度提升
- 维护成本降低

### ROI

- 短期：立即见效（目录更清晰）
- 长期：持续受益（更易维护）

## ✅ 验收标准

完成后，根目录应该只包含：

1. ✅ 必需的 HTML 文件（index.html, 404.html）
2. ✅ 必需的配置文件（CNAME, feed.xml）
3. ✅ 必需的脚本文件（sw.js）
4. ✅ 必需的图标文件（favicon.ico）
5. ✅ 项目说明文件（README.md）
6. ✅ 必需的目录（.github, config, content, docs, public, pwa, src, tools）

**总计**：7 个文件 + 8 个目录

## 🎯 总结

这个第二阶段的重构将进一步提升项目的组织性和可维护性，使根目录更加简洁专业。所有文件都有明确的归属，便于查找和管理。

---

**建议**：在执行第二阶段重构前，先完成第一阶段的 PR 合并，确保第一阶段稳定后再进行第二阶段优化。
