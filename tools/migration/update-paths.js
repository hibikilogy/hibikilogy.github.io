#!/usr/bin/env node
/**
 * 更新文章中的图片路径
 * 将 ../images/ 替换为新的路径结构
 */

const fs = require('fs').promises;
const path = require('path');

// 配置
const CONFIG = {
  postsDir: 'content/posts',
  oldImagePrefix: '../images/',
  newImagePrefix: '/content/images/',
  dryRun: process.argv.includes('--dry-run'),
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 获取所有 Markdown 文件
async function getAllMarkdownFiles(dir) {
  const files = [];
  
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  
  await walk(dir);
  return files;
}

// 更新文件中的图片路径
async function updateImagePaths(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const originalContent = content;
  
  // 匹配图片引用
  const imageRegex = /!\[([^\]]*)\]\(\.\.\/images\/([^)]+)\)/g;
  let updatedContent = content;
  let matches = [];
  
  // 收集所有匹配
  let match;
  while ((match = imageRegex.exec(content)) !== null) {
    matches.push({
      full: match[0],
      alt: match[1],
      path: match[2],
    });
  }
  
  if (matches.length === 0) {
    return { updated: false, count: 0 };
  }
  
  // 替换路径
  for (const m of matches) {
    // 提取年份
    const yearMatch = m.path.match(/^(\d{4})-/);
    let newPath;
    
    if (yearMatch) {
      const year = yearMatch[1];
      // 2024-05-28/image.jpg -> /content/images/2024/05-28/image.jpg
      const datePart = m.path.match(/^(\d{4})-(\d{2}-\d{2})\//);
      if (datePart) {
        newPath = `/content/images/${datePart[1]}/${datePart[2]}/${m.path.split('/').slice(1).join('/')}`;
      } else {
        // 2024-05-28/image.jpg -> /content/images/2024/image.jpg
        newPath = `/content/images/${year}/${m.path}`;
      }
    } else {
      // 没有年份前缀，放到 misc
      newPath = `/content/images/misc/${m.path}`;
    }
    
    const newMarkdown = `![${m.alt}](${newPath})`;
    updatedContent = updatedContent.replace(m.full, newMarkdown);
  }
  
  // 写入文件
  if (!CONFIG.dryRun && updatedContent !== originalContent) {
    await fs.writeFile(filePath, updatedContent, 'utf-8');
  }
  
  return {
    updated: updatedContent !== originalContent,
    count: matches.length,
    matches: matches,
  };
}

// 主函数
async function main() {
  log('🔄 开始更新图片路径...', 'cyan');
  
  if (CONFIG.dryRun) {
    log('⚠️  DRY RUN 模式 - 不会实际修改文件', 'yellow');
  }
  
  try {
    // 检查目录是否存在
    try {
      await fs.access(CONFIG.postsDir);
    } catch {
      log(`❌ 目录不存在: ${CONFIG.postsDir}`, 'red');
      log('请先运行迁移脚本: bash tools/migration/migrate-structure.sh', 'yellow');
      process.exit(1);
    }
    
    // 获取所有文章
    log(`📁 扫描目录: ${CONFIG.postsDir}`, 'cyan');
    const files = await getAllMarkdownFiles(CONFIG.postsDir);
    log(`📄 找到 ${files.length} 个 Markdown 文件`, 'cyan');
    
    // 统计
    let totalUpdated = 0;
    let totalImages = 0;
    const results = [];
    
    // 处理每个文件
    for (const file of files) {
      const result = await updateImagePaths(file);
      
      if (result.updated) {
        totalUpdated++;
        totalImages += result.count;
        results.push({ file, ...result });
        
        const relativePath = path.relative(process.cwd(), file);
        log(`  ✅ ${relativePath} (${result.count} 张图片)`, 'green');
        
        if (CONFIG.dryRun) {
          result.matches.forEach(m => {
            log(`     - ${m.path}`, 'yellow');
          });
        }
      }
    }
    
    // 输出统计
    log('', 'reset');
    log('📊 更新统计:', 'cyan');
    log(`  - 扫描文件: ${files.length}`, 'reset');
    log(`  - 更新文件: ${totalUpdated}`, 'green');
    log(`  - 更新图片: ${totalImages}`, 'green');
    
    if (CONFIG.dryRun) {
      log('', 'reset');
      log('💡 要实际执行更新，请运行:', 'yellow');
      log('   node tools/migration/update-paths.js', 'yellow');
    } else {
      log('', 'reset');
      log('✅ 路径更新完成！', 'green');
    }
    
    // 生成报告
    const report = {
      timestamp: new Date().toISOString(),
      totalFiles: files.length,
      updatedFiles: totalUpdated,
      totalImages: totalImages,
      files: results.map(r => ({
        path: path.relative(process.cwd(), r.file),
        imageCount: r.count,
      })),
    };
    
    await fs.writeFile(
      'migration_paths_report.json',
      JSON.stringify(report, null, 2),
      'utf-8'
    );
    
    log('📄 详细报告已保存: migration_paths_report.json', 'cyan');
    
  } catch (error) {
    log(`❌ 错误: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// 运行
main();
