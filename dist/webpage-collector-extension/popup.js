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

// 语言配置
const LANGUAGE_CONFIG = {
  'zh-CN': { name: '中文', hook: '发现宝藏', recommend: '强烈推荐', highlight: '亮点' },
  'zh-TW': { name: '中文', hook: '發現寶藏', recommend: '強烈推薦', highlight: '亮點' },
  'en': { name: 'English', hook: 'Must See', recommend: 'Highly Recommended', highlight: 'Highlights' },
  'ja': { name: '日本語', hook: '必見', recommend: 'おすすめ', highlight: 'ハイライト' },
  'ko': { name: '한국어', hook: '필독', recommend: '강력 추천', highlight: '하이라이트' },
  'es': { name: 'Español', hook: 'Imprescindible', recommend: 'Muy Recomendado', highlight: 'Destacados' },
  'fr': { name: 'Français', hook: 'À Découvrir', recommend: 'Recommandé', highlight: 'Points Forts' },
  'de': { name: 'Deutsch', hook: 'Muss Man Sehen', recommend: 'Empfehlung', highlight: 'Highlights' }
};

// 风格提示词配置
const STYLE_PROMPTS = {
  social: {
    'zh-CN': `你是一个社交媒体内容创作专家。请为这个网页创建一段适合在社交媒体分享的精彩介绍。

要求：
1. 开头用一个吸引眼球的emoji和hook语句
2. 用2-3句话概括核心价值，要有感染力和说服力
3. 列出3个关键亮点（用emoji标注）
4. 结尾加一个行动号召语句
5. 语气要热情、真诚、有感染力，像朋友推荐好东西一样
6. 总长度控制在200字以内`,
    'en': `You are a social media content expert. Create an engaging introduction for sharing on social media.

Requirements:
1. Start with an eye-catching emoji and hook
2. Summarize core value in 2-3 compelling sentences
3. List 3 key highlights with emojis
4. End with a call-to-action
5. Be enthusiastic, authentic, and persuasive
6. Keep it under 200 words`,
    'default': `Create social media friendly content with emojis, highlights, and call-to-action. Be engaging and persuasive.`
  },
  professional: {
    'zh-CN': `请用专业、正式的语气为这个网页生成摘要。包含：核心概述、主要功能/内容、适用场景。保持客观中立。`,
    'en': `Generate a professional summary including: core overview, main features/content, use cases. Keep it objective and formal.`,
    'default': `Generate a professional, formal summary with overview and key points.`
  },
  casual: {
    'zh-CN': `用轻松活泼的语气介绍这个网页，就像跟朋友聊天一样。可以用一些口语化表达和emoji，让人觉得有趣想点进去看看。`,
    'en': `Introduce this page in a fun, casual way - like chatting with friends. Use casual language and emojis to make it interesting.`,
    'default': `Create a fun, casual summary with friendly tone and emojis.`
  },
  brief: {
    'zh-CN': `用一句话概括这个网页的核心价值，再用3个要点列出最重要的信息。极简风格，不超过100字。`,
    'en': `One sentence for core value, then 3 bullet points for key info. Minimalist style, under 100 words.`,
    'default': `Ultra-brief: one sentence + 3 bullet points.`
  }
};

// 构建AI提示词
function buildSocialPrompt(pageInfo, language, style) {
  const lang = language || 'zh-CN';
  const styleKey = style || 'social';

  // 获取风格提示
  const stylePrompt = STYLE_PROMPTS[styleKey]?.[lang] ||
                      STYLE_PROMPTS[styleKey]?.['default'] ||
                      STYLE_PROMPTS.social['zh-CN'];

  // 语言指示
  const langName = LANGUAGE_CONFIG[lang]?.name || '中文';
  const langInstruction = lang.startsWith('zh') ? '' : `\n\nIMPORTANT: Respond in ${langName} language.`;

  return `${stylePrompt}${langInstruction}

网页信息：
- 标题: ${pageInfo.title || '无标题'}
- URL: ${pageInfo.url || ''}
- 描述: ${pageInfo.description || '无描述'}
- 网站: ${pageInfo.domain || ''}
- 主要标题: ${pageInfo.headings?.slice(0, 5).join(', ') || '无'}
- 内容片段: ${pageInfo.bodyText?.substring(0, 800) || '无内容'}

请直接输出内容，不要加任何标记或格式说明。`;
}

