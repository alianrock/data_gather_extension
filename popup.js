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

  // 生成卡片按钮点击事件
  document.getElementById('generateCardBtn').addEventListener('click', generateShareCard);

  // 下载卡片按钮点击事件
  document.getElementById('downloadCardBtn').addEventListener('click', downloadCard);

  // 复制卡片按钮点击事件
  document.getElementById('copyCardBtn').addEventListener('click', copyCardToClipboard);

  // 社交媒体分享按钮点击事件
  document.getElementById('shareTwitterBtn').addEventListener('click', () => shareToSocialMedia('twitter'));
  document.getElementById('shareWeiboBtn').addEventListener('click', () => shareToSocialMedia('weibo'));
  document.getElementById('shareWechatBtn').addEventListener('click', () => shareToSocialMedia('wechat'));
  document.getElementById('shareFacebookBtn').addEventListener('click', () => shareToSocialMedia('facebook'));
  document.getElementById('shareLinkedinBtn').addEventListener('click', () => shareToSocialMedia('linkedin'));
  document.getElementById('shareCopyLinkBtn').addEventListener('click', copyShareLink);
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

    // 显示生成卡片按钮、分享区域和发送按钮
    document.getElementById('generateCardBtn').classList.remove('hidden');
    document.getElementById('shareSection').classList.remove('hidden');
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

// 生成分享卡片
async function generateShareCard() {
  if (!collectedData) {
    showStatus('请先收集网页信息', 'error');
    return;
  }

  try {
    setLoading(true, '正在生成分享卡片...');

    const canvas = document.getElementById('cardCanvas');
    const ctx = canvas.getContext('2d');

    // 卡片尺寸设置
    const cardWidth = 800;
    const padding = 40;
    const screenshotHeight = 400;
    const headerHeight = 120;
    const summaryHeight = 200;
    const footerHeight = 60;
    const cardHeight = headerHeight + screenshotHeight + summaryHeight + footerHeight + padding * 2;

    canvas.width = cardWidth;
    canvas.height = cardHeight;

    // 绘制背景渐变
    const gradient = ctx.createLinearGradient(0, 0, cardWidth, cardHeight);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cardWidth, cardHeight);

    // 绘制白色内容区域
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, padding, padding, cardWidth - padding * 2, cardHeight - padding * 2, 16);
    ctx.fill();

    // 绘制标题
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const title = truncateText(ctx, collectedData.pageInfo.title || '无标题', cardWidth - padding * 4);
    ctx.fillText(title, padding * 2, padding + 50);

    // 绘制URL
    ctx.fillStyle = '#667eea';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const url = truncateText(ctx, collectedData.pageInfo.url || '', cardWidth - padding * 4);
    ctx.fillText(url, padding * 2, padding + 80);

    // 绘制域名标签
    ctx.fillStyle = '#f0f0f0';
    const domain = collectedData.pageInfo.domain || new URL(collectedData.pageInfo.url).hostname;
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const domainWidth = ctx.measureText(domain).width + 20;
    roundRect(ctx, padding * 2, padding + 90, domainWidth, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#666666';
    ctx.fillText(domain, padding * 2 + 10, padding + 106);

    // 加载并绘制截图
    const screenshotY = padding + headerHeight;
    if (collectedData.screenshot) {
      try {
        const img = await loadImage(collectedData.screenshot);
        // 计算截图绘制区域，保持宽高比
        const maxWidth = cardWidth - padding * 4;
        const maxHeight = screenshotHeight - 20;
        const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const drawX = padding * 2 + (maxWidth - drawWidth) / 2;

        // 绘制截图边框
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        roundRect(ctx, drawX - 2, screenshotY - 2, drawWidth + 4, drawHeight + 4, 8);
        ctx.stroke();

        // 绘制截图
        ctx.save();
        roundRect(ctx, drawX, screenshotY, drawWidth, drawHeight, 6);
        ctx.clip();
        ctx.drawImage(img, drawX, screenshotY, drawWidth, drawHeight);
        ctx.restore();
      } catch (e) {
        console.error('加载截图失败:', e);
        // 绘制占位符
        ctx.fillStyle = '#f5f5f5';
        roundRect(ctx, padding * 2, screenshotY, cardWidth - padding * 4, screenshotHeight - 20, 8);
        ctx.fill();
        ctx.fillStyle = '#999999';
        ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('截图加载失败', cardWidth / 2, screenshotY + screenshotHeight / 2);
        ctx.textAlign = 'left';
      }
    }

    // 绘制摘要区域
    const summaryY = screenshotY + screenshotHeight;
    ctx.fillStyle = '#f9f9f9';
    roundRect(ctx, padding * 2, summaryY, cardWidth - padding * 4, summaryHeight - 20, 8);
    ctx.fill();

    // 绘制摘要标题
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('📝 AI 摘要', padding * 2 + 15, summaryY + 25);

    // 绘制摘要内容（多行）
    ctx.fillStyle = '#555555';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const summaryText = collectedData.summary || '暂无摘要';
    wrapText(ctx, summaryText, padding * 2 + 15, summaryY + 50, cardWidth - padding * 4 - 30, 20, 6);

    // 绘制底部信息
    const footerY = summaryY + summaryHeight;
    ctx.fillStyle = '#999999';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const timestamp = new Date(collectedData.timestamp).toLocaleString('zh-CN');
    ctx.fillText(`收集时间: ${timestamp}`, padding * 2, footerY + 10);

    // 绘制品牌信息
    ctx.textAlign = 'right';
    ctx.fillText('由 网页信息收集助手 生成', cardWidth - padding * 2, footerY + 10);
    ctx.textAlign = 'left';

    // 将canvas转换为图片
    const cardDataUrl = canvas.toDataURL('image/png');
    document.getElementById('cardPreviewImg').src = cardDataUrl;
    document.getElementById('cardPreviewSection').classList.remove('hidden');

    // 保存卡片数据URL
    collectedData.cardDataUrl = cardDataUrl;

    setLoading(false);
    showStatus('✅ 分享卡片生成成功！', 'success');

  } catch (error) {
    console.error('生成卡片失败:', error);
    setLoading(false);
    showStatus('❌ 生成卡片失败: ' + error.message, 'error');
  }
}

