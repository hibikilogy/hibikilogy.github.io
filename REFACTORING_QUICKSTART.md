# 🚀 重构快速开始指南

这是一个简化的执行指南，帮助你快速开始项目重构。

---

## 📋 前置要求

- Git
- Node.js 16+
- Ruby 2.7+ 和 Jekyll
- Bash（Linux/Mac）或 Git Bash（Windows）

---

## ⚡ 快速执行（推荐）

### 1. 创建重构分支

```bash
git checkout -b refactor/project-restructure
```

### 2. 运行自动迁移脚本

```bash
# 给脚本执行权限
chmod +x tools/migration/*.sh

# 执行迁移（会自动备份）
bash tools/migration/migrate-structure.sh
```

### 3. 更新图片路径

```bash
# 先预览（不实际修改）
node tools/migration/update-paths.js --dry-run

# 确认无误后执行
node tools/migration/update-paths.js
```

### 4. 更新 Jekyll 配置

编辑 `config/jekyll/_config.yml`：

```yaml
# 更新路径
source: content
layouts_dir: src/_layouts
includes_dir: src/_includes

# 更新集合
collections:
  posts:
    output: true
    permalink: /:year/:month/:day/:title/

# 更新默认值
defaults:
  - scope:
      path: "posts"
      type: "posts"
    values:
      layout: "post"
```

### 5. 测试构建

```bash
# 使用新配置构建
jekyll build --config config/jekyll/_config.yml

# 启动本地服务器
jekyll serve --config config/jekyll/_config.yml
```

### 6. 检查结果

访问 `http://localhost:4000` 检查：
- [ ] 首页正常显示
- [ ] 文章列表正常
- [ ] 文章详情页正常
- [ ] 图片正常加载
- [ ] 标签页正常
- [ ] 搜索功能正常

### 7. 提交变更

```bash
git add .
git commit -m "refactor: 重构项目结构

- 按年份组织文章和图片
- 分离源代码和内容
- 添加现代化工具链
- 更新配置文件
- 添加迁移脚本"

git push origin refactor/project-restructure
```

---

## 🔙 如果出错怎么办？

### 回滚到备份

```bash
# 查看备份目录名（类似 backup_20240315_143022）
ls -d backup_*

# 回滚
bash tools/migration/rollback.sh backup_YYYYMMDD_HHMMSS
```

### 重新开始

```bash
# 删除重构分支
git checkout master
git branch -D refactor/project-restructure

# 重新创建分支
git checkout -b refactor/project-restructure

# 重新执行迁移
bash tools/migration/migrate-structure.sh
```

---

## 📊 迁移后的目录结构

```
hibikilogy.github.io/
├── content/              # 📝 内容（文章、图片、页面）
│   ├── posts/           # 按年份组织的文章
│   ├── images/          # 按年份组织的图片
│   └── pages/           # 静态页面
│
├── src/                 # 🎨 源代码
│   ├── assets/          # 编译后的资源
│   ├── styles/          # 样式源文件
│   ├── _includes/       # Jekyll includes
│   └── _layouts/        # Jekyll layouts
│
├── config/              # ⚙️ 配置文件
│   └── jekyll/          # Jekyll 配置
│
├── tools/               # 🛠️ 工具脚本
│   └── migration/       # 迁移脚本
│
├── docs/                # 📚 文档
└── public/              # 🌐 公共文件
```

---

## ✅ 检查清单

### 迁移前
- [ ] 已阅读完整重构方案（REFACTORING_PROPOSAL.md）
- [ ] 已通知团队成员
- [ ] 已创建重构分支
- [ ] 已备份重要数据

### 迁移中
- [ ] 运行迁移脚本成功
- [ ] 更新图片路径成功
- [ ] 更新 Jekyll 配置
- [ ] 本地构建成功

### 迁移后
- [ ] 所有页面正常显示
- [ ] 图片正常加载
- [ ] 链接没有失效
- [ ] 搜索功能正常
- [ ] 移动端显示正常
- [ ] 性能没有下降

---

## 🆘 常见问题

### Q: 迁移脚本报错怎么办？

A: 查看错误信息，通常是因为：
- 文件路径不存在
- 权限不足
- 目录已存在

解决方法：
```bash
# 检查当前目录
pwd

# 确保在项目根目录
cd /path/to/hibikilogy.github.io

# 重新运行
bash tools/migration/migrate-structure.sh
```

### Q: Jekyll 构建失败？

A: 检查配置文件路径：
```bash
# 查看配置
cat config/jekyll/_config.yml

# 检查路径是否正确
ls -la content/posts
ls -la src/_layouts
```

### Q: 图片显示不出来？

A: 检查图片路径：
```bash
# 查看图片路径更新报告
cat migration_paths_report.json

# 手动检查某个文章
grep "!\[" content/posts/2024/2024-06-03-*.md
```

### Q: 如何只迁移部分内容？

A: 修改迁移脚本，注释掉不需要的部分：
```bash
# 编辑脚本
vim tools/migration/migrate-structure.sh

# 注释掉不需要的阶段
# 例如：# 阶段三：迁移图片
```

---

## 📞 获取帮助

- 查看完整方案：[REFACTORING_PROPOSAL.md](REFACTORING_PROPOSAL.md)
- 提交 Issue：[GitHub Issues](https://github.com/hibikilogy/hibikilogy.github.io/issues)
- 查看迁移报告：`cat migration_report.txt`

---

## 🎯 下一步

重构完成后，建议：

1. **添加 package.json**
   ```bash
   npm init -y
   npm install --save-dev less less-plugin-clean-css prettier
   ```

2. **配置自动化脚本**
   ```json
   {
     "scripts": {
       "dev": "jekyll serve --config config/jekyll/_config.yml",
       "build": "jekyll build --config config/jekyll/_config.yml",
       "build:css": "lessc src/styles/less/main.less src/assets/css/main.css"
     }
   }
   ```

3. **更新 GitHub Actions**
   - 修改构建路径
   - 更新部署配置

4. **更新文档**
   - README.md
   - CONTRIBUTING.md
   - 投稿指南

---

**祝重构顺利！** 🎺
