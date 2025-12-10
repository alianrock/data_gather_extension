let collectedData = null;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 设置链接点击事件
  document.getElementById('settingsLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // 收集按钮点击事件
  document.getElementById('collectBtn').addEventListener('click', collectPageInfo);

  // 发送数据按钮点击事件
  document.getElementById('sendDataBtn').addEventListener('click', sendDataToAPI);
});

// 显示状态消息
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove('hidden');

  if (type !== 'error') {
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 3000);
  }
}

// 显示/隐藏加载状态
function setLoading(isLoading, text = '正在处理...') {
  const loadingDiv = document.getElementById('loading');
  const loadingText = document.getElementById('loadingText');
  const collectBtn = document.getElementById('collectBtn');

  if (isLoading) {
    loadingDiv.classList.remove('hidden');
    loadingText.textContent = text;
    collectBtn.disabled = true;
  } else {
    loadingDiv.classList.add('hidden');
    collectBtn.disabled = false;
  }
}

// 收集网页信息
async function collectPageInfo() {
  try {
    setLoading(true, '正在收集网页信息...');
    showStatus('开始收集网页信息...', 'info');

    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      throw new Error('无法获取当前标签页');
    }

    // 注入内容脚本并获取网页信息
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: extractPageInfo
    });

    const pageInfo = result.result;

    if (!pageInfo) {
      throw new Error('无法提取网页信息');
    }

    // 显示网页基本信息
    displayPageInfo(pageInfo);

    // 截取当前网页
    setLoading(true, '正在截取网页...');
    const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

    // 显示截图
    displayScreenshot(screenshot);

    // 使用AI生成摘要
    setLoading(true, '正在生成AI摘要...');
    let summary;
    try {
      summary = await generateAISummary(pageInfo);
    } catch (aiError) {
      console.error('AI摘要生成失败，使用默认摘要:', aiError);
      showStatus(`AI摘要生成失败: ${aiError.message}`, 'error');
      // 生成默认摘要
      summary = `【简介】\n${pageInfo.title || '无标题'}\n\n【详细介绍】\n网站: ${pageInfo.domain}\n描述: ${pageInfo.description || '无描述'}`;
    }

    // 显示摘要
    displaySummary(summary);

    // 保存收集到的数据
    collectedData = {
      pageInfo,
      screenshot,
      summary,
      timestamp: new Date().toISOString()
    };

    // 显示发送按钮
    document.getElementById('sendDataBtn').classList.remove('hidden');

    setLoading(false);
    showStatus('✅ 信息收集完成！', 'success');

  } catch (error) {
    console.error('收集信息失败:', error);
    setLoading(false);
    showStatus('❌ 错误: ' + error.message, 'error');
  }
}

// 在页面中执行的函数，用于提取网页信息
function extractPageInfo() {
  // 获取网页标题
  const title = document.title;

  // 获取URL
  const url = window.location.href;

  // 获取描述
  const descMeta = document.querySelector('meta[name="description"]') ||
                   document.querySelector('meta[property="og:description"]');
  const description = descMeta ? descMeta.content : '';

  // 获取关键词
  const keywordsMeta = document.querySelector('meta[name="keywords"]');
  const keywords = keywordsMeta ? keywordsMeta.content : '';

  // 获取主要文本内容
  const bodyText = document.body.innerText.substring(0, 3000); // 限制文本长度

  // 获取所有标题
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map(h => h.innerText.trim())
    .filter(text => text.length > 0)
    .slice(0, 10);

  // 获取图片信息
  const images = Array.from(document.querySelectorAll('img'))
    .map(img => ({
      src: img.src,
      alt: img.alt
    }))
    .slice(0, 5);

  // 获取链接数量
  const linkCount = document.querySelectorAll('a').length;

  return {
    title,
    url,
    description,
    keywords,
    bodyText,
    headings,
    images,
    linkCount,
    domain: new URL(url).hostname
  };
}

// 显示网页基本信息
function displayPageInfo(info) {
  document.getElementById('pageTitle').textContent = info.title || '无标题';
  document.getElementById('pageUrl').textContent = info.url;
  document.getElementById('pageDesc').textContent = info.description || '无描述';
  document.getElementById('pageInfo').classList.remove('hidden');
}

// 显示截图
function displayScreenshot(screenshotUrl) {
  document.getElementById('screenshotImg').src = screenshotUrl;
  document.getElementById('screenshotCard').classList.remove('hidden');
}

// 显示摘要
function displaySummary(summary) {
  document.getElementById('aiSummary').textContent = summary;
  document.getElementById('summaryCard').classList.remove('hidden');
}

