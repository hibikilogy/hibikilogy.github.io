#!/bin/bash
# 京吹学报项目结构迁移脚本
# 使用方法: bash tools/migration/migrate-structure.sh

set -e  # 遇到错误立即退出

echo "🚀 开始项目结构迁移..."

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 创建备份
echo -e "${YELLOW}📦 创建备份...${NC}"
BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r _posts images css js less fonts "$BACKUP_DIR/" 2>/dev/null || true
echo -e "${GREEN}✅ 备份完成: $BACKUP_DIR${NC}"

# 阶段一：创建新目录结构
echo -e "${YELLOW}📁 创建新目录结构...${NC}"
mkdir -p docs
mkdir -p src/{assets/{css,js,fonts,images},styles/less,scripts,_includes,_layouts}
mkdir -p content/{posts,images,pages}
mkdir -p public
mkdir -p config/{jekyll,build}
mkdir -p tools/{image-optimizer,url-generator,migration}
mkdir -p tests/{content,integration,fixtures}

echo -e "${GREEN}✅ 目录结构创建完成${NC}"

# 阶段二：迁移文章
echo -e "${YELLOW}📝 迁移文章文件...${NC}"
for year in 2019 2020 2021 2022 2023 2024 2025 2026; do
  if ls _posts/${year}-*.md 1> /dev/null 2>&1; then
    mkdir -p content/posts/$year
    mv _posts/${year}-*.md content/posts/$year/ 2>/dev/null || true
    echo -e "${GREEN}  ✅ 迁移 $year 年文章${NC}"
  fi
done

# 移动模板
if [ -f "_posts/_TEMPLATE.md" ]; then
  mv _posts/_TEMPLATE.md content/posts/_template.md
  echo -e "${GREEN}  ✅ 迁移文章模板${NC}"
fi

# 移动特殊文件
if [ -f "_posts/wordcloud.zip" ]; then
  mkdir -p tools/wordcloud
  mv _posts/wordcloud.zip tools/wordcloud/
  echo -e "${GREEN}  ✅ 迁移 wordcloud${NC}"
fi

# 阶段三：迁移图片
echo -e "${YELLOW}🖼️  迁移图片文件...${NC}"
for year in 2019 2020 2021 2022 2023 2024 2025 2026; do
  if ls images/${year}-* 1> /dev/null 2>&1; then
    mkdir -p content/images/$year
    mv images/${year}-* content/images/$year/ 2>/dev/null || true
    echo -e "${GREEN}  ✅ 迁移 $year 年图片${NC}"
  fi
done