// 使用AI生成摘要
async function generateAISummary(pageInfo) {
  try {
    // 获取AI API配置
    const settings = await chrome.storage.sync.get([
      'aiApiUrl', 'aiApiKey', 'aiModel', 'aiProvider',
      'summaryLanguage', 'summaryStyle'
    ]);

    if (!settings.aiApiUrl || !settings.aiApiKey) {
      throw new Error('请先在设置中配置AI API');
    }

    // 构建社交化提示词
    const prompt = buildSocialPrompt(
      pageInfo,
      settings.summaryLanguage || 'zh-CN',
      settings.summaryStyle || 'social'
    );

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

    // 卡片尺寸设置 - 更适合社交媒体的比例
    const cardWidth = 1080;
    const cardHeight = 1350; // 4:5 比例，适合 Instagram
    const margin = 48;
    const innerPadding = 32;

    canvas.width = cardWidth;
    canvas.height = cardHeight;

    // 绘制渐变背景 - 更现代的配色
    const bgGradient = ctx.createLinearGradient(0, 0, cardWidth, cardHeight);
    bgGradient.addColorStop(0, '#1a1a2e');
    bgGradient.addColorStop(0.5, '#16213e');
    bgGradient.addColorStop(1, '#0f3460');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, cardWidth, cardHeight);

    // 添加装饰性光晕效果
    const glowGradient = ctx.createRadialGradient(
      cardWidth * 0.8, cardHeight * 0.2, 0,
      cardWidth * 0.8, cardHeight * 0.2, cardWidth * 0.5
    );
    glowGradient.addColorStop(0, 'rgba(102, 126, 234, 0.3)');
    glowGradient.addColorStop(1, 'rgba(102, 126, 234, 0)');
    ctx.fillStyle = glowGradient;
    ctx.fillRect(0, 0, cardWidth, cardHeight);

    // 主内容卡片 - 毛玻璃效果背景
    const cardX = margin;
    const cardY = margin;
    const cardInnerWidth = cardWidth - margin * 2;
    const cardInnerHeight = cardHeight - margin * 2;

    // 卡片背景（半透明白色）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    roundRect(ctx, cardX, cardY, cardInnerWidth, cardInnerHeight, 24);
    ctx.fill();

    // 添加卡片阴影效果（通过多层实现）
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;

    // ========== 顶部品牌区域 ==========
    const brandY = cardY + innerPadding;

    // 品牌标签背景
    const brandGradient = ctx.createLinearGradient(cardX + innerPadding, brandY, cardX + innerPadding + 200, brandY);
    brandGradient.addColorStop(0, '#667eea');
    brandGradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = brandGradient;
    roundRect(ctx, cardX + innerPadding, brandY, 180, 36, 18);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('📋 网页收集助手', cardX + innerPadding + 16, brandY + 24);

    // ========== 标题区域 ==========
    const titleY = brandY + 70;
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const title = collectedData.pageInfo.title || '无标题';
    const titleLines = wrapTextToLines(ctx, title, cardInnerWidth - innerPadding * 2, 2);
    titleLines.forEach((line, i) => {
      ctx.fillText(line, cardX + innerPadding, titleY + i * 44);
    });

    // 域名标签
    const domainY = titleY + titleLines.length * 44 + 16;
    const domain = collectedData.pageInfo.domain || new URL(collectedData.pageInfo.url).hostname;
    ctx.fillStyle = '#f0f4ff';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const domainWidth = ctx.measureText('🌐 ' + domain).width + 24;
    roundRect(ctx, cardX + innerPadding, domainY, domainWidth, 32, 16);
    ctx.fill();
    ctx.fillStyle = '#667eea';
    ctx.fillText('🌐 ' + domain, cardX + innerPadding + 12, domainY + 22);

    // ========== 截图区域 ==========
    const screenshotY = domainY + 56;
    const screenshotHeight = 480;
    const screenshotWidth = cardInnerWidth - innerPadding * 2;

    if (collectedData.screenshot) {
      try {
        const img = await loadImage(collectedData.screenshot);
        const scale = Math.min(screenshotWidth / img.width, screenshotHeight / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const drawX = cardX + innerPadding + (screenshotWidth - drawWidth) / 2;

        // 截图阴影
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 8;

        // 绘制截图
        ctx.save();
        roundRect(ctx, drawX, screenshotY, drawWidth, drawHeight, 16);
        ctx.clip();
        ctx.drawImage(img, drawX, screenshotY, drawWidth, drawHeight);
        ctx.restore();

        ctx.shadowColor = 'transparent';
      } catch (e) {
        console.error('加载截图失败:', e);
        ctx.fillStyle = '#f5f7fa';
        roundRect(ctx, cardX + innerPadding, screenshotY, screenshotWidth, screenshotHeight, 16);
        ctx.fill();
        ctx.fillStyle = '#adb5bd';
        ctx.font = '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('📷 截图加载失败', cardX + cardInnerWidth / 2, screenshotY + screenshotHeight / 2);
        ctx.textAlign = 'left';
      }
    }

    // ========== AI摘要区域 ==========
    const summaryY = screenshotY + screenshotHeight + 32;
    const summaryHeight = 280;

    // 摘要背景 - 渐变边框效果
    const summaryGradient = ctx.createLinearGradient(
      cardX + innerPadding, summaryY,
      cardX + innerPadding + screenshotWidth, summaryY + summaryHeight
    );
    summaryGradient.addColorStop(0, 'rgba(102, 126, 234, 0.1)');
    summaryGradient.addColorStop(1, 'rgba(118, 75, 162, 0.1)');
    ctx.fillStyle = summaryGradient;
    roundRect(ctx, cardX + innerPadding, summaryY, screenshotWidth, summaryHeight, 16);
    ctx.fill();

    // 摘要边框
    ctx.strokeStyle = 'rgba(102, 126, 234, 0.3)';
    ctx.lineWidth = 2;
    roundRect(ctx, cardX + innerPadding, summaryY, screenshotWidth, summaryHeight, 16);
    ctx.stroke();

    // 摘要图标和标题
    ctx.fillStyle = '#667eea';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('✨ AI 智能摘要', cardX + innerPadding + 20, summaryY + 32);

    // 摘要内容
    ctx.fillStyle = '#374151';
    ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const summaryText = collectedData.summary || '暂无摘要';
    wrapText(ctx, summaryText, cardX + innerPadding + 20, summaryY + 60, screenshotWidth - 40, 24, 8);

    // ========== 底部信息 ==========
    const footerY = cardY + cardInnerHeight - 50;

    // 分隔线
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + innerPadding, footerY - 16);
    ctx.lineTo(cardX + cardInnerWidth - innerPadding, footerY - 16);
    ctx.stroke();

    // 时间
    ctx.fillStyle = '#9ca3af';
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const timestamp = new Date(collectedData.timestamp).toLocaleString('zh-CN');
    ctx.fillText('🕐 ' + timestamp, cardX + innerPadding, footerY + 8);

    // 扫码提示
    ctx.textAlign = 'right';
    ctx.fillText('长按保存 · 分享给朋友', cardX + cardInnerWidth - innerPadding, footerY + 8);
    ctx.textAlign = 'left';

    // 将canvas转换为图片
    const cardDataUrl = canvas.toDataURL('image/png', 0.95);
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

// 辅助函数：将文本换行并返回行数组
function wrapTextToLines(ctx, text, maxWidth, maxLines) {
  if (!text) return [''];

  const chars = text.split('');
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < chars.length; i++) {
    const testLine = currentLine + chars[i];
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine !== '') {
      lines.push(currentLine);
      currentLine = chars[i];

      if (lines.length >= maxLines) {
        // 截断最后一行
        if (i < chars.length - 1) {
          lines[lines.length - 1] = truncateText(ctx, lines[lines.length - 1], maxWidth - 30) ;
        }
        break;
      }
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines;
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
