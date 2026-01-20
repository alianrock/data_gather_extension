# ToastMark 官方网站

ToastMark Chrome 扩展的落地页和文档站点。

## 文件结构

```
site/
├── index.html          # 落地页
├── privacy-policy.html # 隐私政策
├── favicon.ico         # 网站图标
├── Dockerfile          # Docker 部署配置
├── nginx.conf          # Nginx 配置
├── assets/
│   ├── css/           # 样式文件（如需要）
│   └── images/        # 图片资源
│       ├── icon-48.png
│       ├── icon128.png
│       └── logo.svg
└── README.md
```

## 部署方式

### Dokploy 部署

1. 在 Dokploy 中创建新应用
2. 选择 Git 仓库并指定此目录
3. Dokploy 会自动检测 Dockerfile 并构建部署

### Docker 本地测试

```bash
# 构建镜像
docker build -t toastmark-site .

# 运行容器
docker run -p 8080:80 toastmark-site

# 访问 http://localhost:8080
```

### 静态托管

也可以直接部署到任何静态文件托管服务：
- Vercel
- Netlify
- Cloudflare Pages
- GitHub Pages（需要公开仓库）

## 配置说明

### 更新 Chrome Web Store 链接

部署后，记得更新 `index.html` 中的 Chrome Web Store 链接：

```html
<a href="https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID" ...>
```

### 更新隐私政策 URL

在 Chrome Web Store 商店信息中更新隐私政策链接为实际部署的 URL。

## 许可证

MIT License