# 移动散落的图片
if ls images/*.jpg 1> /dev/null 2>&1 || ls images/*.png 1> /dev/null 2>&1; then
  mkdir -p content/images/misc
  mv images/*.jpg images/*.png content/images/misc/ 2>/dev/null || true
  echo -e "${GREEN}  ✅ 迁移散落图片${NC}"
fi

# 阶段四：迁移静态资源
echo -e "${YELLOW}🎨 迁移静态资源...${NC}"

# CSS
if [ -d "css" ]; then
  cp css/*.css src/assets/css/ 2>/dev/null || true
  echo -e "${GREEN}  ✅ 迁移 CSS${NC}"
fi

# Less
if [ -d "less" ]; then
  cp less/*.less src/styles/less/ 2>/dev/null || true
  echo -e "${GREEN}  ✅ 迁移 Less${NC}"
fi

# JavaScript
if [ -d "js" ]; then
  cp js/*.js src/assets/js/ 2>/dev/null || true
  echo -e "${GREEN}  ✅ 迁移 JavaScript${NC}"
fi

# 字体
if [ -d "fonts" ]; then
  cp -r fonts/* src/assets/fonts/ 2>/dev/null || true
  echo -e "${GREEN}  ✅ 迁移字体${NC}"
fi

# 阶段五：迁移公共文件
echo -e "${YELLOW}🌐 迁移公共文件...${NC}"
[ -f "favicon.ico" ] && cp favicon.ico public/
[ -f "favicon.png" ] && cp favicon.png public/
[ -f "apple-touch-icon-precomposed.png" ] && cp apple-touch-icon-precomposed.png public/apple-touch-icon.png
[ -f "CNAME" ] && cp CNAME public/
echo -e "${GREEN}  ✅ 迁移公共文件${NC}"

# 阶段六：迁移配置
echo -e "${YELLOW}⚙️  迁移配置文件...${NC}"
[ -f "_config.yml" ] && cp _config.yml config/jekyll/_config.yml
echo -e "${GREEN}  ✅ 迁移配置${NC}"

# 阶段七：迁移 includes 和 layouts
echo -e "${YELLOW}📄 迁移模板文件...${NC}"
if [ -d "_includes" ]; then
  cp -r _includes/* src/_includes/ 2>/dev/null || true
  echo -e "${GREEN}  ✅ 迁移 includes${NC}"
fi

if [ -d "_layouts" ]; then
  cp -r _layouts/* src/_layouts/ 2>/dev/null || true
  echo -e "${GREEN}  ✅ 迁移 layouts${NC}"
fi

# 阶段八：迁移文档
echo -e "${YELLOW}📚 迁移文档...${NC}"
[ -f "CONTRIBUTING.md" ] && mv CONTRIBUTING.md docs/
[ -f "OPTIMIZATION_GUIDE.md" ] && mv OPTIMIZATION_GUIDE.md docs/
[ -f "UPDATES.md" ] && mv UPDATES.md docs/
[ -f "contribute.md" ] && mv contribute.md content/pages/
[ -f "about.md" ] && mv about.md content/pages/
[ -f "assessment.md" ] && mv assessment.md content/pages/
[ -f "test.md" ] && mv test.md content/pages/
echo -e "${GREEN}  ✅ 迁移文档${NC}"

# 阶段九：迁移工具
echo -e "${YELLOW}🛠️  迁移工具...${NC}"
if [ -d ".generate-short-url" ]; then
  cp -r .generate-short-url/* tools/url-generator/ 2>/dev/null || true
  echo -e "${GREEN}  ✅ 迁移 URL 生成器${NC}"
fi

# 阶段十：清理
echo -e "${YELLOW}🧹 清理临时文件...${NC}"
[ -f "geckodriver.log" ] && rm geckodriver.log
echo -e "${GREEN}  ✅ 清理完成${NC}"

# 生成迁移报告
echo -e "${YELLOW}📊 生成迁移报告...${NC}"
cat > migration_report.txt << EOF
京吹学报项目结构迁移报告
========================
迁移时间: $(date)
备份目录: $BACKUP_DIR

迁移统计:
- 文章数量: $(find content/posts -name "*.md" 2>/dev/null | wc -l)
- 图片文件夹: $(find content/images -type d 2>/dev/null | wc -l)
- CSS 文件: $(find src/assets/css -name "*.css" 2>/dev/null | wc -l)
- JS 文件: $(find src/assets/js -name "*.js" 2>/dev/null | wc -l)

新目录结构:
$(tree -L 2 -d content src config tools 2>/dev/null || echo "请安装 tree 命令查看目录结构")

下一步:
1. 检查迁移结果
2. 更新 Jekyll 配置
3. 更新文章中的图片路径
4. 测试构建
5. 提交变更

备注:
- 原文件已备份到 $BACKUP_DIR
- 如需回滚，请运行: bash tools/migration/rollback.sh $BACKUP_DIR
EOF

echo -e "${GREEN}✅ 迁移报告已生成: migration_report.txt${NC}"

# 完成
echo ""
echo -e "${GREEN}🎉 迁移完成！${NC}"
echo ""
echo "下一步操作:"
echo "1. 查看迁移报告: cat migration_report.txt"
echo "2. 检查新目录结构: tree -L 3 content src"
echo "3. 更新配置文件: vim config/jekyll/_config.yml"
echo "4. 运行路径更新脚本: node tools/migration/update-paths.js"
echo "5. 测试构建: jekyll build"
echo ""
echo -e "${YELLOW}⚠️  注意: 原文件已备份到 $BACKUP_DIR${NC}"
echo -e "${YELLOW}⚠️  如需回滚: bash tools/migration/rollback.sh $BACKUP_DIR${NC}"
