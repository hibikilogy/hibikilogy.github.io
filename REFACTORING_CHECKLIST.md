# ✅ 项目重构执行检查清单

使用本清单确保重构过程顺利进行，不遗漏任何步骤。

---

## 📋 准备阶段

### 团队沟通
- [ ] 已向所有团队成员说明重构计划
- [ ] 已获得团队共识
- [ ] 已确定重构时间窗口
- [ ] 已通知活跃贡献者
- [ ] 已在 GitHub Discussions 发布公告

### 文档阅读
- [ ] 已阅读 [REFACTORING_PROPOSAL.md](REFACTORING_PROPOSAL.md)
- [ ] 已阅读 [REFACTORING_QUICKSTART.md](REFACTORING_QUICKSTART.md)
- [ ] 已阅读 [BEFORE_AFTER_COMPARISON.md](BEFORE_AFTER_COMPARISON.md)
- [ ] 已理解新的目录结构
- [ ] 已理解迁移脚本的工作原理

### 环境准备
- [ ] Git 已安装并配置
- [ ] Node.js 16+ 已安装
- [ ] Ruby 2.7+ 已安装
- [ ] Jekyll 已安装
- [ ] Bash 环境可用（Linux/Mac/Git Bash）
- [ ] 磁盘空间充足（至少 5GB）

### 备份
- [ ] 已创建完整项目备份
- [ ] 备份已验证可用
- [ ] 已记录备份位置
- [ ] 已测试恢复流程

---

## 🚀 执行阶段

### 1. 创建分支
- [ ] 已切换到 master 分支
- [ ] 已拉取最新代码
- [ ] 已创建重构分支 `refactor/project-restructure`
- [ ] 分支已推送到远程

```bash
git checkout master
git pull origin master
git checkout -b refactor/project-restructure
git push -u origin refactor/project-restructure
```

### 2. 运行迁移脚本
- [ ] 已给脚本执行权限
- [ ] 已运行 `migrate-structure.sh`
- [ ] 脚本执行成功，无错误
- [ ] 已查看迁移报告 `migration_report.txt`
- [ ] 备份目录已创建

```bash
chmod +x tools/migration/*.sh
bash tools/migration/migrate-structure.sh
cat migration_report.txt
```

### 3. 验证迁移结果
- [ ] `content/posts/` 目录已创建
- [ ] 文章已按年份组织
- [ ] `content/images/` 目录已创建
- [ ] 图片已按年份组织
- [ ] `src/` 目录已创建
- [ ] 静态资源已迁移
- [ ] `config/` 目录已创建
- [ ] 配置文件已迁移
- [ ] `tools/` 目录已创建
- [ ] 工具脚本已迁移
- [ ] `docs/` 目录已创建
- [ ] 文档已迁移

```bash
tree -L 2 content src config tools docs
```

### 4. 更新图片路径
- [ ] 已运行 dry-run 模式预览
- [ ] 预览结果正确
- [ ] 已运行实际更新
- [ ] 已查看更新报告 `migration_paths_report.json`
- [ ] 抽查几篇文章，图片路径正确

```bash
node tools/migration/update-paths.js --dry-run
node tools/migration/update-paths.js
cat migration_paths_report.json
```

### 5. 更新 Jekyll 配置
- [ ] 已编辑 `config/jekyll/_config.yml`
- [ ] 已更新 `source` 路径
- [ ] 已更新 `layouts_dir` 路径
- [ ] 已更新 `includes_dir` 路径
- [ ] 已更新 `collections` 配置
- [ ] 已更新 `defaults` 配置
- [ ] 配置语法正确

```yaml
source: content
layouts_dir: src/_layouts
includes_dir: src/_includes
```

### 6. 添加现代化工具
- [ ] 已创建 `package.json`
- [ ] 已添加必要的 npm 脚本
- [ ] 已添加开发依赖
- [ ] 已创建 `.editorconfig`
- [ ] 已创建 `.prettierrc`
- [ ] 已更新 `.gitignore`

```bash
npm init -y
npm install --save-dev less less-plugin-clean-css prettier
```

---

## 🧪 测试阶段

### 本地构建测试
- [ ] Jekyll 构建成功
- [ ] 无构建错误
- [ ] 无构建警告
- [ ] 构建时间可接受

```bash
jekyll build --config config/jekyll/_config.yml
```

### 本地服务器测试
- [ ] 本地服务器启动成功
- [ ] 可以访问 http://localhost:4000
- [ ] 首页正常显示
- [ ] 文章列表正常
- [ ] 分页功能正常

```bash
jekyll serve --config config/jekyll/_config.yml
```

### 功能测试
- [ ] 首页加载正常
- [ ] 文章列表显示正确
- [ ] 文章详情页正常
- [ ] 图片正常加载
- [ ] 标签页正常
- [ ] 搜索功能正常
- [ ] 分页功能正常
- [ ] RSS 订阅正常
- [ ] 404 页面正常
- [ ] 关于页面正常
- [ ] 投稿页面正常

### 内容验证
- [ ] 随机抽查 10 篇文章，内容完整
- [ ] 随机抽查 20 张图片，加载正常
- [ ] 检查最新文章，显示正确
- [ ] 检查最旧文章，显示正确
- [ ] 检查中文标题文章，显示正确
- [ ] 检查英文标题文章，显示正确

### 链接测试
- [ ] 内部链接正常
- [ ] 外部链接正常
- [ ] 图片链接正常
- [ ] 标签链接正常
- [ ] 分页链接正常
- [ ] 无 404 错误

### 性能测试
- [ ] 首页加载时间 < 3 秒
- [ ] 文章页加载时间 < 2 秒
- [ ] 图片加载速度正常
- [ ] 构建时间可接受
- [ ] 热重载速度正常

