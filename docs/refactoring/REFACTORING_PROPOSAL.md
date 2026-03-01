# 🔨 京吹学报项目重构方案

## 📊 当前问题分析

### 1. 文件组织混乱

**根目录问题：**
- ❌ 15+ 个文件散落在根目录
- ❌ 配置文件、页面文件、文档混在一起
- ❌ 临时文件未被忽略（`geckodriver.log`）
- ❌ 过时的 CI 配置（`.travis.yml`）

**图片管理混乱：**
```
images/
├── 2024-05-28/              # ✅ 按日期组织
├── 北宇治往事2/              # ❌ 按文章标题组织
├── euphoniumwar/            # ❌ 按英文标题组织
├── 66b6496034a85...jpg      # ❌ 散落在根目录
└── 北宇治拳王争霸赛.jpg      # ❌ 散落在根目录
```

**文章资源混乱：**
```
_posts/
├── 2024-04-07-AI_Hibikilogy/           # ❌ 文章专属文件夹
├── 2024-07-01-Euphoria&Frustrated.assets/  # ❌ 资源文件夹
└── wordcloud.zip                        # ❌ 非文章文件
```

### 2. 技术债务

- ❌ Travis CI 已废弃，但配置仍在
- ❌ Grunt 配置存在但无 `package.json`
- ❌ 编译后的 CSS 和源文件混在一起
- ❌ 缺少现代化的构建工具配置
- ❌ 没有依赖管理（npm/yarn）

### 3. 文档缺失

- ❌ 没有清晰的项目结构说明
- ❌ 开发文档不完整
- ❌ 贡献指南分散（`contribute.md` 和 `CONTRIBUTING.md`）

### 4. 命名不一致

- 文章文件名：中文、英文、拼音混用
- 图片文件夹：日期、中文标题、英文标题混用
- 配置文件：大小写不统一

---

## 🎯 重构目标

1. **清晰的目录结构** - 一眼看懂项目组织
2. **标准化命名** - 统一的命名规范
3. **现代化工具链** - 使用现代构建工具
4. **完善的文档** - 详细的开发和贡献指南
5. **自动化流程** - CI/CD 和代码质量检查

---

## 📁 新的目录结构

```
hibikilogy.github.io/
├── .github/                    # GitHub 配置
│   ├── ISSUE_TEMPLATE/         # Issue 模板
│   ├── workflows/              # GitHub Actions
│   └── pull_request_template.md
│
├── docs/                       # 📚 文档目录（新增）
│   ├── CONTRIBUTING.md         # 贡献指南
│   ├── DEVELOPMENT.md          # 开发指南
│   ├── DEPLOYMENT.md           # 部署指南
│   ├── STYLE_GUIDE.md          # 写作风格指南
│   └── CHANGELOG.md            # 变更日志
│
├── src/                        # 🎨 源代码目录（新增）
│   ├── assets/                 # 静态资源
│   │   ├── css/                # 编译后的 CSS
│   │   ├── js/                 # JavaScript
│   │   ├── fonts/              # 字体文件
│   │   └── images/             # 公共图片（logo、icon等）
│   │
│   ├── styles/                 # 样式源文件
│   │   ├── less/               # Less 源文件
│   │   └── scss/               # 可选：迁移到 Sass
│   │
│   ├── scripts/                # 脚本工具
│   │   ├── build.js            # 构建脚本
│   │   ├── deploy.js           # 部署脚本
│   │   └── image-optimizer.js  # 图片优化
│   │
│   └── _includes/              # Jekyll includes
│   └── _layouts/               # Jekyll layouts
│
├── content/                    # 📝 内容目录（新增）
│   ├── posts/                  # 文章（原 _posts）
│   │   ├── 2019/
│   │   ├── 2020/
│   │   ├── 2021/
│   │   ├── 2022/
│   │   ├── 2023/
│   │   ├── 2024/
│   │   ├── 2025/
│   │   ├── 2026/
│   │   └── _template.md
│   │
│   ├── images/                 # 文章图片
│   │   ├── 2019/
│   │   ├── 2020/
│   │   ├── 2021/
│   │   ├── 2022/
│   │   ├── 2023/
│   │   ├── 2024/
│   │   ├── 2025/
│   │   └── 2026/
│   │
│   └── pages/                  # 静态页面
│       ├── about.md
│       ├── contribute.md
│       ├── assessment.md
│       └── test.md
│
├── public/                     # 🌐 公共文件（新增）
│   ├── favicon.ico
│   ├── favicon.png
│   ├── apple-touch-icon.png
│   ├── robots.txt
│   └── sitemap.xml
│
├── config/                     # ⚙️ 配置目录（新增）
│   ├── jekyll/
│   │   ├── _config.yml         # 主配置
│   │   ├── _config.dev.yml     # 开发配置
│   │   └── _config.prod.yml    # 生产配置
│   │
│   └── build/
│       ├── webpack.config.js   # Webpack 配置
│       └── postcss.config.js   # PostCSS 配置
│
├── tools/                      # 🛠️ 工具脚本（新增）
│   ├── image-optimizer/        # 图片优化工具
│   ├── url-generator/          # URL 生成器（原 .generate-short-url）
│   └── migration/              # 迁移脚本
│
├── tests/                      # 🧪 测试目录（新增）
│   ├── content/                # 内容测试
│   ├── integration/            # 集成测试
│   └── fixtures/               # 测试数据
│
├── .gitignore
├── .editorconfig               # 编辑器配置
├── .prettierrc                 # 代码格式化
├── package.json                # 依赖管理
├── package-lock.json
├── README.md                   # 项目说明
└── LICENSE                     # 许可证
```