// 清理并安全解析JSON响应
function safeParseJSON(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('无效的响应数据');
  }

  // 移除BOM (Byte Order Mark) 字符
  let cleanText = text.replace(/^\uFEFF/, '');

  // 移除前导空白字符
  cleanText = cleanText.trimStart();

  // 尝试找到JSON的起始位置（{ 或 [）
  const jsonStartIndex = cleanText.search(/[\[{]/);
  if (jsonStartIndex === -1) {
    throw new Error('响应中未找到有效的JSON数据');
  }

  // 从JSON起始位置开始
  cleanText = cleanText.substring(jsonStartIndex);

  // 尝试找到JSON的结束位置
  // 通过匹配括号来找到完整的JSON
  let depth = 0;
  let inString = false;
  let escaped = false;
  let jsonEndIndex = -1;
  const startChar = cleanText[0];
  const endChar = startChar === '{' ? '}' : ']';

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === startChar) {
        depth++;
      } else if (char === endChar) {
        depth--;
        if (depth === 0) {
          jsonEndIndex = i + 1;
          break;
        }
      }
    }
  }

  if (jsonEndIndex > 0) {
    cleanText = cleanText.substring(0, jsonEndIndex);
  }

  // 移除尾部空白
  cleanText = cleanText.trimEnd();

  try {
    return JSON.parse(cleanText);
  } catch (parseError) {
    console.error('JSON解析失败，原始文本:', text.substring(0, 200));
    console.error('清理后文本:', cleanText.substring(0, 200));
    throw new Error(`JSON解析失败: ${parseError.message}`);
  }
}

// 使用AI生成摘要
async function generateAISummary(pageInfo) {
  try {
    // 获取AI API配置
    const settings = await chrome.storage.sync.get(['aiApiUrl', 'aiApiKey', 'aiModel', 'aiProvider']);

    if (!settings.aiApiUrl || !settings.aiApiKey) {
      throw new Error('请先在设置中配置AI API');
    }

    // 构建提示词
    const prompt = `请为以下网页生成一个简洁的摘要（200字以内）和详细介绍（500字以内）：

网页标题: ${pageInfo.title}
网页URL: ${pageInfo.url}
网页描述: ${pageInfo.description}
主要标题: ${pageInfo.headings.join(', ')}
网页内容片段: ${pageInfo.bodyText.substring(0, 1000)}

请以以下格式输出：
【简介】
（一段简洁的描述）

【详细介绍】
（详细的介绍内容）`;

    let response;
    let responseText;

    if (settings.aiProvider === 'anthropic') {
      // Anthropic API格式
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
        responseText = await response.text();
        let errorData;
        try {
          errorData = safeParseJSON(responseText);
        } catch {
          throw new Error(`AI API错误: ${response.statusText} - ${responseText.substring(0, 100)}`);
        }
        throw new Error(`AI API错误: ${errorData.error?.message || response.statusText}`);
      }

      responseText = await response.text();
      const data = safeParseJSON(responseText);

      if (!data.content || !data.content[0] || !data.content[0].text) {
        console.error('Anthropic响应格式异常:', data);
        throw new Error('AI响应格式异常');
      }

      return data.content[0].text;

    } else {
      // OpenAI API格式（兼容大多数API）
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
        responseText = await response.text();
        let errorData;
        try {
          errorData = safeParseJSON(responseText);
        } catch {
          throw new Error(`AI API错误: ${response.statusText} - ${responseText.substring(0, 100)}`);
        }
        throw new Error(`AI API错误: ${errorData.error?.message || response.statusText}`);
      }

      responseText = await response.text();
      const data = safeParseJSON(responseText);

      if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
        console.error('OpenAI响应格式异常:', data);
        throw new Error('AI响应格式异常');
      }

      return data.choices[0].message.content;
    }

  } catch (error) {
    console.error('AI生成失败:', error);
    throw error; // 抛出错误让调用者处理，而不是返回默认摘要
  }
}

// 发送数据到API
async function sendDataToAPI() {
  if (!collectedData) {
    showStatus('没有可发送的数据', 'error');
    return;
  }

  try {
    setLoading(true, '正在发送数据...');

    // 获取数据API配置
    const settings = await chrome.storage.sync.get(['dataApiUrl', 'dataApiKey', 'dataApiMethod']);

    if (!settings.dataApiUrl) {
      throw new Error('请先在设置中配置数据API URL');
    }

    // 准备发送的数据
    const dataToSend = {
      title: collectedData.pageInfo.title,
      url: collectedData.pageInfo.url,
      description: collectedData.pageInfo.description,
      keywords: collectedData.pageInfo.keywords,
      domain: collectedData.pageInfo.domain,
      headings: collectedData.pageInfo.headings,
      images: collectedData.pageInfo.images,
      linkCount: collectedData.pageInfo.linkCount,
      summary: collectedData.summary,
      screenshot: collectedData.screenshot,
      timestamp: collectedData.timestamp
    };

    // 构建请求头
    const headers = {
      'Content-Type': 'application/json'
    };

    if (settings.dataApiKey) {
      headers['Authorization'] = `Bearer ${settings.dataApiKey}`;
    }

    // 发送数据
    const response = await fetch(settings.dataApiUrl, {
      method: settings.dataApiMethod || 'POST',
      headers: headers,
      body: JSON.stringify(dataToSend)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API错误 (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log('数据发送成功:', result);

    setLoading(false);
    showStatus('✅ 数据发送成功！', 'success');

  } catch (error) {
    console.error('发送数据失败:', error);
    setLoading(false);
    showStatus('❌ 发送失败: ' + error.message, 'error');
  }
}