### 移动端测试
- [ ] 移动端首页正常
- [ ] 移动端文章页正常
- [ ] 移动端图片正常
- [ ] 移动端导航正常
- [ ] 响应式布局正常

### 浏览器兼容性
- [ ] Chrome 测试通过
- [ ] Firefox 测试通过
- [ ] Safari 测试通过
- [ ] Edge 测试通过

---

## 📝 文档更新

### 更新项目文档
- [ ] 已更新 README.md
- [ ] 已更新 CONTRIBUTING.md
- [ ] 已更新投稿指南
- [ ] 已添加开发文档
- [ ] 已添加部署文档
- [ ] 已创建 CHANGELOG.md

### 更新配置文档
- [ ] 已记录新的目录结构
- [ ] 已记录配置文件位置
- [ ] 已记录构建命令
- [ ] 已记录开发命令
- [ ] 已记录部署流程

### 更新贡献指南
- [ ] 已更新文章提交流程
- [ ] 已更新图片上传指南
- [ ] 已更新文件命名规范
- [ ] 已更新 PR 模板
- [ ] 已更新 Issue 模板

---

## 🔄 GitHub 配置更新

### GitHub Actions
- [ ] 已更新构建工作流
- [ ] 已更新路径配置
- [ ] 已更新部署配置
- [ ] 已测试工作流
- [ ] 工作流运行成功

### 仓库设置
- [ ] 已更新仓库描述
- [ ] 已更新主题标签
- [ ] 已更新 About 信息
- [ ] 已更新 README 徽章

### 保护规则
- [ ] 已设置分支保护
- [ ] 已要求 PR 审核
- [ ] 已要求状态检查通过
- [ ] 已禁止强制推送

---

## 🚢 部署阶段

### 部署前检查
- [ ] 所有测试通过
- [ ] 所有文档更新
- [ ] 团队已审核
- [ ] 已准备回滚方案
- [ ] 已通知用户

### 部署到测试环境
- [ ] 测试环境部署成功
- [ ] 测试环境功能正常
- [ ] 测试环境性能正常
- [ ] 团队已验证

### 部署到生产环境
- [ ] 已合并到 master 分支
- [ ] 已打标签
- [ ] 生产环境部署成功
- [ ] 生产环境功能正常
- [ ] 生产环境性能正常

### 部署后验证
- [ ] 网站可访问
- [ ] 首页正常
- [ ] 文章正常
- [ ] 图片正常
- [ ] 搜索正常
- [ ] RSS 正常
- [ ] 无明显错误

---

## 📢 发布阶段

### 发布公告
- [ ] 已在 GitHub Discussions 发布
- [ ] 已在 README 更新
- [ ] 已通知贡献者
- [ ] 已更新文档链接

### 创建 Release
- [ ] 已创建 GitHub Release
- [ ] 已添加版本号
- [ ] 已添加更新日志
- [ ] 已添加迁移指南

### 用户支持
- [ ] 已准备 FAQ
- [ ] 已准备故障排除指南
- [ ] 已设置问题追踪
- [ ] 已准备回滚方案

---

## 📊 监控阶段

### 第一周监控
- [ ] 每天检查网站状态
- [ ] 监控错误日志
- [ ] 收集用户反馈
- [ ] 快速修复问题

### 第一月监控
- [ ] 每周检查性能指标
- [ ] 分析用户行为
- [ ] 优化加载速度
- [ ] 改进用户体验

### 持续改进
- [ ] 收集改进建议
- [ ] 优化工作流程
- [ ] 更新文档
- [ ] 培训新贡献者

---

## 🎯 成功标准

### 必须达成
- ✅ 所有页面正常访问
- ✅ 所有图片正常加载
- ✅ 无 404 错误
- ✅ 构建成功
- ✅ 部署成功

### 期望达成
- ✅ 构建时间减少 30%
- ✅ 查找文件时间减少 75%
- ✅ 新人上手时间减少 75%
- ✅ 维护成本降低 60%
- ✅ 贡献门槛降低 70%

### 额外收益
- ✅ 项目更专业
- ✅ 文档更完善
- ✅ 工具更现代
- ✅ 流程更规范

---

## ⚠️ 风险应对

### 如果构建失败
1. 检查配置文件路径
2. 检查 Jekyll 版本
3. 查看错误日志
4. 回滚到备份

### 如果图片加载失败
1. 检查图片路径
2. 运行路径更新脚本
3. 手动修复问题文章
4. 更新路径映射

### 如果部署失败
1. 检查 GitHub Actions 日志
2. 验证配置文件
3. 测试本地构建
4. 回滚到上一版本

### 如果用户反馈问题
1. 快速响应
2. 记录问题
3. 优先修复
4. 更新文档

---

## 📞 紧急联系

### 技术支持
- GitHub Issues: [提交问题](https://github.com/hibikilogy/hibikilogy.github.io/issues)
- GitHub Discussions: [讨论](https://github.com/hibikilogy/hibikilogy.github.io/discussions)

### 回滚命令
```bash
# 如果需要紧急回滚
bash tools/migration/rollback.sh backup_YYYYMMDD_HHMMSS

# 或者回滚 Git
git checkout master
git reset --hard origin/master
```

---

## ✅ 最终确认

在标记重构完成前，请确认：

- [ ] 所有检查项已完成
- [ ] 所有测试已通过
- [ ] 所有文档已更新
- [ ] 团队已验证
- [ ] 用户已通知
- [ ] 监控已设置
- [ ] 回滚方案已准备

---

**签名确认：**

- 执行人：__________________
- 审核人：__________________
- 日期：__________________

---

**重构完成！恭喜！** 🎉🎺
