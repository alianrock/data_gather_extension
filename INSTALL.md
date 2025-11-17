# 安装指南

## 从Git仓库安装

### 1. 克隆项目

```bash
# 方法1：克隆整个仓库
git clone <仓库URL> data_gather_extension
cd data_gather_extension
git checkout claude/chrome-webpage-info-collector-011CV5ZNun11uct2uR6rJdy4

# 方法2：直接克隆指定分支
git clone -b claude/chrome-webpage-info-collector-011CV5ZNun11uct2uR6rJdy4 <仓库URL> data_gather_extension
cd data_gather_extension
```

### 2. 准备图标（重要）

扩展需要图标文件才能正常加载。有两个选择：

#### 选项A：添加图标文件（推荐）

在 `icons/` 目录下放置以下文件：
- `icon16.png` (16x16像素)
- `icon48.png` (48x48像素)
- `icon128.png` (128x128像素)

可以使用在线工具快速生成：
- https://favicon.io/
- https://www.favicon-generator.org/

#### 选项B：临时移除图标配置

编辑 `manifest.json`，删除以下部分：

```json
  "action": {
    "default_popup": "popup.html"
    // 删除 default_icon 部分
  },
  // 删除整个 icons 部分
```

### 3. 在Chrome中加载扩展

1. 打开Chrome浏览器
2. 在地址栏输入：`chrome://extensions/`
3. 开启右上角的"开发者模式"开关
4. 点击"加载已解压的扩展程序"
5. 选择克隆下来的项目目录 `data_gather_extension`
6. 扩展安装完成！

### 4. 配置扩展

1. 点击扩展图标（或从扩展列表中找到）
2. 点击"设置"链接
3. 配置AI API：
   - 选择AI提供商（OpenAI/Anthropic/自定义）
   - 填写API URL和API Key
   - 选择模型
4. 配置数据API（可选）：
   - 填写接收数据的API URL
   - 填写认证密钥（如需要）
5. 点击"保存设置"

### 5. 开始使用

1. 访问任意网页
2. 点击扩展图标
3. 点击"🚀 开始收集网页信息"
4. 查看收集的信息和AI摘要
5. 点击"📤 发送数据到API"（如已配置）

## 故障排除

### 扩展无法加载
- **原因**：缺少图标文件
- **解决**：添加图标或从manifest.json中移除图标配置

### AI摘要生成失败
- **原因**：API配置错误或密钥无效
- **解决**：检查设置页面的API配置，验证API Key

### 数据发送失败
- **原因**：API URL错误或CORS问题
- **解决**：检查API URL，确保服务端配置了CORS

## 更新扩展

```bash
# 进入项目目录
cd data_gather_extension

# 拉取最新代码
git pull origin claude/chrome-webpage-info-collector-011CV5ZNun11uct2uR6rJdy4

# 在Chrome扩展页面点击"重新加载"按钮
```

## 开发调试

### 调试Popup页面
1. 右键点击扩展图标
2. 选择"检查弹出内容"
3. 使用Chrome DevTools调试

### 调试Options页面
1. 打开设置页面
2. 右键选择"检查"
3. 使用Chrome DevTools调试

### 调试Background脚本
1. 打开 `chrome://extensions/`
2. 找到扩展，点击"Service Worker"
3. 查看控制台日志

### 调试Content脚本
1. 在目标网页上按F12打开DevTools
2. 在Console中查看日志
3. Content脚本的日志会显示在网页的控制台中

## 下一步

- 阅读 [README.md](README.md) 了解详细功能
- 查看 [config.example.json](config.example.json) 了解配置示例
- 根据需要自定义代码
