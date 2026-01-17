# Kawa - 智能网页助手 Chrome 扩展

一个强大的Chrome浏览器扩展，可以智能收集网页信息、生成AI摘要、截取网页截图，并将数据发送到自定义API接口。

## ✨ 主要功能

1. **📋 网页信息收集**
   - 自动提取网页标题、URL、描述、关键词
   - 获取页面主要内容和标题结构
   - 提取图片、链接等元数据
   - 支持结构化数据（JSON-LD）提取

2. **🤖 AI智能摘要**
   - 集成OpenAI、Anthropic Claude等大模型API
   - 自动生成网页简介和详细介绍
   - 可配置AI模型和参数
   - 支持自定义AI API接口

3. **📸 网页截图**
   - 一键截取当前可见网页区域
   - 高清PNG格式
   - 自动包含在收集的数据中

4. **📤 数据API对接**
   - 将收集的所有信息发送到自定义API
   - 支持配置API URL、认证密钥
   - 支持POST/PUT等HTTP方法
   - 完整的数据结构化传输

## 📦 安装方法

### 方法一：开发者模式安装（推荐）

1. 克隆或下载此项目到本地
   ```bash
   git clone <repository-url>
   cd data_gather_extension
   ```

2. 准备图标文件（可选）
   - 在 `icons/` 目录下放置 `icon16.png`、`icon48.png`、`icon128.png`
   - 或使用在线工具生成：https://favicon.io/

3. 打开Chrome浏览器，进入扩展管理页面
   - 地址栏输入：`chrome://extensions/`
   - 或通过菜单：更多工具 → 扩展程序

4. 开启"开发者模式"（右上角开关）

5. 点击"加载已解压的扩展程序"

6. 选择本项目的根目录（包含 `manifest.json` 的目录）

7. 扩展安装完成！

### 方法二：打包安装

1. 在开发者模式下点击"打包扩展程序"
2. 选择项目目录，生成 `.crx` 文件
3. 将 `.crx` 文件拖拽到扩展管理页面安装

## ⚙️ 配置说明

### 首次使用配置

1. 安装后会自动打开设置页面，或点击扩展图标 → 设置

2. **配置AI大模型API**
   - 选择AI服务提供商（OpenAI / Anthropic / 自定义）
   - 填写AI API URL
   - 填写AI API Key
   - 选择或输入模型名称

3. **配置数据传递API**
   - 填写接收数据的API URL
   - （可选）填写API认证密钥
   - 选择HTTP请求方法（POST/PUT）

4. 点击"保存设置"

### AI API 配置示例

#### OpenAI 配置
```
AI服务提供商: OpenAI
AI API URL: https://api.openai.com/v1/chat/completions
AI API Key: sk-your-api-key-here
AI模型: gpt-4o-mini
```

#### Anthropic Claude 配置
```
AI服务提供商: Anthropic (Claude)
AI API URL: https://api.anthropic.com/v1/messages
AI API Key: sk-ant-your-api-key-here
AI模型: claude-3-5-sonnet-20241022
```

#### 自定义API（如国内API）
```
AI服务提供商: 自定义
AI API URL: https://your-api.com/v1/chat/completions
AI API Key: your-api-key
AI模型: your-model-name
```

## 📖 使用方法

### 基本使用流程

1. **访问目标网页**
   - 打开你想要收集信息的网页

2. **启动收集**
   - 点击浏览器工具栏中的扩展图标
   - 点击"🚀 开始收集网页信息"按钮

3. **查看结果**
   - 扩展会自动完成以下操作：
     - ✅ 提取网页信息
     - ✅ 截取网页截图
     - ✅ 调用AI生成摘要
   - 所有结果会实时显示在弹出窗口中

4. **发送数据**
   - 点击"📤 发送数据到API"按钮
   - 数据将被发送到配置的API接口

### 右键菜单（可选）

- 在网页任意位置右键
- 选择"收集当前网页信息"
- 自动打开扩展弹窗

## 📊 数据格式

### 发送到API的数据结构

```json
{
  "title": "网页标题",
  "url": "https://example.com",
  "description": "网页描述",
  "keywords": "关键词1, 关键词2",
  "domain": "example.com",
  "headings": [
    {"level": "h1", "text": "主标题"},
    {"level": "h2", "text": "副标题"}
  ],
  "images": [
    {
      "src": "https://example.com/image.jpg",
      "alt": "图片描述",
      "width": 800,
      "height": 600
    }
  ],
  "linkCount": 42,
  "summary": "【简介】\nAI生成的网页简介...\n\n【详细介绍】\nAI生成的详细介绍...",
  "screenshot": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "timestamp": "2025-11-13T08:00:00.000Z"
}
```

## 🔧 高级功能

### 自定义提示词

如需自定义AI生成摘要的提示词，可以修改：
- `popup.js` 中的 `generateAISummary` 函数
- `background.js` 中的 `buildPrompt` 函数

### 扩展内容提取

如需提取更多网页信息，可以修改：
- `content.js` 中的 `extractPageInfo` 函数
- 添加自定义的提取逻辑

### API认证方式

默认使用 `Bearer Token` 认证，如需其他认证方式：
- 修改 `popup.js` 和 `background.js` 中的请求头设置

## 🛠️ 项目结构

```
data_gather_extension/
├── manifest.json          # 扩展配置文件
├── popup.html            # 弹出窗口页面
├── popup.js              # 弹出窗口逻辑
├── options.html          # 设置页面
├── options.js            # 设置页面逻辑
├── content.js            # 内容脚本（运行在网页上下文）
├── background.js         # 后台服务脚本
├── styles.css            # 通用样式
├── icons/                # 图标目录
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # 本文件
```

## 🔐 隐私说明

- 本扩展仅在用户主动点击时收集网页信息
- API Key等敏感信息使用Chrome的sync存储，仅存储在本地和用户的Chrome同步空间
- 不会收集或上传任何未经用户授权的数据
- 所有网络请求均由用户配置和触发

## ⚠️ 注意事项

1. **API费用**
   - 使用OpenAI、Anthropic等API会产生费用
   - 建议设置API使用限额
   - 可以选择成本较低的模型（如gpt-4o-mini）

2. **截图大小**
   - 截图为Base64编码，数据量较大
   - 如API有大小限制，考虑压缩或单独上传截图

3. **跨域问题**
   - 确保数据API支持CORS
   - 或在服务端正确配置CORS头

4. **隐私保护**
   - 不要在公共场所展示包含API Key的配置页面
   - 定期更换API密钥

## 🐛 故障排除

### AI摘要生成失败
- 检查AI API配置是否正确
- 验证API Key是否有效
- 查看浏览器控制台错误信息
- 确认网络连接正常

### 数据发送失败
- 检查数据API URL是否正确
- 验证API是否可访问
- 检查CORS配置
- 查看API返回的错误信息

### 扩展无法加载
- 确认manifest.json格式正确
- 检查所有文件路径是否正确
- 查看Chrome扩展页面的错误提示

## 📝 开发说明

### 本地开发

1. 修改代码后，在扩展管理页面点击"重新加载"
2. 使用Chrome DevTools调试：
   - Popup页面：右键扩展图标 → 检查弹出内容
   - Options页面：在设置页面右键 → 检查
   - Background：扩展管理页面 → Service Worker → 检查

### 调试技巧

- 在代码中使用 `console.log()` 输出调试信息
- 查看Chrome扩展的错误日志
- 使用 `chrome.storage.sync.get()` 检查存储的配置

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可证

MIT License

## 📮 联系方式

如有问题或建议，请提交Issue。

---

**享受使用！** 🎉
