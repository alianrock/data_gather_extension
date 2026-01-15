// 后台服务脚本 (Service Worker)
// 支持后台执行AI请求，状态持久化，队列处理

// ========== 队列管理 ==========

// 收集队列
let collectionQueue = [];
let isProcessing = false;

// 添加到队列
async function addToQueue(tabId, pageInfo) {
  const url = pageInfo.url;

  // 检查是否已在队列中
  const exists = collectionQueue.some(item => item.url === url);
  if (exists) {
    return { queued: true, position: collectionQueue.findIndex(i => i.url === url) + 1 };
  }

  // 添加到队列
  collectionQueue.push({ tabId, pageInfo, url, addedAt: Date.now() });

  // 保存队列状态
  await saveQueueState();

  // 通知popup队列状态
  broadcastQueueStatus();

  // 如果没有在处理，开始处理
  if (!isProcessing) {
    processQueue();
  }

  return { queued: true, position: collectionQueue.length };
}

// 处理队列
async function processQueue() {
  if (isProcessing || collectionQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (collectionQueue.length > 0) {
    const item = collectionQueue[0];

    try {
      await collectPageInBackground(item.tabId, item.pageInfo);
    } catch (error) {
      console.error('[Queue] 处理失败:', error);
    }

    // 移除已处理的项
    collectionQueue.shift();
    await saveQueueState();
    broadcastQueueStatus();
  }

  isProcessing = false;
}

// 保存队列状态
async function saveQueueState() {
  await chrome.storage.local.set({
    collectionQueue: collectionQueue.map(item => ({
      url: item.url,
      tabId: item.tabId,
      pageInfo: item.pageInfo,
      addedAt: item.addedAt
    }))
  });
}

// 恢复队列状态（Service Worker重启时）
async function restoreQueueState() {
  const data = await chrome.storage.local.get('collectionQueue');
  if (data.collectionQueue && data.collectionQueue.length > 0) {
    collectionQueue = data.collectionQueue;
    // 继续处理
    if (!isProcessing) {
      processQueue();
    }
  }
}

// 广播队列状态给所有popup
function broadcastQueueStatus() {
  chrome.runtime.sendMessage({
    action: 'queueStatus',
    queue: collectionQueue.map((item, index) => ({
      url: item.url,
      position: index + 1,
      isProcessing: index === 0 && isProcessing
    })),
    total: collectionQueue.length,
    isProcessing
  }).catch(() => {});
}

// 获取队列中的位置
function getQueuePosition(url) {
  const index = collectionQueue.findIndex(item => item.url === url);
  return index === -1 ? null : {
    position: index + 1,
    total: collectionQueue.length,
    isProcessing: index === 0 && isProcessing
  };
}

// ========== 图标状态管理 ==========

// 设置图标为loading状态
function setIconLoading(tabId) {
  chrome.action.setBadgeText({ text: '...', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#6366f1', tabId });
}

// 设置图标为完成状态
function setIconDone(tabId) {
  chrome.action.setBadgeText({ text: '✓', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId });
  // 3秒后清除badge
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '', tabId });
  }, 3000);
}

// 设置图标为错误状态
function setIconError(tabId) {
  chrome.action.setBadgeText({ text: '!', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });
}

// 清除图标状态
function clearIconBadge(tabId) {
  chrome.action.setBadgeText({ text: '', tabId });
}

// ========== 状态存储 ==========

// 获取页面收集状态的key
function getStateKey(url) {
  return `pageState_${btoa(url).substring(0, 50)}`;
}

// 保存页面状态
async function savePageState(url, state) {
  const key = getStateKey(url);
  await chrome.storage.local.set({ [key]: state });
}