---

## 🔄 迁移计划

### 阶段一：基础重构（破坏性变更）

#### 1.1 创建新目录结构

```bash
# 创建新目录
mkdir -p docs src/{assets/{css,js,fonts,images},styles/less,scripts,_includes,_layouts}
mkdir -p content/{posts,images,pages}
mkdir -p public config/{jekyll,build} tools tests
```

#### 1.2 迁移文章

```bash
# 按年份组织文章
for year in 2019 2020 2021 2022 2023 2024 2025 2026; do
  mkdir -p content/posts/$year
  mv _posts/$year-*.md content/posts/$year/ 2>/dev/null || true
done

# 移动模板
mv _posts/_TEMPLATE.md content/posts/_template.md
```

#### 1.3 迁移图片

```bash
# 按年份组织图片
for year in 2019 2020 2021 2022 2023 2024 2025 2026; do
  mkdir -p content/images/$year
  mv images/$year-* content/images/$year/ 2>/dev/null || true
done

# 处理中文命名的图片文件夹
# 需要手动映射到对应年份
```

#### 1.4 迁移静态资源

```bash
# CSS
mv css/*.css src/assets/css/
mv less/* src/styles/less/

# JavaScript
mv js/* src/assets/js/

# 字体
mv fonts/* src/assets/fonts/

# 公共文件
mv favicon.* apple-touch-icon* public/
mv CNAME public/
```

#### 1.5 迁移配置

```bash
# Jekyll 配置
mv _config.yml config/jekyll/

# 移除过时配置
rm .travis.yml

# 移动工具
mv .generate-short-url tools/url-generator
```

#### 1.6 迁移文档

```bash
# 整合文档
mv CONTRIBUTING.md docs/
mv README.md ./
mv contribute.md content/pages/
mv about.md content/pages/
mv assessment.md content/pages/
mv test.md content/pages/
```

### 阶段二：标准化命名

#### 2.1 文章文件名规范

**规则：** `YYYY-MM-DD-english-title.md`

```bash
# 示例迁移脚本
# 2020-01-10-ruhewenze.md ✅ 保持
# 2020-02-01-一个有良心的吹学研究者带你深入剖析伞木希美.md 
#   → 2020-02-01-nozomi-analysis.md
```

#### 2.2 图片文件夹规范

**规则：** `content/images/YYYY/MM-DD-article-slug/`

```bash
# 示例
content/images/2024/
├── 05-28-eupho-daily/
├── 06-03-kumiko-two-bodies/
└── 06-10-boxing-championship/
```

#### 2.3 创建映射文件

```json
// tools/migration/filename-mapping.json
{
  "old_to_new": {
    "2020-02-01-一个有良心的吹学研究者带你深入剖析伞木希美.md": "2020-02-01-nozomi-analysis.md",
    "2020-03-05-南中沉浮录.md": "2020-03-05-nanchuu-history.md"
  },
  "image_folders": {
    "北宇治往事2": "2024/06-11-kitauji-history-2",
    "euphoniumwar": "2024/04-22-euphonium-war"
  }
}
```

### 阶段三：现代化工具链

#### 3.1 添加 package.json

```json
{
  "name": "hibikilogy",
  "version": "2.0.0",
  "description": "京吹学报 - 吹学著作集锦",
  "scripts": {
    "dev": "jekyll serve --config config/jekyll/_config.yml,config/jekyll/_config.dev.yml",
    "build": "npm run build:css && jekyll build --config config/jekyll/_config.yml,config/jekyll/_config.prod.yml",
    "build:css": "lessc src/styles/less/main.less src/assets/css/main.css --clean-css",
    "watch:css": "npm run build:css -- --watch",
    "optimize:images": "node tools/image-optimizer/optimize.js",
    "test": "npm run test:content && npm run test:links",
    "test:content": "node tests/content/validate.js",
    "test:links": "markdown-link-check content/posts/**/*.md",
    "lint": "prettier --check \"**/*.{md,json,yml}\"",
    "format": "prettier --write \"**/*.{md,json,yml}\"",
    "deploy": "npm run build && node src/scripts/deploy.js"
  },
  "devDependencies": {
    "less": "^4.2.0",
    "less-plugin-clean-css": "^1.5.1",
    "prettier": "^3.0.0",
    "markdown-link-check": "^3.11.0",
    "sharp": "^0.32.0",
    "imagemin": "^8.0.1",
    "imagemin-webp": "^7.0.0"
  }
}
```

#### 3.2 添加 .editorconfig

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{md,markdown}]
trim_trailing_whitespace = false

