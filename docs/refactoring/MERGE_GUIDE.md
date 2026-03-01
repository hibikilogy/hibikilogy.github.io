# 🔀 PR 合并指南

本文档为仓库维护者提供详细的 PR 审核和合并步骤。

## 📋 合并前检查清单

### 1. 代码审核
- [ ] 检查目录结构是否合理
- [ ] 验证 Jekyll 配置是否正确
- [ ] 确认所有文件都已正确迁移
- [ ] 检查是否有遗漏的文件

### 2. 功能测试
- [ ] 本地构建测试
- [ ] 页面访问测试
- [ ] 图片加载测试
- [ ] 深色模式测试
- [ ] 导航功能测试

### 3. 文档审核
- [ ] 投稿指南是否清晰
- [ ] 重构文档是否完整
- [ ] README 是否需要更新

## 🧪 本地测试步骤

### 步骤 1: 拉取分支

```bash
# 克隆仓库（如果还没有）
git clone https://github.com/hibikilogy/hibikilogy.github.io.git
cd hibikilogy.github.io

# 拉取重构分支
git fetch origin
git checkout refactor/project-restructure
```

### 步骤 2: 安装依赖

```bash
# 安装 Ruby 依赖
bundle install

# 安装 Node.js 依赖（如果需要）
npm install
```

### 步骤 3: 构建测试

```bash
# 使用新配置构建
jekyll build --config config/jekyll/_config.yml

# 检查构建输出
ls -la _site/
```

### 步骤 4: 本地服务器测试

```bash
# 启动本地服务器
jekyll serve --config config/jekyll/_config.yml

# 访问 http://localhost:4000
# 测试以下功能：
# - 首页加载
# - 文章列表
# - 文章详情页
# - 图片显示
# - 深色模式切换
# - 导航功能
# - 评论系统
```

### 步骤 5: 验证文件完整性

```bash
# 检查文章数量
find content/posts -name "*.md" | wc -l
# 应该显示 156

# 检查图片文件夹
find content/images -type d | wc -l
# 应该显示 58+

# 检查是否有损坏的图片链接
grep -r "!\[.*\](../images/" content/posts/
# 应该没有输出（所有路径都已更新）
```

## 🔍 重点审核项

### 1. Jekyll 配置 (`config/jekyll/_config.yml`)

检查以下配置是否正确：

```yaml
# 新增的配置
source: .
layouts_dir: src/_layouts
includes_dir: src/_includes
collections_dir: content

# 更新的排除列表
exclude: ["less","node_modules","Gruntfile.js","package.json","README.md","tools","docs","config"]
```

### 2. 目录结构

确认以下目录存在且内容正确：

```
✓ content/posts/     - 156 篇文章
✓ content/images/    - 58 个图片文件夹
✓ content/pages/     - 4 个静态页面
✓ src/_layouts/      - 布局文件
✓ src/_includes/     - 包含文件
✓ src/assets/        - 静态资源
✓ config/jekyll/     - 配置文件
✓ tools/migration/   - 迁移工具
✓ docs/              - 文档
```

### 3. 自动化测试

检查 GitHub Actions 工作流：

```yaml
# .github/workflows/content-validation.yml
# 应该包含以下测试：
- YAML 格式验证
- 文件命名检查
- 图片引用验证
- 链接检查
- Jekyll 构建测试
```

### 4. 深色模式

测试深色模式功能：

1. 访问网站
2. 点击导航栏的月亮/太阳图标
3. 确认主题切换正常
4. 刷新页面，确认主题保持
5. 检查所有页面的深色模式样式

## ⚠️ 潜在问题和解决方案

### 问题 1: Jekyll 构建失败

**症状**: `jekyll build` 命令失败

**解决方案**:
```bash
# 检查 Ruby 版本
ruby --version  # 应该 >= 2.5

# 重新安装依赖
bundle install

# 使用完整路径构建
jekyll build --config config/jekyll/_config.yml --verbose
```

### 问题 2: 图片无法加载

**症状**: 文章中的图片显示为损坏链接

**解决方案**:
```bash
# 检查图片路径
grep -r "!\[.*\](" content/posts/ | head -10

# 重新运行路径更新脚本
node tools/migration/update-paths.js

# 检查图片文件是否存在
ls -la content/images/2024/
```