// 获取页面状态
async function getPageState(url) {
  const key = getStateKey(url);
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

// 清除页面状态
async function clearPageState(url) {
  const key = getStateKey(url);
  await chrome.storage.local.remove(key);
}

// ========== AI请求（后台执行） ==========

// 后台执行收集任务
async function collectPageInBackground(tabId, pageInfo) {
  const url = pageInfo.url;

  // 设置loading状态
  setIconLoading(tabId);
  await savePageState(url, {
    status: 'loading',
    pageInfo,
    timestamp: Date.now()
  });

  try {
    // 截图
    const screenshot = await captureScreenshot(tabId);

    // 生成AI摘要（流式）
    const summary = await generateAISummaryStream(pageInfo, tabId, url);

    // 提取分类
    const category = extractCategoryFromSummary(summary);

    // 保存完成状态
    const collectedData = {
      pageInfo,
      screenshot,
      summary,
      category,
      timestamp: new Date().toISOString()
    };

    await savePageState(url, {
      status: 'done',
      data: collectedData,
      timestamp: Date.now()
    });

    setIconDone(tabId);

    // 通知popup更新（如果打开的话）
    chrome.runtime.sendMessage({
      action: 'collectionComplete',
      url,
      data: collectedData
    }).catch(() => {}); // popup可能没打开，忽略错误

    return collectedData;

  } catch (error) {
    console.error('[BG] 收集失败:', error);
    setIconError(tabId);

    await savePageState(url, {
      status: 'error',
      error: error.message,
      pageInfo,
      timestamp: Date.now()
    });

    // 通知popup
    chrome.runtime.sendMessage({
      action: 'collectionError',
      url,
      error: error.message
    }).catch(() => {});

    throw error;
  }
}

// 流式AI摘要生成
async function generateAISummaryStream(pageInfo, tabId, url) {
  const settings = await chrome.storage.sync.get([
    'aiApiUrl', 'aiApiKey', 'aiModel', 'aiProvider',
    'summaryLanguage', 'summaryStyle'
  ]);

  if (!settings.aiApiUrl || !settings.aiApiKey) {
    throw new Error('请先在设置中配置AI API');
  }

  const prompt = buildPrompt(pageInfo, settings.summaryLanguage, settings.summaryStyle);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    let response;
    const useStream = true;

    if (settings.aiProvider === 'anthropic') {
      response = await fetch(settings.aiApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.aiApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: settings.aiModel || 'claude-3-5-sonnet-20241022',
          max_tokens: 600,
          stream: useStream,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: controller.signal
      });
    } else {
      response = await fetch(settings.aiApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.aiApiKey}`
        },
        body: JSON.stringify({
          model: settings.aiModel || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 600,
          stream: useStream
        }),
        signal: controller.signal
      });
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      const errorText = await response.text();
      throw new Error(`AI API错误: ${response.statusText}`);
    }

    // 流式读取
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

        if (trimmedLine.startsWith('data: ')) {
          try {
            const jsonStr = trimmedLine.slice(6);
            if (!jsonStr || jsonStr === '[DONE]') continue;

            const data = JSON.parse(jsonStr);
            let chunk = '';

            if (settings.aiProvider === 'anthropic') {
              if (data.type === 'content_block_delta' && data.delta?.text) {
                chunk = data.delta.text;
              }
            } else {
              if (data.choices?.[0]?.delta?.content) {
                chunk = data.choices[0].delta.content;
              }
            }

            if (chunk) {
              fullContent += chunk;
              // 更新进度状态
              await savePageState(url, {
                status: 'loading',
                pageInfo,
                streamingContent: fullContent,
                timestamp: Date.now()
              });
              // 通知popup更新
              chrome.runtime.sendMessage({
                action: 'streamUpdate',
                url,
                content: fullContent
              }).catch(() => {});
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    clearTimeout(timeoutId);
    return fullContent;

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('AI请求超时，请检查网络连接');
    }
    throw error;
  }
}

// 构建提示词（精简版）
function buildPrompt(pageInfo, language, style) {
  const lang = language || 'zh-CN';
  const bodyText = pageInfo.bodyText?.substring(0, 800) || '';
  const desc = pageInfo.description?.substring(0, 200) || '';

  const langPrefix = lang === 'zh-CN' ? '请用简体中文回复。' :
                     lang === 'zh-TW' ? '請用繁體中文回覆。' :
                     'Reply in English.';

  const stylePrompt = style === 'brief' ?
    '极简：⚡ 一句话 + 📌 3个要点 + 🏷️ 关键词（共50字内）' :
    style === 'professional' ?
    '专业摘要，格式：📋 概述（2句）、🎯 功能（3点）、👥 适用人群' :
    style === 'casual' ?
    '像朋友推荐一样介绍：😍 开场、💬 介绍（80字）、🌟 亮点（3个）' :
    '为网页写分享文案，格式：🎯 一句话总结、📝 介绍（100字）、✨ 亮点（3个，带emoji）、🏷️ 标签（5个#标签）';

  return `${langPrefix}

${stylePrompt}

【网页信息】
标题: ${pageInfo.title || '无标题'}
描述: ${desc}
正文: ${bodyText}

分类选项：技术工具、学习资源、新闻资讯、娱乐休闲、商业服务、设计创意、生活服务、其他
请在末尾标注"📂 分类：[分类名]"`;
}

// 从摘要中提取分类
function extractCategoryFromSummary(summary) {
  const categories = ['技术工具', '学习资源', '新闻资讯', '娱乐休闲', '商业服务', '设计创意', '生活服务'];
  const match = summary.match(/📂\s*分类[：:]\s*([^\n\r]+)/);
  if (match) {
    const cat = match[1].trim();
    if (categories.includes(cat)) return cat;
  }
  return '其他';
}

// ========== 截图 ==========

async function captureScreenshot(tabId) {
  try {
    if (tabId) {
      await chrome.tabs.update(tabId, { active: true });
    }
    const screenshot = await chrome.tabs.captureVisibleTab(null, {
      format: 'jpeg',
      quality: 80
    });
    return screenshot;
  } catch (error) {
    console.error('截图失败:', error);
    throw error;
  }
}

// ========== 消息处理 ==========

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 启动后台收集（加入队列）
  if (request.action === 'startBackgroundCollection') {
    addToQueue(request.tabId, request.pageInfo)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 获取页面状态
  if (request.action === 'getPageState') {
    (async () => {
      const state = await getPageState(request.url);
      const queuePosition = getQueuePosition(request.url);
      sendResponse({ success: true, state, queuePosition });
    })();
    return true;
  }

  // 获取队列状态
  if (request.action === 'getQueueStatus') {
    sendResponse({
      success: true,
      queue: collectionQueue.map((item, index) => ({
        url: item.url,
        position: index + 1,
        isProcessing: index === 0 && isProcessing
      })),
      total: collectionQueue.length,
      isProcessing
    });
    return true;
  }

  // 清除页面状态
  if (request.action === 'clearPageState') {
    clearPageState(request.url)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 截图
  if (request.action === 'captureScreenshot') {
    captureScreenshot(request.tabId)
      .then(screenshot => sendResponse({ success: true, data: screenshot }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// ========== 扩展安装 ==========

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }

  // 创建右键菜单
  if (chrome.contextMenus) {
    chrome.contextMenus.create({
      id: 'collectPageInfo',
      title: '收集当前网页信息',
      contexts: ['page']
    });
  }
});

// 右键菜单点击
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'collectPageInfo') {
      chrome.action.openPopup();
    }
  });
}

// 启动时恢复队列
restoreQueueState();