// 辅助函数：绘制圆角矩形
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// 辅助函数：加载图片
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// 辅助函数：截断文本
function truncateText(ctx, text, maxWidth) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}

// 辅助函数：自动换行绘制文本
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  if (!text) return;

  // 清理文本，移除多余空白
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const words = cleanText.split('');
  let line = '';
  let lineCount = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i];
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && line !== '') {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = words[i];
      lineCount++;

      if (lineCount >= maxLines) {
        // 在最后一行添加省略号
        const remaining = words.slice(i).join('');
        if (remaining.length > 0) {
          let lastLine = truncateText(ctx, line + remaining, maxWidth - 20);
          if (!lastLine.endsWith('...')) {
            lastLine = truncateText(ctx, lastLine, maxWidth - 20);
          }
          ctx.fillText(lastLine, x, y + (lineCount - 1) * lineHeight);
        }
        return;
      }
    } else {
      line = testLine;
    }
  }

  if (line && lineCount < maxLines) {
    ctx.fillText(line, x, y + lineCount * lineHeight);
  }
}

// 下载卡片
function downloadCard() {
  if (!collectedData || !collectedData.cardDataUrl) {
    showStatus('请先生成分享卡片', 'error');
    return;
  }

  const link = document.createElement('a');
  link.download = `webpage-card-${Date.now()}.png`;
  link.href = collectedData.cardDataUrl;
  link.click();

  showStatus('✅ 卡片已开始下载', 'success');
}