### 问题 3: 页面样式错误

**症状**: 页面样式显示不正常

**解决方案**:
```bash
# 检查 CSS 文件是否存在
ls -la src/assets/css/

# 检查 head.html 中的 CSS 引用
cat src/_includes/head.html | grep "stylesheet"

# 重新编译 Less（如果需要）
lessc src/styles/less/hux-blog.less src/assets/css/hux-blog.css
```

### 问题 4: 深色模式不工作

**症状**: 点击主题切换按钮无反应

**解决方案**:
```bash
# 检查 dark-mode.css 是否存在
ls -la src/assets/css/dark-mode.css

# 检查 head.html 是否引用了深色模式样式
cat src/_includes/head.html | grep "dark-mode"

# 检查浏览器控制台是否有 JavaScript 错误
```

## 🚀 合并步骤

### 方案 A: 直接合并（推荐）

```bash
# 切换到 master 分支
git checkout master

# 合并重构分支
git merge refactor/project-restructure

# 推送到远程
git push origin master
```

### 方案 B: Squash 合并

```bash
# 在 GitHub 上使用 "Squash and merge" 按钮
# 这会将所有提交合并为一个提交
```

### 方案 C: 创建新分支（保守方案）

```bash
# 从重构分支创建新的主分支
git checkout refactor/project-restructure
git checkout -b main-v2

# 推送新分支
git push origin main-v2

# 在 GitHub 设置中将默认分支改为 main-v2
```

## 📝 合并后任务

### 1. 更新 GitHub Pages 设置

1. 进入仓库设置 → Pages
2. 确认 Source 设置正确
3. 确认自定义域名（如果有）
4. 等待部署完成（约 2-5 分钟）

### 2. 验证线上网站

```bash
# 访问网站
https://hibikilogy.github.io

# 检查以下功能：
✓ 首页加载正常
✓ 文章列表显示正常
✓ 文章详情页正常
✓ 图片加载正常
✓ 深色模式工作正常
✓ 评论系统正常
✓ 导航功能正常
```

### 3. 更新文档

- [ ] 更新 README.md（如果需要）
- [ ] 发布更新公告
- [ ] 通知贡献者新的投稿流程

### 4. 清理旧分支

```bash
# 删除本地重构分支
git branch -d refactor/project-restructure

# 删除远程重构分支
git push origin --delete refactor/project-restructure
```

## 📊 验收标准

合并前必须满足以下所有条件：

- [x] 所有自动化测试通过
- [x] 本地构建成功
- [x] 本地服务器运行正常
- [x] 所有页面可访问
- [x] 所有图片正常加载
- [x] 深色模式工作正常
- [x] 文档完整清晰
- [x] 没有遗漏的文件
- [x] 没有损坏的链接

## 🆘 需要帮助？

如果在审核或合并过程中遇到问题：

1. 查看 [REFACTORING_PROPOSAL.md](REFACTORING_PROPOSAL.md) 了解详细方案
2. 查看 [REFACTORING_QUICKSTART.md](REFACTORING_QUICKSTART.md) 了解快速开始
3. 查看 [migration_report.txt](migration_report.txt) 了解迁移详情
4. 在 PR 中留言提问
5. 联系 PR 作者

## 🔄 回滚方案

如果合并后发现严重问题，可以使用以下方法回滚：

### 方法 1: Git Revert

```bash
# 找到合并提交的 hash
git log --oneline -10

# 回滚合并提交
git revert -m 1 <merge-commit-hash>

# 推送回滚
git push origin master
```

### 方法 2: 使用回滚脚本

```bash
# 运行回滚脚本
bash tools/migration/rollback.sh

# 提交回滚
git add .
git commit -m "Rollback: 回滚项目结构重构"
git push origin master
```

### 方法 3: 强制回退（慎用）

```bash
# 回退到合并前的提交
git reset --hard <commit-before-merge>

# 强制推送（会覆盖远程历史）
git push origin master --force
```

---

**最后提醒**: 这是一个重大的结构性变更，建议在非高峰时段合并，并提前通知所有贡献者。合并后密切关注网站运行状况。