[*.{yml,yaml}]
indent_style = space
indent_size = 2

[*.{js,json}]
indent_style = space
indent_size = 2
```

#### 3.3 添加 .prettierrc

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "bracketSpacing": true,
  "arrowParens": "always",
  "proseWrap": "preserve",
  "overrides": [
    {
      "files": "*.md",
      "options": {
        "proseWrap": "preserve"
      }
    }
  ]
}
```

### 阶段四：更新配置

#### 4.1 更新 Jekyll 配置

```yaml
# config/jekyll/_config.yml
source: content
destination: _site
layouts_dir: src/_layouts
includes_dir: src/_includes

collections:
  posts:
    output: true
    permalink: /:year/:month/:day/:title/

defaults:
  - scope:
      path: "posts"
      type: "posts"
    values:
      layout: "post"
      
# 图片路径
image_path: /content/images
```

#### 4.2 更新 .gitignore

```gitignore
# Build outputs
_site/
.jekyll-cache/
.sass-cache/
src/assets/css/*.css
src/assets/css/*.css.map

# Dependencies
node_modules/
package-lock.json

# Logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Temporary
temp/
tmp/
```

### 阶段五：自动化工具

#### 5.1 图片优化脚本

```javascript
// tools/image-optimizer/optimize.js
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

async function optimizeImages(dir) {
  const files = await fs.readdir(dir, { recursive: true });
  
  for (const file of files) {
    if (/\.(jpg|jpeg|png)$/i.test(file)) {
      const inputPath = path.join(dir, file);
      const outputPath = inputPath.replace(/\.(jpg|jpeg|png)$/i, '.webp');
      
      await sharp(inputPath)
        .webp({ quality: 85 })
        .toFile(outputPath);
      
      console.log(`✅ Optimized: ${file}`);
    }
  }
}

optimizeImages('content/images');
```

#### 5.2 文件名迁移脚本

```javascript
// tools/migration/migrate-filenames.js
const fs = require('fs').promises;
const path = require('path');
const mapping = require('./filename-mapping.json');

async function migrateFilenames() {
  for (const [oldName, newName] of Object.entries(mapping.old_to_new)) {
    const oldPath = path.join('content/posts', oldName);
    const newPath = path.join('content/posts', newName);
    
    try {
      await fs.rename(oldPath, newPath);
      console.log(`✅ Renamed: ${oldName} → ${newName}`);
    } catch (err) {
      console.error(`❌ Failed: ${oldName}`, err.message);
    }
  }
}

migrateFilenames();
```

---

## 📋 执行清单

### 准备阶段
- [ ] 创建新分支 `refactor/project-restructure`
- [ ] 备份当前项目
- [ ] 通知贡献者即将进行重构

### 执行阶段
- [ ] 创建新目录结构
- [ ] 迁移文章文件
- [ ] 迁移图片资源
- [ ] 迁移静态资源
- [ ] 迁移配置文件
- [ ] 标准化文件命名
- [ ] 添加现代化工具链
- [ ] 更新所有配置
- [ ] 创建迁移脚本
- [ ] 更新文档

### 测试阶段
- [ ] 本地构建测试
- [ ] 链接完整性测试
- [ ] 图片加载测试
- [ ] 移动端测试
- [ ] 性能测试

### 部署阶段
- [ ] 更新 GitHub Actions
- [ ] 部署到测试环境
- [ ] 验证所有功能
- [ ] 合并到主分支
- [ ] 发布更新公告

---

## ⚠️ 风险评估

### 高风险
1. **链接失效** - 所有内部链接需要更新
2. **图片路径** - 大量图片引用需要修正
3. **SEO 影响** - URL 结构变化可能影响搜索排名

### 缓解措施
1. 创建 301 重定向规则
2. 使用脚本批量更新链接
3. 保持 URL 结构不变（仅改内部组织）
4. 充分测试后再部署

---

## 📈 预期收益

### 短期收益
- ✅ 清晰的项目结构
- ✅ 更容易找到文件
- ✅ 降低贡献门槛

### 长期收益
- ✅ 更好的可维护性
- ✅ 更快的构建速度
- ✅ 更容易扩展功能
- ✅ 更专业的项目形象

---

## 🤔 替代方案

### 方案 A：渐进式重构（推荐）
- 分阶段执行，每个阶段独立测试
- 风险较低，可以随时回滚
- 时间较长，但更稳妥

### 方案 B：激进式重构
- 一次性完成所有变更
- 风险较高，需要充分测试
- 时间较短，但可能出现问题

### 方案 C：最小化重构
- 仅解决最紧迫的问题
- 保持现有结构基本不变
- 技术债务仍然存在

---

## 💬 讨论

这是一个破坏性的重构方案，需要团队讨论和共识。

**关键问题：**
1. 是否接受 URL 结构变化？
2. 是否愿意投入时间进行迁移？
3. 是否需要保持向后兼容？
4. 重构的优先级如何？

**建议：**
采用**方案 A（渐进式重构）**，分 5 个阶段执行，每个阶段 1-2 周。

---

## 📞 联系

如有疑问或建议，请在 Issue 中讨论。