// 复制卡片到剪贴板
async function copyCardToClipboard() {
  if (!collectedData || !collectedData.cardDataUrl) {
    showStatus('请先生成分享卡片', 'error');
    return;
  }

  try {
    // 将data URL转换为Blob
    const response = await fetch(collectedData.cardDataUrl);
    const blob = await response.blob();

    // 使用Clipboard API复制图片
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob
      })
    ]);

    showStatus('✅ 卡片已复制到剪贴板', 'success');
  } catch (error) {
    console.error('复制失败:', error);
    showStatus('❌ 复制失败: ' + error.message, 'error');
  }
}

// 分享到社交媒体
function shareToSocialMedia(platform) {
  if (!collectedData || !collectedData.pageInfo) {
    showStatus('请先收集网页信息', 'error');
    return;
  }

  const { title, url, description, domain } = collectedData.pageInfo;
  const summary = collectedData.summary || description || '';
  const shortSummary = summary.length > 200 ? summary.substring(0, 200) + '...' : summary;

  let shareUrl = '';
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedDesc = encodeURIComponent(shortSummary);

  switch (platform) {
    case 'twitter':
      // Twitter/X 分享
      const tweetText = `${title}\n\n${shortSummary}`;
      shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodedUrl}`;
      openShareWindow(shareUrl, 'Twitter', 600, 400);
      showStatus('✅ 正在打开 Twitter 分享窗口', 'success');
      break;

    case 'weibo':
      // 微博分享
      shareUrl = `https://service.weibo.com/share/share.php?url=${encodedUrl}&title=${encodedTitle}&summary=${encodedDesc}`;
      openShareWindow(shareUrl, '微博', 700, 500);
      showStatus('✅ 正在打开微博分享窗口', 'success');
      break;

    case 'wechat':
      // 微信不支持直接URL分享，复制内容到剪贴板
      copyWechatShareContent();
      break;

    case 'facebook':
      // Facebook 分享
      shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedTitle}`;
      openShareWindow(shareUrl, 'Facebook', 600, 400);
      showStatus('✅ 正在打开 Facebook 分享窗口', 'success');
      break;

    case 'linkedin':
      // LinkedIn 分享
      shareUrl = `https://www.linkedin.com/shareArticle?mini=true&url=${encodedUrl}&title=${encodedTitle}&summary=${encodedDesc}`;
      openShareWindow(shareUrl, 'LinkedIn', 600, 500);
      showStatus('✅ 正在打开 LinkedIn 分享窗口', 'success');
      break;

    default:
      showStatus('不支持的分享平台', 'error');
  }
}

// 打开分享窗口
function openShareWindow(url, title, width, height) {
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  const features = `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`;

  window.open(url, title, features);
}

// 复制微信分享内容
async function copyWechatShareContent() {
  if (!collectedData || !collectedData.pageInfo) {
    showStatus('请先收集网页信息', 'error');
    return;
  }

  const { title, url, description } = collectedData.pageInfo;
  const summary = collectedData.summary || description || '';

  // 构建微信分享文本
  const shareText = `📋 ${title}

${summary}

🔗 ${url}

---
由 网页信息收集助手 生成`;

  try {
    await navigator.clipboard.writeText(shareText);
    showStatus('✅ 分享内容已复制到剪贴板，请打开微信粘贴分享', 'success');
  } catch (error) {
    console.error('复制失败:', error);
    showStatus('❌ 复制失败: ' + error.message, 'error');
  }
}

// 复制分享链接
async function copyShareLink() {
  if (!collectedData || !collectedData.pageInfo) {
    showStatus('请先收集网页信息', 'error');
    return;
  }

  const { title, url, description } = collectedData.pageInfo;
  const summary = collectedData.summary || description || '';

  // 构建分享文本
  const shareText = `${title}\n\n${summary}\n\n🔗 ${url}`;

  try {
    await navigator.clipboard.writeText(shareText);
    showStatus('✅ 分享链接已复制到剪贴板', 'success');
  } catch (error) {
    console.error('复制失败:', error);
    showStatus('❌ 复制失败: ' + error.message, 'error');
  }
}
