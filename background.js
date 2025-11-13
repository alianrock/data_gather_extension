// 后台服务脚本 (Service Worker)

// 扩展安装或更新时
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('网页信息收集助手已安装');
    // 打开选项页面进行初始配置
    chrome.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    console.log('网页信息收集助手已更新到版本', chrome.runtime.getManifest().version);
  }
});

// 监听来自popup和content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshot') {
    // 截取当前可见区域
    captureScreenshot(request.tabId)
      .then(screenshot => sendResponse({ success: true, data: screenshot }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 表示异步响应
  }

  if (request.action === 'sendToAPI') {
    // 发送数据到配置的API
    sendDataToAPI(request.data)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'generateAISummary') {
    // 生成AI摘要
    generateAISummary(request.pageInfo)
      .then(summary => sendResponse({ success: true, data: summary }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// 截取网页截图
async function captureScreenshot(tabId) {
  try {
    // 如果提供了tabId，激活该标签页
    if (tabId) {
      await chrome.tabs.update(tabId, { active: true });
    }

    // 截取可见区域
    const screenshot = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 90
    });

    return screenshot;
  } catch (error) {
    console.error('截图失败:', error);
    throw error;
  }
}

// 生成AI摘要
async function generateAISummary(pageInfo) {
  try {
    // 获取AI API配置
    const settings = await chrome.storage.sync.get([
      'aiApiUrl',
      'aiApiKey',
      'aiModel',
      'aiProvider'
    ]);

    if (!settings.aiApiUrl || !settings.aiApiKey) {
      throw new Error('请先在设置中配置AI API');
    }

    // 构建提示词
    const prompt = buildPrompt(pageInfo);

    let response;
    let summary;

    if (settings.aiProvider === 'anthropic') {
      // Anthropic API
      response = await fetch(settings.aiApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.aiApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: settings.aiModel || 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`AI API错误: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      summary = data.content[0].text;

    } else {
      // OpenAI或兼容API
      response = await fetch(settings.aiApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.aiApiKey}`
        },
        body: JSON.stringify({
          model: settings.aiModel || 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: prompt
          }],
          temperature: 0.7,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`AI API错误: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      summary = data.choices[0].message.content;
    }

    return summary;

  } catch (error) {
    console.error('生成AI摘要失败:', error);
    throw error;
  }
}

// 构建AI提示词
function buildPrompt(pageInfo) {
  return `请为以下网页生成一个简洁的摘要（200字以内）和详细介绍（500字以内）：

网页标题: ${pageInfo.title || '未知'}
网页URL: ${pageInfo.url || '未知'}
网页描述: ${pageInfo.description || '无'}
关键词: ${pageInfo.keywords || '无'}
主要标题: ${pageInfo.headings?.map(h => h.text || h).join(', ') || '无'}
网页内容片段: ${pageInfo.bodyText?.substring(0, 1000) || '无内容'}

请以以下格式输出：
【简介】
（一段简洁的描述，突出网页的核心内容和价值）

【详细介绍】
（详细的介绍内容，包括网页的主要功能、特点、适用场景等）`;
}

// 发送数据到API
async function sendDataToAPI(data) {
  try {
    // 获取数据API配置
    const settings = await chrome.storage.sync.get([
      'dataApiUrl',
      'dataApiKey',
      'dataApiMethod'
    ]);

    if (!settings.dataApiUrl) {
      throw new Error('请先在设置中配置数据API URL');
    }

    // 构建请求头
    const headers = {
      'Content-Type': 'application/json'
    };

    if (settings.dataApiKey) {
      headers['Authorization'] = `Bearer ${settings.dataApiKey}`;
    }

    // 发送请求
    const response = await fetch(settings.dataApiUrl, {
      method: settings.dataApiMethod || 'POST',
      headers: headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API错误 (${response.status}): ${errorText}`);
    }

    // 尝试解析JSON响应
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      return { message: 'Data sent successfully', status: response.status };
    }

  } catch (error) {
    console.error('发送数据到API失败:', error);
    throw error;
  }
}

// 右键菜单（可选功能）
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'collectPageInfo',
    title: '收集当前网页信息',
    contexts: ['page']
  });
});

// 右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'collectPageInfo') {
    // 打开popup或执行收集操作
    chrome.action.openPopup();
  }
});

// 监听标签页更新（可选：自动检测特定网页）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // 可以在这里添加自动收集逻辑
    console.log('页面加载完成:', tab.url);
  }
});

console.log('网页信息收集助手后台服务已启动');
