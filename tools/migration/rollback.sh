#!/bin/bash
# 回滚迁移脚本

if [ -z "$1" ]; then
  echo "❌ 错误: 请指定备份目录"
  echo "用法: bash tools/migration/rollback.sh <backup_directory>"
  exit 1
fi

BACKUP_DIR="$1"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ 错误: 备份目录不存在: $BACKUP_DIR"
  exit 1
fi

echo "⚠️  警告: 即将从备份恢复文件"
echo "备份目录: $BACKUP_DIR"
echo ""
read -p "确认继续? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 已取消"
  exit 1
fi

echo "🔄 开始回滚..."

# 删除新目录
rm -rf content/ src/ config/ tools/ tests/ docs/

# 恢复备份
cp -r "$BACKUP_DIR"/* .

echo "✅ 回滚完成"
echo "💡 备份目录仍保留在: $BACKUP_DIR"
