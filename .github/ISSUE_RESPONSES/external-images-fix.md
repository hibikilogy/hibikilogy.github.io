# 外链图片无法显示问题 - 解决方案

## 问题描述

在文章中直接引用外链图片（如 `https://i.loli.net/xxx.jpg`）时，图片无法正常显示。

## 原因分析

这是由于浏览器的 **Referrer Policy** 导致的。当网站请求外部图片时，浏览器会发送 Referrer 信息（即当前页面的 URL）。某些图床服务器会检查 Referrer，如果来源不是自己的域名，就会拒绝提供图片。

## 解决方案

已在 `_includes/head.html` 中添加以下 meta 标签：

```html
<meta name="referrer" content="no-referrer">
```

这个标签告诉浏览器在请求外部资源时不发送 Referrer 信息，从而绕过图床的防盗链检查。

## Referrer Policy 选项说明

| 值 | 说明 |
|---|---|
| `no-referrer` | 不发送 Referrer 信息（最宽松，推荐用于图床） |
| `no-referrer-when-downgrade` | HTTPS→HTTP 时不发送（默认值） |
| `origin` | 只发送源（协议+域名+端口） |
| `origin-when-cross-origin` | 同源发送完整 URL，跨域只发送源 |
| `same-origin` | 只在同源请求时发送 |
| `strict-origin` | 只发送源，HTTPS→HTTP 时不发送 |
| `strict-origin-when-cross-origin` | 同源发送完整 URL，跨域发送源，HTTPS→HTTP 不发送 |
| `unsafe-url` | 总是发送完整 URL（不推荐） |

## 测试方法

1. 在文章中添加外链图片：
```markdown
![测试图片](https://i.loli.net/2020/03/13/Kk83Nb1DUaYOi6j.png)
```

2. 构建并访问网站，检查图片是否正常显示

3. 打开浏览器开发者工具（F12），查看 Network 标签，确认图片请求没有 Referrer 头

## 常见图床支持情况

| 图床 | 是否需要 no-referrer | 备注 |
|------|---------------------|------|
| SM.MS | ✅ 需要 | 有防盗链 |
| 路过图床 | ✅ 需要 | 有防盗链 |
| ImgURL | ✅ 需要 | 有防盗链 |
| i.loli.net | ✅ 需要 | 有防盗链 |
| GitHub | ❌ 不需要 | 无防盗链 |
| Imgur | ❌ 不需要 | 无防盗链 |

## 替代方案

如果不想使用 `no-referrer`，可以考虑：

1. **使用 GitHub 作为图床**
   - 将图片上传到仓库的 `images/` 目录
   - 使用相对路径引用：`![图片](/images/2024/xxx.jpg)`

2. **使用支持 Referrer 的图床**
   - Imgur
   - GitHub
   - Cloudinary

3. **使用图片代理服务**
   - 通过代理服务器转发图片请求
   - 例如：`https://images.weserv.nl/?url=原图片URL`

## 安全考虑

使用 `no-referrer` 的影响：

- ✅ 优点：可以加载任何外链图片
- ⚠️ 注意：外部网站无法通过 Referrer 统计流量来源
- ⚠️ 注意：某些需要 Referrer 验证的服务可能无法使用

对于京吹学报这样的静态博客网站，使用 `no-referrer` 是安全且推荐的做法。

## 相关资源

- [MDN - Referrer-Policy](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Headers/Referrer-Policy)
- [W3C Referrer Policy 规范](https://www.w3.org/TR/referrer-policy/)

## 已修复

✅ 此问题已在 commit [hash] 中修复，外链图片现在可以正常显示了。
