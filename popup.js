let collectedData = null;
let categoriesList = []; // 存储从数据库加载的分类列表

// 隐藏popup加载动画
function hidePopupLoading() {
  const loadingEl = document.getElementById('popupLoading');
  if (loadingEl) {
    loadingEl.classList.add('fade-out');
    setTimeout(() => {
      loadingEl.style.display = 'none';
    }, 300);
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 加载主题
  const settings = await chrome.storage.sync.get({ theme: 'default' });
  if (settings.theme !== 'default') {
    document.body.className = `theme-${settings.theme}`;
  }

  // 安全地绑定事件监听器
  const bindClick = (id, fn) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', fn);
    } else {
      console.warn(`未找到元素 ID: ${id}`);
    }
  };

  bindClick('settingsLink', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  bindClick('collectBtn', collectPageInfo);
  bindClick('sendDataBtn', sendDataToAPI);
  bindClick('generateCardBtn', generateShareCard);
  bindClick('downloadCardBtn', downloadCard);
  bindClick('copyCardBtn', copyCardToClipboard);

  // 社交媒体分享
  const shareButtons = {
    'shareTwitterBtn': 'twitter',
    'shareWeiboBtn': 'weibo',
    'shareWechatBtn': 'wechat',
    'shareFacebookBtn': 'facebook',
    'shareLinkedinBtn': 'linkedin'
  };

  for (const [id, platform] of Object.entries(shareButtons)) {
    bindClick(id, () => shareToSocialMedia(platform));
  }

  bindClick('shareCopyLinkBtn', copyShareLink);

  // 收藏功能
  bindClick('bookmarkBtn', saveBookmark);

  // 分类修改功能
  bindClick('editCategoryBtn', openCategoryModal);
  bindClick('pageCategory', openCategoryModal);
  bindClick('closeCategoryModal', closeCategoryModal);

  // 添加新分类功能
  bindClick('closeAddCategoryModal', closeAddCategoryModal);
  bindClick('cancelAddCategory', closeAddCategoryModal);
  bindClick('confirmAddCategory', confirmAddCategory);

  // 查看收藏
  bindClick('bookmarksLink', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('bookmarks.html') });
  });

  // 风格选择器点击事件
  const styleBtns = document.querySelectorAll('.style-btn');
  styleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      styleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 如果已经有预览图了，切换风格时自动重新生成
      if (collectedData && document.getElementById('cardPreviewSection').classList.contains('hidden') === false) {
        generateShareCard();
      }
    });
  });

  // 监听后台消息（流式更新、完成、错误、队列状态）
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'streamUpdate' && message.url === currentPageUrl) {
      // 实时更新摘要内容
      const summaryElement = document.getElementById('aiSummary');
      if (summaryElement) {
        summaryElement.innerHTML = parseMarkdown(message.content) + '<span class="streaming-cursor">▊</span>';
        summaryElement.scrollTop = summaryElement.scrollHeight;
      }
      setLoading(true, `AI正在生成... ${message.content.length}字`);
    }
    if (message.action === 'collectionComplete' && message.url === currentPageUrl) {
      // 收集完成
      onCollectionComplete(message.data);
    }
    if (message.action === 'collectionError' && message.url === currentPageUrl) {
      // 收集失败
      onCollectionError(message.error);
    }
    if (message.action === 'queueStatus') {
      // 更新队列状态显示
      updateQueueDisplay(message);
    }
  });

  // 加载分类列表
  await loadCategories();

  // 隐藏加载动画
  hidePopupLoading();

  // 检查是否有保存的状态，否则自动开始收集
  await checkAndRestoreState();
});

// 当前页面URL（用于消息过滤）
let currentPageUrl = '';

// 检查并恢复之前的状态
async function checkAndRestoreState() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      collectPageInfo();
      return;
    }

    currentPageUrl = tab.url;

    // 获取保存的状态
    const response = await chrome.runtime.sendMessage({
      action: 'getPageState',
      url: tab.url
    });

    // 检查队列位置
    if (response.success && response.queuePosition) {
      const qp = response.queuePosition;
      if (qp.isProcessing) {
        setLoading(true, 'AI正在生成...');
      } else {
        setLoading(true, `队列中等待 (${qp.position}/${qp.total})`);
      }
      // 显示pageInfo如果有的话
      if (response.state?.pageInfo) {
        displayPageInfo(response.state.pageInfo);
      }
      document.getElementById('summaryCard').classList.remove('hidden');
      const summaryElement = document.getElementById('aiSummary');
      if (summaryElement) {
        if (response.state?.streamingContent) {
          summaryElement.innerHTML = parseMarkdown(response.state.streamingContent) + '<span class="streaming-cursor">▊</span>';
        } else {
          summaryElement.innerHTML = '<span class="streaming-cursor">▊</span>';
        }
      }
      return;
    }

    if (response.success && response.state) {
      const state = response.state;
      const age = Date.now() - state.timestamp;
      const maxAge = 30 * 60 * 1000; // 30分钟过期

      if (age < maxAge) {
        if (state.status === 'done' && state.data) {
          // 已完成，直接显示
          onCollectionComplete(state.data);
          return;
        }
        if (state.status === 'loading') {
          // 正在加载中，显示流式内容
          setLoading(true, 'AI正在后台生成...');
          document.getElementById('summaryCard').classList.remove('hidden');
          const summaryElement = document.getElementById('aiSummary');
          if (summaryElement && state.streamingContent) {
            summaryElement.innerHTML = parseMarkdown(state.streamingContent) + '<span class="streaming-cursor">▊</span>';
          }
          // 显示pageInfo
          if (state.pageInfo) {
            displayPageInfo(state.pageInfo);
          }
          return;
        }
        if (state.status === 'error') {
          // 之前出错了，允许重新收集
          showStatus(`上次收集失败: ${state.error}`, 'error');
        }
      }
    }

    // 没有有效状态，开始新的收集
    collectPageInfo();

  } catch (error) {
    console.error('[Popup] 检查状态失败:', error);
    collectPageInfo();
  }
}

// 收集完成回调
function onCollectionComplete(data) {
  collectedData = data;
  setLoading(false);

  // 显示页面信息
  if (data.pageInfo) {
    displayPageInfo(data.pageInfo);
  }

  // 显示截图
  if (data.screenshot) {
    displayScreenshot(data.screenshot);
  }

  // 显示摘要
  displaySummary(data.summary, data.category);

  // 提取标签
  const tags = extractTagsFromSummary(data.summary);
  if (collectedData) {
    collectedData.tags = tags;
  }

  // 显示操作区和按钮
  const actionArea = document.getElementById('actionArea');
  if (actionArea) actionArea.classList.remove('hidden');

  const generateCardBtn = document.getElementById('generateCardBtn');
  if (generateCardBtn) generateCardBtn.classList.remove('hidden');

  const shareSection = document.getElementById('shareSection');
  if (shareSection) shareSection.classList.remove('hidden');

  const sendDataBtn = document.getElementById('sendDataBtn');
  if (sendDataBtn) sendDataBtn.classList.remove('hidden');

  const bookmarkBtn = document.getElementById('bookmarkBtn');
  if (bookmarkBtn) bookmarkBtn.classList.remove('hidden');

  document.getElementById('collectArea')?.classList.add('hidden');

  showStatus('✨ 内容分析完成！', 'success');
}

// 收集错误回调
function onCollectionError(errorMessage) {
  setLoading(false);
  showStatus(`收集失败: ${errorMessage}`, 'error');
  document.getElementById('collectArea')?.classList.remove('hidden');
}

// 更新队列显示
function updateQueueDisplay(queueInfo) {
  // 查找当前页面在队列中的位置
  const currentItem = queueInfo.queue?.find(item => item.url === currentPageUrl);

  if (currentItem) {
    if (currentItem.isProcessing) {
      // 正在处理当前页面
      setLoading(true, 'AI正在生成...');
    } else {
      // 在队列中等待
      setLoading(true, `队列中等待 (${currentItem.position}/${queueInfo.total})`);
    }
  }
}

// 显示状态消息
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status-msg ${type} animate-fade-in`;
  statusDiv.classList.remove('hidden');

  if (type !== 'error') {
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 4000);
  }
}

// 显示/隐藏加载状态
function setLoading(isLoading, text = '正在处理...') {
  const loadingDiv = document.getElementById('loading');
  const loadingText = document.getElementById('loadingText');
  const collectArea = document.getElementById('collectArea');

  if (isLoading) {
    loadingDiv.classList.remove('hidden');
    loadingText.textContent = text;
    if (collectArea) collectArea.classList.add('hidden');
  } else {
    loadingDiv.classList.add('hidden');
    // 如果已经收集完成，不显示主按钮，显示操作区
    if (!collectedData) {
      if (collectArea) collectArea.classList.remove('hidden');
    }
  }
}

// 收集网页信息（通过后台执行）
async function collectPageInfo() {
  try {
    setLoading(true, '正在收集网页信息...');
    showStatus('开始收集网页信息...', 'info');

    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      throw new Error('无法获取当前标签页');
    }

    // 检查是否是特殊协议页面
    const url = tab.url || '';
    currentPageUrl = url;
    const specialProtocols = ['chrome://', 'edge://', 'about:', 'chrome-extension://', 'moz-extension://'];
    const isSpecialPage = specialProtocols.some(protocol => url.startsWith(protocol));

    if (isSpecialPage) {
      setLoading(false);
      return;
    }

    // 获取网页信息
    let pageInfo;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
      if (response && response.success && response.data) {
        pageInfo = response.data;
      } else {
        throw new Error('无法获取网页信息');
      }
    } catch (error) {
      // 消息传递失败，尝试注入脚本
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await new Promise(resolve => setTimeout(resolve, 100));
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
        if (response && response.success && response.data) {
          pageInfo = response.data;
        } else {
          throw new Error('无法获取网页信息');
        }
      } catch (injectError) {
        // 使用内联函数作为后备
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: extractPageInfo
        });
        pageInfo = result.result;
      }
    }

    if (!pageInfo) {
      throw new Error('无法提取网页信息');
    }

    // 显示网页基本信息
    displayPageInfo(pageInfo);

    // 准备摘要显示区域
    setLoading(true, '正在连接AI...');
    document.getElementById('summaryCard').classList.remove('hidden');
    const summaryElement = document.getElementById('aiSummary');
    if (summaryElement) {
      summaryElement.innerHTML = '<span class="streaming-cursor">▊</span>';
    }

    // 发送给后台执行（后台会截图+AI生成）
    // 不等待返回，后台会通过消息通知完成
    chrome.runtime.sendMessage({
      action: 'startBackgroundCollection',
      tabId: tab.id,
      pageInfo: pageInfo
    }).catch(err => {
      onCollectionError(err.message);
    });

  } catch (error) {
    setLoading(false);

    const errorMessage = error.message || '';
    const isChromeUrlError = errorMessage.includes('chrome://') ||
      errorMessage.includes('Cannot access');

    if (!isChromeUrlError) {
      showStatus('❌ 错误: ' + error.message, 'error');
    }
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

  // 智能提取主要文本内容
  let bodyText = '';
  // 优先查找主要内容区域
  const mainContent = document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('.main-content') ||
    document.querySelector('.content') ||
    document.querySelector('#content') ||
    document.querySelector('#main') ||
    document.body;

  // 移除不需要的元素
  const clone = mainContent.cloneNode(true);
  const unwantedSelectors = [
    'script', 'style', 'nav', 'header', 'footer', 'aside',
    '.sidebar', '.navigation', '.menu', '.ad', '.advertisement'
  ];

  unwantedSelectors.forEach(selector => {
    const elements = clone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  // 提取文本内容
  bodyText = clone.innerText || clone.textContent || '';
  bodyText = bodyText.replace(/\s+/g, ' ').trim();

  // 如果内容太短，从段落中提取
  if (bodyText.length < 200) {
    const paragraphs = Array.from(clone.querySelectorAll('p'))
      .map(p => p.innerText.trim())
      .filter(t => t.length > 50)
      .slice(0, 10)
      .join(' ');

    if (paragraphs.length > bodyText.length) {
      bodyText = paragraphs;
    }
  }

  // 限制长度，但保留更多内容用于AI分析
  bodyText = bodyText.substring(0, 8000);

  // 获取所有标题
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map(h => ({
      level: h.tagName.toLowerCase(),
      text: h.innerText.trim()
    }))
    .filter(h => h.text.length > 0)
    .slice(0, 20);

  // 获取图片信息
  const images = Array.from(document.querySelectorAll('img'))
    .filter(img => img.width > 50 && img.height > 50)
    .slice(0, 10)
    .map(img => ({
      src: img.src,
      alt: img.alt || '',
      width: img.width,
      height: img.height
    }));

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
    domain: new URL(url).hostname,
    timestamp: new Date().toISOString()
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

// 从摘要中提取分类
function extractCategoryFromSummary(summary, pageInfo = null) {
  const categories = [
    '技术工具', '学习资源', '新闻资讯', '娱乐休闲',
    '商业服务', '设计创意', '生活服务', '其他'
  ];

  // 多种模式匹配分类
  const patterns = [
    /📂\s*分类[：:]\s*([^\n]+)/i,
    /分类[：:]\s*([^\n]+)/i,
    /Category[：:]\s*([^\n]+)/i,
    /\[分类\]\s*([^\n]+)/i,
    /分类\s*[:：]\s*([^\n]+)/i
  ];

  for (const pattern of patterns) {
    const match = summary.match(pattern);
    if (match) {
      const foundCategory = match[1].trim();
      // 移除可能的emoji和特殊字符
      const cleanCategory = foundCategory.replace(/[📂📁📋]/g, '').trim();

      // 检查是否在分类列表中
      for (const cat of categories) {
        if (cleanCategory.includes(cat) || cat.includes(cleanCategory)) {
          return cat;
        }
      }
    }
  }

  // 如果AI没有明确返回分类，基于页面内容智能分类
  if (pageInfo) {
    const contentCategory = classifyByContent(pageInfo);
    return contentCategory;
  }

  // 最后尝试从摘要文本中提取关键词
  const keywordCategory = classifyByKeywords(summary);
  return keywordCategory;
}

// 从摘要中提取标签
function extractTagsFromSummary(summary) {
  if (!summary) return [];
  const tags = [];
  // 匹配 #标签 或 【标签】
  const found = summary.match(/[#＃]([^\s#＃]+)|【([^】]+)】/g);
  if (found) {
    found.forEach(t => {
      const cleanTag = t.replace(/[#＃【】]/g, '').trim();
      // 过滤长度限制，与 bookmarks.js 保持一致
      if (cleanTag.length > 1 && cleanTag.length < 10) {
        if (!tags.includes(cleanTag)) {
          tags.push(cleanTag);
        }
      }
    });
  }
  return tags;
}

// 基于页面内容智能分类
function classifyByContent(pageInfo) {
  const title = (pageInfo.title || '').toLowerCase();
  const description = (pageInfo.description || '').toLowerCase();
  const bodyText = (pageInfo.bodyText || '').toLowerCase();
  const domain = (pageInfo.domain || '').toLowerCase();
  const url = (pageInfo.url || '').toLowerCase();

  const allText = `${title} ${description} ${bodyText.substring(0, 1000)} ${domain} ${url}`;

  // 技术工具关键词
  const techKeywords = ['技术', '工具', '开发', '编程', '代码', 'api', 'sdk', 'framework', 'library',
    'github', 'stackoverflow', 'developer', 'software', 'app', 'application', 'platform',
    'tech', 'code', 'programming', 'dev', 'engineer', 'algorithm'];

  // 学习资源关键词
  const learningKeywords = ['学习', '教育', '课程', '教程', '培训', '知识', '教学', 'study',
    'learn', 'course', 'tutorial', 'education', 'school', 'university', 'academy',
    'mooc', 'online course', 'lesson', 'class'];

  // 新闻资讯关键词
  const newsKeywords = ['新闻', '资讯', '报道', '消息', '时事', 'news', 'article', 'report',
    'media', 'journalism', 'press', 'breaking', 'update', 'latest'];

  // 娱乐休闲关键词
  const entertainmentKeywords = ['娱乐', '游戏', '视频', '音乐', '电影', '电视剧', '综艺',
    'entertainment', 'game', 'video', 'music', 'movie', 'tv', 'show', 'fun', 'play',
    'streaming', 'youtube', 'netflix'];

  // 商业服务关键词
  const businessKeywords = ['商业', '服务', '企业', '公司', '商务', 'business', 'service',
    'company', 'enterprise', 'corporate', 'commerce', 'trade', 'market', 'sales'];

  // 设计创意关键词
  const designKeywords = ['设计', '创意', '艺术', '美术', '视觉', 'design', 'creative',
    'art', 'graphic', 'visual', 'ui', 'ux', 'illustration', 'drawing', 'portfolio'];

  // 生活服务关键词
  const lifeKeywords = ['生活', '购物', '美食', '旅游', '健康', '医疗', '房产', '汽车',
    'life', 'shopping', 'food', 'restaurant', 'travel', 'health', 'medical', 'real estate'];

  // 计算每个分类的匹配分数
  const scores = {
    '技术工具': countMatches(allText, techKeywords),
    '学习资源': countMatches(allText, learningKeywords),
    '新闻资讯': countMatches(allText, newsKeywords),
    '娱乐休闲': countMatches(allText, entertainmentKeywords),
    '商业服务': countMatches(allText, businessKeywords),
    '设计创意': countMatches(allText, designKeywords),
    '生活服务': countMatches(allText, lifeKeywords)
  };

  // 找到得分最高的分类
  let maxScore = 0;
  let bestCategory = '其他';

  for (const [category, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  // 如果最高分太低，返回"其他"
  return maxScore > 0 ? bestCategory : '其他';
}

// 计算关键词匹配次数
function countMatches(text, keywords) {
  let count = 0;
  for (const keyword of keywords) {
    const regex = new RegExp(keyword, 'gi');
    const matches = text.match(regex);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

// 基于关键词分类（备用方法）
function classifyByKeywords(summary) {
  const lowerSummary = summary.toLowerCase();

  // 使用更精确的关键词匹配
  if (/(技术|工具|开发|编程|代码|api|sdk|framework|library|github|developer|software|app|platform)/i.test(lowerSummary)) {
    return '技术工具';
  } else if (/(学习|教育|课程|教程|培训|知识|教学|study|learn|course|tutorial|education|school|university)/i.test(lowerSummary)) {
    return '学习资源';
  } else if (/(新闻|资讯|报道|消息|时事|news|article|report|media|journalism)/i.test(lowerSummary)) {
    return '新闻资讯';
  } else if (/(娱乐|游戏|视频|音乐|电影|电视剧|entertainment|game|video|music|movie|tv|show|fun|play|streaming)/i.test(lowerSummary)) {
    return '娱乐休闲';
  } else if (/(商业|服务|企业|公司|商务|business|service|company|enterprise|corporate|commerce)/i.test(lowerSummary)) {
    return '商业服务';
  } else if (/(设计|创意|艺术|美术|视觉|design|creative|art|graphic|visual|ui|ux|illustration)/i.test(lowerSummary)) {
    return '设计创意';
  } else if (/(生活|购物|美食|旅游|健康|医疗|房产|汽车|life|shopping|food|restaurant|travel|health|medical)/i.test(lowerSummary)) {
    return '生活服务';
  }

  return '其他';
}

// 显示摘要和分类
function displaySummary(summary, category = '其他') {
  const summaryElement = document.getElementById('aiSummary');
  if (summaryElement) {
    summaryElement.innerHTML = parseMarkdown(summary);
  }
  document.getElementById('summaryCard').classList.remove('hidden');

  // 显示分类
  const categoryElement = document.getElementById('pageCategory');
  if (categoryElement) {
    categoryElement.textContent = category;
  }
}

// 简单的 Markdown 解析器
function parseMarkdown(text) {
  if (!text) return '';

  // 1. 基础转义
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. 处理标题 (### 到 #)
  html = html.replace(/^### (.*$)/gm, '<h4 class="md-h3">$1</h4>');
  html = html.replace(/^## (.*$)/gm, '<h3 class="md-h2">$1</h3>');
  html = html.replace(/^# (.*$)/gm, '<h2 class="md-h1">$1</h2>');

  // 3. 粗体
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 4. 列表项
  // 无序列表 (处理 - 或 * 或 •)
  html = html.replace(/^[ \t]*[*-•][ \t]+(.*$)/gm, '<div class="md-list-item"><span class="md-bullet">•</span><span class="md-list-content">$1</span></div>');
  // 有序列表 (处理 1. 2.)
  html = html.replace(/^[ \t]*(\d+)\.[ \t]+(.*$)/gm, '<div class="md-list-item"><span class="md-bullet">$1.</span><span class="md-list-content">$2</span></div>');

  // 5. 段落和换行
  const paragraphs = html.split(/\n\s*\n/);
  html = paragraphs.map(p => {
    const trimmed = p.trim();
    if (trimmed.startsWith('<h') || trimmed.startsWith('<div')) return p;
    if (!trimmed) return '';
    return `<p class="md-p">${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  // 6. 链接
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="md-link">$1</a>');

  return html;
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

// 风格提示词配置（精简版，加快响应）
const STYLE_PROMPTS = {
  social: {
    'zh-CN': `为网页写分享文案，格式：
🎯 一句话总结
用一句吸引人的话概括这个网站/页面是什么，能解决什么问题

📝 详细介绍（150-200字）
- 这是什么：详细说明网站/工具/文章的性质和用途
- 核心价值：它能为用户带来什么好处
- 特色亮点：与同类产品/内容相比有什么独特之处
- 适合人群：谁最需要这个

✨ 核心亮点
• 亮点1：具体描述（带emoji）
• 亮点2：具体描述（带emoji）
• 亮点3：具体描述（带emoji）
• 亮点4：具体描述（带emoji）

💡 使用建议
给出1-2条实用的使用建议或小技巧

🏷️ 标签
#标签1 #标签2 #标签3 #标签4 #标签5

【写作要求】
- 语气热情真诚，像朋友推荐好东西
- 内容要具体，不要泛泛而谈
- 突出实用价值和独特卖点
- 适当使用emoji增加可读性`,
    'en': `You are a top social media content creator and website reviewer. Create an engaging share post for this webpage.

【Output Format】

🎯 One-Line Summary
A catchy sentence about what this is and what problem it solves

📝 Detailed Introduction (150-200 words)
- What it is: Explain the nature and purpose
- Core value: Benefits for users
- Unique features: What makes it stand out
- Target audience: Who needs this most

✨ Key Highlights
• Highlight 1: Specific description (with emoji)
• Highlight 2: Specific description (with emoji)
• Highlight 3: Specific description (with emoji)
• Highlight 4: Specific description (with emoji)

💡 Pro Tips
1-2 practical usage tips

🏷️ Tags
#tag1 #tag2 #tag3 #tag4 #tag5

【Requirements】
- Be enthusiastic and authentic
- Be specific, not generic
- Highlight practical value
- Use emojis for readability`,
    'default': `Create comprehensive social media content with summary, detailed intro, highlights, tips, and tags.`
  },
  professional: {
    'zh-CN': `请用专业、正式的语气为这个网页生成详细摘要。

【输出格式】

📋 概述
2-3句话概括网站/内容的核心定位

📖 详细介绍（200字左右）
客观描述主要功能、内容和特点

🎯 核心功能/内容
• 功能1：说明
• 功能2：说明
• 功能3：说明

👥 适用场景
说明适合什么人群、什么场景使用

⚖️ 优劣分析
优势：...
不足：...

保持客观中立，基于事实描述。`,
    'en': `Generate a professional, detailed summary with overview, features, use cases, and pros/cons analysis.`,
    'default': `Generate a professional summary with structured sections.`
  },
  casual: {
    'zh-CN': `用轻松活泼的语气介绍这个网页，就像跟好朋友安利一样！

【输出格式】

😍 开场白
用口语化的方式说说你发现了什么好东西

💬 聊聊这是啥（100-150字）
用大白话解释这个网站/内容是干嘛的，好在哪里

🌟 我觉得最棒的几点
• 第一点（配个emoji）
• 第二点（配个emoji）
• 第三点（配个emoji）

🤔 小提醒
说说使用时需要注意的或者小技巧

👋 结尾
一句俏皮话收尾，鼓励朋友去看看

可以用网络流行语、颜文字，语气要自然亲切！`,
    'en': `Introduce this in a fun, casual way like recommending to a friend. Use casual language, emojis, and a friendly tone.`,
    'default': `Create a fun, casual summary with friendly tone.`
  },
  brief: {
    'zh-CN': `极简：⚡ 一句话 + 📌 3个要点 + 🏷️ 关键词（共50字内）`,
    'en': `Brief: 1 sentence + 3 points + keywords (under 50 words)`,
    'default': `Ultra-brief summary`
  }
};

// 构建AI提示词（精简版，加快响应速度）
function buildSocialPrompt(pageInfo, language, style) {
  const lang = language || 'zh-CN';
  const styleKey = style || 'social';

  // 获取风格提示
  const stylePrompt = STYLE_PROMPTS[styleKey]?.[lang] ||
    STYLE_PROMPTS[styleKey]?.['default'] ||
    STYLE_PROMPTS.social['zh-CN'];

  // 精简：正文限制800字，大幅加快响应
  const bodyText = pageInfo.bodyText?.substring(0, 800) || '';
  const desc = pageInfo.description?.substring(0, 200) || '';

  // 语言前缀
  const langPrefix = lang === 'zh-CN' ? '请用简体中文回复。' :
    lang === 'zh-TW' ? '請用繁體中文回覆。' :
      `Reply in ${LANGUAGE_CONFIG[lang]?.name || 'English'}.`;

  return `${langPrefix}

${stylePrompt}

【网页信息】
标题: ${pageInfo.title || '无标题'}
描述: ${desc}
正文: ${bodyText}

分类选项：技术工具、学习资源、新闻资讯、娱乐休闲、商业服务、设计创意、生活服务、其他
请在末尾标注"📂 分类：[分类名]"`;
}

// 使用AI生成摘要（流式响应版本）
async function generateAISummary(pageInfo, onChunk = null) {
  try {
    const startTime = Date.now();

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

    // 创建超时控制器
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 60000); // 流式请求给60秒超时

    try {
      let response;
      const useStream = !!onChunk; // 有回调函数时使用流式

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
            max_tokens: 600,
            stream: useStream,
            messages: [{
              role: 'user',
              content: prompt
            }]
          }),
          signal: controller.signal
        });
      } else {
        // OpenAI API格式
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
            max_tokens: 600,
            stream: useStream
          }),
          signal: controller.signal
        });
      }

      if (!response.ok) {
        clearTimeout(timeoutId);
        const errorText = await response.text();
        let errorData;
        try {
          errorData = safeParseJSON(errorText);
        } catch {
          throw new Error(`AI API错误: ${response.statusText} - ${errorText.substring(0, 100)}`);
        }
        throw new Error(`AI API错误: ${errorData.error?.message || response.statusText}`);
      }

      // 流式响应处理
      if (useStream) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留最后一个不完整的行

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

            // 处理 SSE 格式
            if (trimmedLine.startsWith('data: ')) {
              try {
                const jsonStr = trimmedLine.slice(6);
                if (!jsonStr || jsonStr === '[DONE]') continue;

                const data = JSON.parse(jsonStr);
                let chunk = '';

                if (settings.aiProvider === 'anthropic') {
                  // Anthropic 流式格式
                  if (data.type === 'content_block_delta' && data.delta?.text) {
                    chunk = data.delta.text;
                  }
                } else {
                  // OpenAI 流式格式
                  if (data.choices?.[0]?.delta?.content) {
                    chunk = data.choices[0].delta.content;
                  }
                }

                if (chunk) {
                  fullContent += chunk;
                  onChunk(fullContent, chunk);
                }
              } catch (e) {
                // 忽略解析错误，继续处理下一行
                console.debug('[AI] 跳过无法解析的行:', trimmedLine.substring(0, 50));
              }
            }
            // 处理 Anthropic 的 event 格式
            else if (trimmedLine.startsWith('event: ')) {
              // 事件类型行，跳过
              continue;
            }
          }
        }

        clearTimeout(timeoutId);
        const totalTime = Date.now() - startTime;
        return fullContent;

      } else {
        // 非流式响应处理（保持原有逻辑）
        clearTimeout(timeoutId);
        const responseText = await response.text();

        if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
          throw new Error('API URL 错误：返回的是网页而不是 API 响应。请检查 API URL 配置是否正确。');
        }

        const data = safeParseJSON(responseText);

        if (settings.aiProvider === 'anthropic') {
          if (!data.content || !data.content[0] || !data.content[0].text) {
            throw new Error('AI响应格式异常');
          }
          return data.content[0].text;
        }

        // OpenAI 格式解析
        let content = null;
        if (data.choices && data.choices[0]?.message?.content) {
          content = data.choices[0].message.content;
        } else if (data.choices && data.choices[0]?.text) {
          content = data.choices[0].text;
        } else if (data.content) {
          content = typeof data.content === 'string' ? data.content : data.content[0]?.text;
        } else if (data.text) {
          content = data.text;
        } else if (data.message) {
          content = typeof data.message === 'string' ? data.message : data.message.content;
        } else if (data.result) {
          content = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
        } else if (data.response) {
          content = typeof data.response === 'string' ? data.response : JSON.stringify(data.response);
        } else if (data.output) {
          content = typeof data.output === 'string' ? data.output : JSON.stringify(data.output);
        }

        if (!content) {
          throw new Error('AI响应格式不支持，请检查API返回格式');
        }

        return content;
      }

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('AI请求超时，请检查网络连接或API配置');
      }
      throw fetchError;
    }

  } catch (error) {
    throw error;
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

    setLoading(false);
    showStatus('✅ 数据发送成功！', 'success');

  } catch (error) {
    setLoading(false);
    showStatus('❌ 发送失败: ' + error.message, 'error');
  }
}

// Canvas 字体常量 - 用于替代 CSS 变量（Canvas API 不支持 CSS 变量）
const CANVAS_FONTS = {
  main: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: '"Noto Serif SC", "Songti SC", serif',
  tech: '"Space Grotesk", "SF Mono", monospace'
};

// 预加载字体 - 确保 Canvas 渲染前字体已加载
async function preloadFonts() {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  // 短暂延迟确保字体完全就绪
  await new Promise(resolve => setTimeout(resolve, 100));
}

// 生成分享卡片 - HTML/CSS 版本
async function generateShareCard() {
  if (!collectedData) {
    showStatus('请先收集网页信息', 'error');
    return;
  }

  try {
    // 显示风格选择区
    const styleSelectorArea = document.getElementById('styleSelectorArea');
    if (styleSelectorArea) {
      styleSelectorArea.classList.remove('hidden');
    }

    setLoading(true, '正在生成精美卡片...');

    // 预加载字体
    await preloadFonts();

    // 获取当前选中的风格
    const activeStyleBtn = document.querySelector('.style-btn.active');
    const style = activeStyleBtn ? activeStyleBtn.dataset.style : 'modern';

    // 填充 HTML 卡片内容
    const htmlCard = document.getElementById('htmlCard');
    populateCardContent(htmlCard, collectedData, style);

    // 切换卡片样式类
    htmlCard.className = `share-card card-${style}`;

    // 等待图片加载完成
    await waitForCardImages(htmlCard);

    // 使用 html2canvas 将 HTML 转为图片
    const cardCanvas = await html2canvas(htmlCard, {
      width: 1080,
      height: 1350,
      scale: 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false
    });

    // 生成图片预览
    const cardDataUrl = cardCanvas.toDataURL('image/png', 0.9);
    document.getElementById('cardPreviewImg').src = cardDataUrl;
    document.getElementById('cardPreviewSection').classList.remove('hidden');

    // 滚动到预览区域
    document.getElementById('cardPreviewSection').scrollIntoView({ behavior: 'smooth' });

    collectedData.cardDataUrl = cardDataUrl;
    setLoading(false);
    showStatus('✨ 精美卡片已生成！', 'success');

  } catch (error) {
    console.error('生成卡片失败:', error);
    setLoading(false);
    showStatus('❌ 生成失败: ' + error.message, 'error');
  }
}

// 填充卡片内容
function populateCardContent(htmlCard, data, style) {
  const category = data.category || '其他';
  const themeColor = getThemeColor(category);

  // 设置主题颜色 CSS 变量
  htmlCard.style.setProperty('--theme-primary', themeColor.primary);
  htmlCard.style.setProperty('--theme-secondary', themeColor.secondary);

  // 根据不同风格生成不同的 HTML 结构
  switch (style) {
    case 'elegant':
      htmlCard.innerHTML = generateElegantHTML(data, category);
      break;
    case 'retro':
      htmlCard.innerHTML = generateRetroHTML(data, category);
      break;
    case 'cyber':
      htmlCard.innerHTML = generateCyberHTML(data, category);
      break;
    case 'premium':
      htmlCard.innerHTML = generatePremiumHTML(data, category);
      break;
    case 'modern':
    default:
      htmlCard.innerHTML = generateModernHTML(data, category);
      break;
  }
}

// 生成 Modern 风格 HTML
function generateModernHTML(data, category) {
  const title = escapeHtml(data.pageInfo?.title || '无标题');
  const domain = data.pageInfo?.domain || 'unknown.com';
  const summary = escapeHtml(data.summary || '暂无内容').trim();
  const screenshot = data.screenshot || '';
  const dateStr = new Date(data.timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return `
    <div class="card-inner">
      <div class="card-header">
        <div class="card-brand">
          <div class="brand-icon"></div>
          <span class="brand-name">Web Collector</span>
        </div>
        <span class="card-category-tag">${escapeHtml(category)}</span>
      </div>

      ${screenshot ? `
      <div class="card-screenshot">
        <div class="browser-dots">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
        </div>
        <img class="screenshot-img" src="${screenshot}" alt="Screenshot">
      </div>
      ` : ''}

      <h1 class="card-title">${title}</h1>
      <div class="card-domain">🔗 ${escapeHtml(domain)}</div>

      <div class="card-summary">
        <div class="summary-line"></div>
        <div class="summary-text">${summary}</div>
      </div>

      <div class="card-footer">
        <span class="card-date">${dateStr} • Web Collector AI</span>
        <span class="card-cta">长按识别精彩内容</span>
      </div>
    </div>
  `;
}

// 生成 Elegant 风格 HTML
function generateElegantHTML(data, category) {
  const title = escapeHtml(data.pageInfo?.title || '无标题');
  const domain = data.pageInfo?.domain || 'unknown.com';
  const summary = escapeHtml(data.summary || '暂无内容').trim();
  const screenshot = data.screenshot || '';
  const year = new Date().getFullYear();

  return `
    <div class="card-inner">
      <div class="card-inner-inner">
        <h1 class="card-title">${title}</h1>
        <div class="card-meta">${escapeHtml(category)} / SOURCE: ${escapeHtml(domain)}</div>
        <div class="card-divider"></div>
        <div class="summary-text">${summary}</div>

        ${screenshot ? `
        <div class="card-screenshot">
          <img class="screenshot-img" src="${screenshot}" alt="Screenshot">
        </div>
        ` : ''}

        <div class="card-footer">
          <span>COLLECTED BY WEB COLLECTOR</span>
          <span>${year} • ALL RIGHTS RESERVED</span>
        </div>
      </div>
    </div>
  `;
}

// 生成 Retro 风格 HTML
function generateRetroHTML(data, category) {
  const title = escapeHtml(data.pageInfo?.title || '无标题');
  const domain = data.pageInfo?.domain || 'unknown.com';
  const summary = escapeHtml(data.summary || '暂无内容').trim();
  const screenshot = data.screenshot || '';
  const dateStr = new Date(data.timestamp).toLocaleDateString();

  return `
    <div class="card-inner">
      <div class="stamp">${escapeHtml(category.substring(0, 4))}</div>

      <h1 class="card-title">${title}</h1>
      <div class="card-meta">Date: ${dateStr} / Source: ${escapeHtml(domain)}</div>

      <div class="summary-container">
        <div class="summary-line-bg"></div>
        <div class="summary-text">${summary}</div>
      </div>

      ${screenshot ? `
      <div class="card-screenshot">
        <img class="screenshot-img" src="${screenshot}" alt="Screenshot">
      </div>
      ` : ''}
    </div>
  `;
}

// 生成 Cyber 风格 HTML
function generateCyberHTML(data, category) {
  const title = escapeHtml(data.pageInfo?.title || 'SYSTEM ERROR').toUpperCase();
  const domain = data.pageInfo?.domain || 'unknown.com';
  const summary = escapeHtml(data.summary || 'NO_DATA').trim();
  const screenshot = data.screenshot || '';
  const timestamp = Date.now();

  return `
    <div class="card-inner">
      <div class="cyber-border"></div>
      <div class="corner-tl"></div>
      <div class="corner-br"></div>

      <h1 class="card-title">${title}</h1>
      <div class="card-status">[STATUS: ANALYSIS_COMPLETE] // CATEGORY: ${escapeHtml(category)}</div>

      ${screenshot ? `
      <div class="card-screenshot">
        <img class="screenshot-img" src="${screenshot}" alt="Screenshot">
        <div class="scanlines"></div>
      </div>
      ` : ''}

      <div class="summary-text">> ${summary}</div>

      <div class="card-footer">
        <span>ID: ${timestamp} // LOC: ${escapeHtml(domain)}</span>
        <span>DECODING... 100%</span>
      </div>
    </div>
  `;
}

// 生成 Premium 风格 HTML
function generatePremiumHTML(data, category) {
  const title = escapeHtml(data.pageInfo?.title || '无标题');
  const domain = data.pageInfo?.domain || 'unknown.com';
  const summary = escapeHtml(data.summary || '暂无内容').trim();
  const screenshot = data.screenshot || '';
  const dateStr = new Date(data.timestamp).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return `
    <div class="premium-bg-accent"></div>
    <div class="card-inner">
      <div class="card-header">
        <div class="brand-box">
          <div class="brand-icon"></div>
          <span class="brand-text">Web Collector</span>
        </div>
        <div class="date-badge">${dateStr}</div>
      </div>

      <div class="main-content">
        <div class="category-pill">${escapeHtml(category)}</div>
        <h1 class="card-title">${title}</h1>
        <div class="card-domain">${escapeHtml(domain)}</div>

        ${screenshot ? `
        <div class="visual-container">
          <div class="screenshot-wrapper">
            <img class="screenshot-img" src="${screenshot}" alt="Screenshot">
          </div>
        </div>
        ` : ''}

        <div class="summary-box">
          <div class="summary-text">${summary}</div>
        </div>
      </div>

      <div class="card-footer">
        <div class="footer-info">
          <span class="footer-label">Curated by</span>
          <span class="footer-value">AI Assistant</span>
        </div>
        <div class="qr-placeholder">QR CODE</div>
      </div>
    </div>
  `;
}

// 辅助函数：等待卡片内图片加载
function waitForCardImages(container) {
  const images = container.querySelectorAll('img');
  const promises = Array.from(images).map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve; // 即使失败也继续
    });
  });
  return Promise.all(promises);
}

// 辅助函数：HTML 转义
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- 风格 1: 现代玻璃 (Modern Glass) ---
async function drawModernCard(ctx, data, config) {
  const { width, height, margin, innerPadding, themeColor } = config;

  // 1. 绘制背景 - 极光渐变
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#0f172a');
  bgGradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // 添加多层弥散光晕
  drawCircleGlow(ctx, width * 0.8, height * 0.2, 800, themeColor.primary + '25');
  drawCircleGlow(ctx, width * 0.2, height * 0.8, 600, themeColor.secondary + '15');
  drawCircleGlow(ctx, width * 0.5, height * 0.5, 400, '#ffffff05');

  // 添加颗粒感纹理
  drawNoise(ctx, width, height, 0.02);

  // 2. 绘制主卡片容器
  const cardX = margin;
  const cardY = margin;
  const cardW = width - margin * 2;
  const cardH = height - margin * 2;
  const radius = 40;

  // 容器阴影
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;

  // 玻璃主体
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  roundRect(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // 容器内边框 - 渐变边框效果
  const borderGradient = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
  borderGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
  borderGradient.addColorStop(1, 'rgba(255, 255, 255, 0.2)');
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 2;
  roundRect(ctx, cardX, cardY, cardW, cardH, radius);
  ctx.stroke();

  // 3. 顶部区域
  const topY = cardY + innerPadding;

  // 品牌 & 图标
  ctx.fillStyle = themeColor.primary;
  ctx.beginPath();
  ctx.arc(cardX + innerPadding + 18, topY + 12, 18, 0, Math.PI * 2); // 图标稍微增大
  ctx.fill();

  ctx.fillStyle = '#1e293b';
  ctx.font = `bold 28px ${CANVAS_FONTS.main}`;
  ctx.fillText('Web Collector', cardX + innerPadding + 50, topY + 24);

  // 分类标签
  const tagText = data.category.toUpperCase();
  ctx.font = `600 18px ${CANVAS_FONTS.main}`;
  const tagW = ctx.measureText(tagText).width + 50;
  ctx.fillStyle = themeColor.primary + '15';
  roundRect(ctx, cardX + cardW - innerPadding - tagW, topY - 10, tagW, 45, 22);
  ctx.fill();
  ctx.fillStyle = themeColor.primary;
  ctx.fillText(tagText, cardX + cardW - innerPadding - tagW + 25, topY + 20);

  // 4. 截图区域 - 缩小以容纳更多摘要内容
  const screenshotY = topY + 60;
  const screenshotW = cardW - innerPadding * 2;
  const screenshotH = 220; // 缩小截图区域

  if (data.screenshot) {
    try {
      const img = await loadImage(data.screenshot);
      ctx.save();

      // 浏览器窗口装饰
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 15;
      ctx.fillStyle = '#f8fafc';
      roundRect(ctx, cardX + innerPadding, screenshotY, screenshotW, screenshotH + 35, 16);
      ctx.fill();
      ctx.shadowColor = 'transparent';

      // 窗口红绿灯
      const dotY = screenshotY + 18;
      const dotX = cardX + innerPadding + 20;
      ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(dotX + i * 18, dotY, 5, 0, Math.PI * 2); ctx.fill();
      });

      // 图片裁剪绘制
      ctx.beginPath();
      ctx.rect(cardX + innerPadding, screenshotY + 35, screenshotW, screenshotH);
      ctx.clip();
      const scale = screenshotW / img.width;
      ctx.drawImage(img, cardX + innerPadding, screenshotY + 35, screenshotW, img.height * scale);
      ctx.restore();
    } catch (e) { }
  }

  // 5. 标题 & 详情
  const titleY = screenshotY + screenshotH + 50;
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold 56px ${CANVAS_FONTS.main}`;
  const titleLines = wrapTextToLines(ctx, data.pageInfo.title || '无标题', cardW - innerPadding * 2, 2);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, cardX + innerPadding, titleY + i * 65);
  });

  const domainY = titleY + (titleLines.length * 65) + 15;
  ctx.fillStyle = themeColor.primary;
  ctx.font = `600 28px ${CANVAS_FONTS.main}`;
  ctx.fillText('🔗 ' + (data.pageInfo.domain || 'unknown.com'), cardX + innerPadding, domainY + 25);

  // 6. 摘要内容 - 增加行数显示更多内容
  const summaryY = domainY + 55;
  ctx.fillStyle = '#475569';
  ctx.font = `500 28px ${CANVAS_FONTS.main}`;
  const summaryText = (data.summary || '暂无内容').trim();
  const lineHeight = 40; // 减小行高
  const actualLines = wrapText(ctx, summaryText, cardX + innerPadding + 35, summaryY + 10, cardW - innerPadding * 2 - 50, lineHeight, 12);

  // 装饰侧线
  if (actualLines > 0) {
    const grad = ctx.createLinearGradient(0, summaryY, 0, summaryY + (actualLines * lineHeight));
    grad.addColorStop(0, themeColor.primary);
    grad.addColorStop(1, themeColor.secondary);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cardX + innerPadding, summaryY);
    ctx.lineTo(cardX + innerPadding, summaryY + (actualLines * lineHeight) - 10);
    ctx.stroke();
  }

  // 7. 底部版权
  const footerY = cardY + cardH - innerPadding;
  ctx.fillStyle = '#94a3b8';
  ctx.font = `500 22px ${CANVAS_FONTS.main}`;
  const dateStr = new Date(data.timestamp).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillText(dateStr + ' • Web Collector AI', cardX + innerPadding, footerY);

  ctx.textAlign = 'right';
  ctx.fillText('长按识别精彩内容', cardX + cardW - innerPadding, footerY);
  ctx.textAlign = 'left';
}

// --- 风格 2: 优雅简约 (Elegant Minimal) ---
async function drawElegantCard(ctx, data, config) {
  const { width, height, margin, innerPadding, themeColor } = config;

  // 1. 象牙白纸张感
  ctx.fillStyle = '#fcfcf9';
  ctx.fillRect(0, 0, width, height);

  // 极细双线边框
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);
  ctx.strokeRect(margin + 10, margin + 10, width - margin * 2 - 20, height - margin * 2 - 20);

  const cardW = width - margin * 2;
  const startX = margin + innerPadding + 20;
  let currentY = margin + innerPadding + 40;

  // 2. 标题 (杂志排版感)
  ctx.fillStyle = '#000000';
  ctx.font = `bold 52px ${CANVAS_FONTS.serif}`;
  const titleLines = wrapTextToLines(ctx, data.pageInfo.title || '无标题', cardW - innerPadding * 2.5, 3);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, startX, currentY + i * 60);
  });
  currentY += (titleLines.length * 60) + 25;

  // 副标题/元信息
  ctx.fillStyle = '#666';
  ctx.font = `italic 20px ${CANVAS_FONTS.serif}`;
  ctx.fillText(`${data.category} / SOURCE: ${data.pageInfo.domain}`, startX, currentY);
  currentY += 50;

  // 3. 装饰分割
  ctx.fillStyle = '#000';
  ctx.fillRect(startX, currentY, 150, 2);
  currentY += 60;

  // 4. 摘要 - 增加行数显示更多内容
  ctx.fillStyle = '#222';
  ctx.font = `500 24px ${CANVAS_FONTS.serif}`;
  const summaryText = (data.summary || '暂无内容').trim();
  const summaryLines = wrapText(ctx, summaryText, startX, currentY, cardW - innerPadding * 2 - 40, 36, 12);
  currentY += (summaryLines * 36) + 60;

  // 5. 截图 (嵌入式极简边框)
  if (data.screenshot) {
    try {
      const img = await loadImage(data.screenshot);
      const imgW = cardW - innerPadding * 2 - 40;
      const imgH = 280; // 缩小截图区域

      // 给图片加一个精致的阴影和边框
      ctx.shadowColor = 'rgba(0,0,0,0.05)';
      ctx.shadowBlur = 20;
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, startX, currentY, imgW, imgH, 2);
      ctx.clip();
      const scale = imgW / img.width;
      ctx.drawImage(img, startX, currentY, imgW, img.height * scale);
      ctx.restore();
      ctx.shadowColor = 'transparent';

      ctx.strokeStyle = '#eee';
      ctx.strokeRect(startX, currentY, imgW, imgH);
    } catch (e) { }
  }

  // 6. 底部
  const footerY = height - margin - innerPadding;
  ctx.fillStyle = '#000';
  ctx.font = `bold 18px ${CANVAS_FONTS.tech}`;
  ctx.fillText('COLLECTED BY WEB COLLECTOR', startX, footerY);

  ctx.textAlign = 'right';
  ctx.font = `500 16px ${CANVAS_FONTS.tech}`;
  ctx.fillText(new Date().getFullYear() + ' • ALL RIGHTS RESERVED', width - margin - innerPadding - 20, footerY);
  ctx.textAlign = 'left';
}

// --- 风格 3: 复古信笺 (Retro Paper) ---
async function drawRetroCard(ctx, data, config) {
  const { width, height, margin, innerPadding } = config;

  // 1. 真实纸张质感背景
  ctx.fillStyle = '#f4ede1';
  ctx.fillRect(0, 0, width, height);

  // 模拟纸张纤维纹理
  drawNoise(ctx, width, height, 0.05);

  // 边框装饰 - 锯齿邮票感
  ctx.strokeStyle = '#d4c5b3';
  ctx.lineWidth = 20;
  ctx.setLineDash([30, 15]);
  ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);
  ctx.setLineDash([]);

  const cardW = width - margin * 2;
  const startX = margin + innerPadding + 20;
  let currentY = margin + innerPadding + 50;

  // 2. 右上角精美印章
  drawStamp(ctx, width - margin - 220, margin + 100, data.category);

  // 3. 标题 (复古书法感)
  ctx.fillStyle = '#3a2a1d';
  ctx.font = `bold 46px ${CANVAS_FONTS.serif}`;
  const titleLines = wrapTextToLines(ctx, data.pageInfo.title || '无标题', cardW - innerPadding * 3, 2);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, startX, currentY + i * 55);
  });
  currentY += (titleLines.length * 55) + 30;

  // 4. 日期 & 来源
  ctx.fillStyle = '#8c7a6b';
  ctx.font = `italic 20px ${CANVAS_FONTS.serif}`;
  const infoText = `Date: ${new Date(data.timestamp).toLocaleDateString()} / Source: ${data.pageInfo.domain}`;
  ctx.fillText(infoText, startX, currentY);
  currentY += 60;

  // 5. 摘要 - 记事本横线风格，增加行数
  ctx.fillStyle = '#4a3a2d';
  ctx.font = `500 24px ${CANVAS_FONTS.serif}`;

  const summaryText = (data.summary || '暂无内容').trim();
  const lineHeight = 40;
  const lines = wrapTextToLines(ctx, summaryText, cardW - innerPadding * 2.5, 11);

  lines.forEach((line, i) => {
    const lineY = currentY + i * lineHeight;
    // 绘制褪色的蓝色横线
    ctx.beginPath();
    ctx.moveTo(startX, lineY + 12);
    ctx.lineTo(width - margin - innerPadding - 20, lineY + 12);
    ctx.strokeStyle = 'rgba(100, 150, 200, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 绘制文字
    ctx.fillText(line, startX + 10, lineY);
  });

  // 6. 截图 - 拍立得效果（缩小以容纳更多摘要）
  if (data.screenshot) {
    try {
      const img = await loadImage(data.screenshot);
      const imgW = 380;
      const imgH = 260;
      const imgX = width - margin - innerPadding - imgW - 20;
      const imgY = height - margin - innerPadding - imgH - 60;

      ctx.save();
      ctx.translate(imgX + imgW / 2, imgY + imgH / 2);
      ctx.rotate(0.04);

      // 拍立得白框
      ctx.shadowColor = 'rgba(0,0,0,0.15)';
      ctx.shadowBlur = 25;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = '#fff';
      ctx.fillRect(-imgW / 2 - 15, -imgH / 2 - 15, imgW + 30, imgH + 80);

      // 照片主体
      ctx.beginPath();
      ctx.rect(-imgW / 2, -imgH / 2, imgW, imgH);
      ctx.clip();
      ctx.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH);

      // 给照片加一点怀旧滤镜
      ctx.fillStyle = 'rgba(150, 100, 50, 0.1)';
      ctx.fillRect(-imgW / 2, -imgH / 2, imgW, imgH);

      ctx.restore();
    } catch (e) { }
  }
}

// --- 风格 4: 赛博科技 (Cyber Tech) ---
async function drawCyberCard(ctx, data, config) {
  const { width, height, margin, innerPadding, themeColor } = config;

  // 1. 深度暗色背景
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, width, height);

  // 动态科技网格
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i < width; i += 50) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
  }
  for (let j = 0; j < height; j += 50) {
    ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(width, j); ctx.stroke();
  }

  // 背景装饰圆
  drawCircleGlow(ctx, width, height, 600, '#0ea5e915');
  drawCircleGlow(ctx, 0, 0, 400, '#f43f5e10');

  const cardW = width - margin * 2;
  const startX = margin + innerPadding + 20;
  let currentY = margin + innerPadding + 50;

  // 2. 边框装饰 (数字感)
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(margin + 80, margin);
  ctx.lineTo(width - margin, margin);
  ctx.lineTo(width - margin, height - margin - 80);
  ctx.lineTo(width - margin - 80, height - margin);
  ctx.lineTo(margin, height - margin);
  ctx.lineTo(margin, margin + 80);
  ctx.closePath();
  ctx.stroke();

  // 装饰角标
  ctx.fillStyle = '#0ea5e9';
  ctx.fillRect(margin - 5, margin - 5, 20, 20);
  ctx.fillRect(width - margin - 15, height - margin - 15, 20, 20);

  // 3. 标题 (霓虹发光)
  ctx.shadowColor = '#0ea5e9';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#fff';
  ctx.font = `900 48px ${CANVAS_FONTS.tech}`;
  const titleText = (data.pageInfo.title || 'SYSTEM ERROR').toUpperCase();
  const titleLines = wrapTextToLines(ctx, titleText, cardW - innerPadding * 2.5, 2);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, startX, currentY + i * 55);
  });
  ctx.shadowBlur = 0;
  currentY += (titleLines.length * 55) + 25;

  // 4. 状态栏
  ctx.fillStyle = '#f43f5e';
  ctx.font = `800 18px ${CANVAS_FONTS.tech}`;
  ctx.fillText(`[STATUS: ANALYSIS_COMPLETE] // CATEGORY: ${data.category}`, startX, currentY);
  currentY += 55;

  // 5. 截图 (数字故障艺术感) - 缩小以容纳更多摘要
  if (data.screenshot) {
    try {
      const img = await loadImage(data.screenshot);
      const imgW = cardW - innerPadding * 2 - 40;
      const imgH = 300;

      ctx.save();
      // 扫描线滤镜
      ctx.beginPath();
      roundRect(ctx, startX, currentY, imgW, imgH, 0);
      ctx.clip();

      // 绘制底层
      ctx.filter = 'contrast(1.5) brightness(0.9) hue-rotate(180deg)';
      const scale = imgW / img.width;
      ctx.drawImage(img, startX, currentY, imgW, img.height * scale);

      // 叠加扫描线
      ctx.fillStyle = 'rgba(0, 242, 255, 0.15)';
      for (let i = 0; i < imgH; i += 6) {
        ctx.fillRect(startX, currentY + i, imgW, 2);
      }

      // 边框
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.strokeRect(startX, currentY, imgW, imgH);

      ctx.restore();
      currentY += imgH + 60;
    } catch (e) { }
  }

  // 6. 摘要 (代码风格) - 增加行数显示更多内容
  ctx.fillStyle = '#22c55e';
  ctx.font = `500 22px ${CANVAS_FONTS.tech}`;
  const summaryText = '> ' + (data.summary || 'NO_DATA').replace(/\n/g, ' ').trim();
  wrapText(ctx, summaryText, startX, currentY, cardW - innerPadding * 2.5, 34, 10);

  // 7. 底部元数据
  const footerY = height - margin - 40;
  ctx.fillStyle = 'rgba(14, 165, 233, 0.6)';
  ctx.font = `14px ${CANVAS_FONTS.tech}`;
  ctx.fillText(`ID: ${Date.now()} // LOC: ${data.pageInfo.domain}`, startX, footerY);
  ctx.textAlign = 'right';
  ctx.fillText('DECODING... 100%', width - margin - innerPadding, footerY);
}

// 辅助：绘制杂色/纹理 (用于质感)
function drawNoise(ctx, width, height, opacity) {
  ctx.save();
  ctx.globalAlpha = opacity;
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 2 + 1;
    ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

// 辅助：绘制印章 (用于复古风)
function drawStamp(ctx, x, y, text) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.15);

  const color = 'rgba(180, 40, 40, 0.8)';

  // 外双圆
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(80, 80, 75, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(80, 80, 66, 0, Math.PI * 2); ctx.stroke();

  // 文字环绕 (简单模拟)
  ctx.fillStyle = color;
  ctx.font = 'bold 26px "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.fillText(text.substring(0, 4), 80, 95);

  // 装饰星号
  ctx.font = '28px serif';
  ctx.fillText('★', 80, 55);

  // 斑驳效果
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 50; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * 160, Math.random() * 160, Math.random() * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// 辅助：获取主题颜色
function getThemeColor(category) {
  const themes = {
    '技术工具': { primary: '#6366f1', secondary: '#a855f7' },
    '学习资源': { primary: '#0ea5e9', secondary: '#22c55e' },
    '新闻资讯': { primary: '#f43f5e', secondary: '#fb923c' },
    '娱乐休闲': { primary: '#ec4899', secondary: '#8b5cf6' },
    '商业服务': { primary: '#0f172a', secondary: '#64748b' },
    '设计创意': { primary: '#f59e0b', secondary: '#d946ef' },
    '生活服务': { primary: '#10b981', secondary: '#06b6d4' },
    '其他': { primary: '#6366f1', secondary: '#8b5cf6' }
  };
  return themes[category] || themes['其他'];
}

// 辅助：绘制圆形光晕
function drawCircleGlow(ctx, x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// 辅助函数：将文本换行并返回行数组
function wrapTextToLines(ctx, text, maxWidth, maxLines) {
  if (!text) return [];

  // 支持换行符处理
  const paragraphs = text.split('\n');
  const lines = [];

  for (let p = 0; p < paragraphs.length; p++) {
    const words = paragraphs[p].split('');
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
      const char = words[i];
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine !== '') {
        lines.push(currentLine);
        currentLine = char;

        if (lines.length >= maxLines) {
          // 已经是最后一行了，进行截断处理
          const lastLine = lines[lines.length - 1];
          // 检查是否还有后续文字（当前段落剩余部分或其他段落）
          const hasMore = i < words.length - 1 || p < paragraphs.length - 1;
          if (hasMore) {
            lines[lines.length - 1] = truncateText(ctx, lastLine + char, maxWidth);
          }
          return lines;
        }
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
      if (lines.length >= maxLines) {
        // 如果刚好最后一行结束且还有段落
        if (p < paragraphs.length - 1) {
          lines[lines.length - 1] = truncateText(ctx, lines[lines.length - 1], maxWidth);
        }
        return lines;
      }
    }
  }

  return lines;
}

// 辅助函数：绘制圆角矩形
function roundRect(ctx, x, y, width, height, radius) {
  if (typeof radius === 'number') {
    radius = { tl: radius, tr: radius, br: radius, bl: radius };
  }
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
}

// 辅助函数：加载图片
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 防止跨域问题
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

// 辅助函数：截断文本（使用二分查找提升性能）
function truncateText(ctx, text, maxWidth) {
  if (!text) return '';
  const ellipsis = '...';
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let start = 0;
  let end = text.length;
  let result = '';

  while (start <= end) {
    const mid = Math.floor((start + end) / 2);
    const test = text.slice(0, mid) + ellipsis;
    if (ctx.measureText(test).width <= maxWidth) {
      result = test;
      start = mid + 1;
    } else {
      end = mid - 1;
    }
  }
  return result || ellipsis;
}

// 辅助函数：自动换行绘制文本
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  if (!text) return 0;
  const lines = wrapTextToLines(ctx, text, maxWidth, maxLines);
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + i * lineHeight);
  });
  return lines.length;
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

// 加载分类列表
async function loadCategories() {
  try {
    const result = await chrome.storage.local.get(['categories']);
    if (result.categories && result.categories.length > 0) {
      categoriesList = result.categories;
    } else {
      // 使用默认分类
      categoriesList = [
        { id: 'tech-tools', name: '技术工具', icon: '🔧', children: [] },
        { id: 'learning', name: '学习资源', icon: '📚', children: [] },
        { id: 'news', name: '新闻资讯', icon: '📰', children: [] },
        { id: 'entertainment', name: '娱乐休闲', icon: '🎮', children: [] },
        { id: 'business', name: '商业服务', icon: '💼', children: [] },
        { id: 'design', name: '设计创意', icon: '🎨', children: [] },
        { id: 'lifestyle', name: '生活服务', icon: '🏠', children: [] },
        { id: 'other', name: '其他', icon: '📁', children: [] }
      ];
    }
  } catch (error) {
    categoriesList = [];
  }
}

// 打开分类选择器
async function openCategoryModal() {
  if (!collectedData) {
    showStatus('请先完成内容分析', 'error');
    return;
  }

  // 重新加载最新分类
  await loadCategories();

  const modal = document.getElementById('categoryModal');
  const categoryList = document.getElementById('categoryList');

  // 收集所有分类（包括子分类）
  let allCategories = [];
  categoriesList.forEach(cat => {
    allCategories.push({ name: cat.name, icon: cat.icon || '📁', level: 0 });
    if (cat.children && cat.children.length > 0) {
      cat.children.forEach(child => {
        allCategories.push({ name: child.name, icon: child.icon || '•', level: 1 });
      });
    }
  });

  // 生成分类选项
  let html = allCategories.map(cat => `
    <button class="category-option ${collectedData.category === cat.name ? 'active' : ''}" 
            data-category="${cat.name}"
            style="${cat.level === 1 ? 'padding-left: 8px; font-size: 12px;' : ''}">
      <span class="category-icon">${cat.icon}</span>
      <span>${cat.name}</span>
    </button>
  `).join('');

  // 添加"新建分类"按钮
  html += `
    <button class="category-option category-add-new" id="addNewCategoryBtn" 
            style="border-style: dashed; grid-column: span 2;">
      <span class="category-icon">➕</span>
      <span>添加新分类</span>
    </button>
  `;

  categoryList.innerHTML = html;

  // 绑定点击事件
  categoryList.querySelectorAll('.category-option:not(.category-add-new)').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const newCategory = btn.dataset.category;
      await updateCategory(newCategory);
    });
  });

  // 绑定添加新分类按钮
  const addNewBtn = document.getElementById('addNewCategoryBtn');
  if (addNewBtn) {
    addNewBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openAddCategoryDialog();
    });
  }

  // 显示模态框
  modal.style.display = 'flex';

  // 点击遮罩关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeCategoryModal();
    }
  });
}

// 关闭分类选择器
function closeCategoryModal() {
  const modal = document.getElementById('categoryModal');
  modal.style.display = 'none';
}

// 打开添加新分类对话框
function openAddCategoryDialog() {
  // 关闭分类选择器
  closeCategoryModal();

  // 打开添加分类模态框
  const modal = document.getElementById('addCategoryModal');
  const nameInput = document.getElementById('newCategoryName');
  const iconInput = document.getElementById('newCategoryIcon');

  // 清空输入框
  nameInput.value = '';
  iconInput.value = '📁';

  // 显示模态框
  modal.style.display = 'flex';

  // 聚焦到名称输入框
  setTimeout(() => nameInput.focus(), 100);

  // Enter键提交
  const handleEnter = (e) => {
    if (e.key === 'Enter') {
      confirmAddCategory();
    }
  };

  nameInput.removeEventListener('keypress', handleEnter);
  nameInput.addEventListener('keypress', handleEnter);
  iconInput.removeEventListener('keypress', handleEnter);
  iconInput.addEventListener('keypress', handleEnter);

  // 点击遮罩关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeAddCategoryModal();
    }
  });
}

// 关闭添加新分类对话框
function closeAddCategoryModal() {
  const modal = document.getElementById('addCategoryModal');
  modal.style.display = 'none';
}

// 确认添加新分类
async function confirmAddCategory() {
  const nameInput = document.getElementById('newCategoryName');
  const iconInput = document.getElementById('newCategoryIcon');
  const addBtn = document.getElementById('confirmAddCategoryBtn');
  const cancelBtn = document.getElementById('cancelAddCategoryBtn');

  const name = nameInput.value.trim();
  const icon = iconInput.value.trim() || '📁';

  if (!name) {
    showStatus('⚠️ 请输入分类名称', 'error');
    nameInput.focus();
    return;
  }

  // 显示loading状态
  const originalBtnContent = addBtn.innerHTML;
  addBtn.innerHTML = `<div class="loading-spinner loading-spinner-white"></div> <span>添加中...</span>`;
  addBtn.disabled = true;
  cancelBtn.disabled = true;
  nameInput.disabled = true;
  iconInput.disabled = true;

  try {
    // 添加新分类
    await addNewCategory(name, icon);

    // 恢复按钮状态
    addBtn.innerHTML = originalBtnContent;
    addBtn.disabled = false;
    cancelBtn.disabled = false;
    nameInput.disabled = false;
    iconInput.disabled = false;

    // 成功后关闭模态框
    closeAddCategoryModal();
  } catch (error) {
    // 失败时恢复按钮状态
    addBtn.innerHTML = originalBtnContent;
    addBtn.disabled = false;
    cancelBtn.disabled = false;
    nameInput.disabled = false;
    iconInput.disabled = false;
  }
}

// 添加新分类
async function addNewCategory(name, icon) {
  // 检查是否已存在
  const exists = categoriesList.some(cat => {
    if (cat.name === name) return true;
    if (cat.children) {
      return cat.children.some(child => child.name === name);
    }
    return false;
  });

  if (exists) {
    showStatus('❌ 分类名称已存在', 'error');
    throw new Error('分类名称已存在');
  }

  // 添加新分类
  const newCategory = {
    id: `cat-${Date.now()}`,
    name: name,
    icon: icon,
    children: []
  };

  categoriesList.push(newCategory);

  // 保存到本地存储（快速完成，几乎是瞬间的）
  await chrome.storage.local.set({ categories: categoriesList });

  // 后台异步同步到云端，不阻塞UI
  setTimeout(async () => {
    try {
      await bookmarkManager.init();
      if (bookmarkManager.enabled) {
        await bookmarkManager.saveCategoriesToTurso(categoriesList);
      }
    } catch (syncError) {
      // 云端同步失败不影响本地功能
    }
  }, 0);

  // 自动将当前页面分类设置为新分类
  if (collectedData) {
    collectedData.category = name;
    const categoryElement = document.getElementById('pageCategory');
    if (categoryElement) {
      categoryElement.textContent = name;
      categoryElement.style.animation = 'pulse 0.5s ease';
      setTimeout(() => {
        categoryElement.style.animation = '';
      }, 500);
    }
  }

  showStatus(`✅ 分类"${name}"已添加并应用`, 'success');
}

// 更新分类
async function updateCategory(newCategory) {
  if (!collectedData) return;

  const oldCategory = collectedData.category;
  const categoryList = document.getElementById('categoryList');
  const modal = document.getElementById('categoryModal');

  // 禁用所有按钮并显示loading
  const allButtons = categoryList.querySelectorAll('.category-option');
  allButtons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  });

  // 在选中的按钮上显示loading
  const selectedBtn = Array.from(allButtons).find(btn => btn.dataset.category === newCategory);
  if (selectedBtn) {
    const originalContent = selectedBtn.innerHTML;
    selectedBtn.innerHTML = `
      <div class="loading-spinner" style="border-color: var(--primary); border-top-color: transparent;"></div>
      <span>更新中...</span>
    `;
  }

  // 显示loading状态
  showStatus('⏳ 正在更新分类...', 'info');

  try {
    // 模拟异步操作（如果将来需要保存到服务器）
    await new Promise(resolve => setTimeout(resolve, 500));

    // 更新数据
    collectedData.category = newCategory;

    // 更新显示
    const categoryElement = document.getElementById('pageCategory');
    if (categoryElement) {
      categoryElement.textContent = newCategory;
      // 添加一个闪烁动画
      categoryElement.style.animation = 'pulse 0.5s ease';
      setTimeout(() => {
        categoryElement.style.animation = '';
      }, 500);
    }

    // 关闭模态框
    modal.style.display = 'none';

    // 显示成功提示
    const message = oldCategory !== newCategory
      ? `✅ 分类已从"${oldCategory}"更改为"${newCategory}"`
      : `✅ 分类确认为"${newCategory}"`;
    showStatus(message, 'success');

  } catch (error) {
    showStatus('❌ 更新失败: ' + error.message, 'error');

    // 恢复按钮状态
    allButtons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    });
  }
}

// 保存收藏
async function saveBookmark() {
  const bookmarkBtn = document.getElementById('bookmarkBtn');

  if (!collectedData || !collectedData.pageInfo) {
    showStatus('⚠️ 请先完成内容分析再存入收藏', 'error');
    return;
  }

  const originalBtnContent = bookmarkBtn.innerHTML;

  try {
    // 立即反馈
    bookmarkBtn.disabled = true;
    bookmarkBtn.innerHTML = '⌛ 正在存入...';

    // 获取现有收藏
    const result = await chrome.storage.local.get(['bookmarks']);
    const bookmarks = result.bookmarks || [];

    const url = collectedData.pageInfo.url;
    const existingIndex = bookmarks.findIndex(b => b.pageInfo.url === url);

    let bookmark;
    let isUpdate = false;

    if (existingIndex !== -1) {
      bookmark = {
        ...bookmarks[existingIndex],
        ...collectedData,
        id: bookmarks[existingIndex].id || Date.now().toString(),
        updatedAt: new Date().toISOString()
      };
      bookmarks[existingIndex] = bookmark;
      isUpdate = true;
    } else {
      bookmark = {
        ...collectedData,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      bookmarks.unshift(bookmark);
    }

    // 保存到本地存储（快速完成）
    await chrome.storage.local.set({ bookmarks });

    // 后台异步同步到 Turso（不阻塞UI）
    setTimeout(async () => {
      try {
        await bookmarkManager.init();
        if (bookmarkManager.enabled) {
          await bookmarkManager.saveToTurso(bookmark);
        }
      } catch (e) {
        // 云端同步失败不影响本地功能
      }
    }, 0);

    // 立即显示本地成功状态
    const successMsg = isUpdate ? '✅ 收藏已更新！' : '✅ 收藏成功！';

    showStatus(successMsg, 'success');

    // 成功反馈样式
    bookmarkBtn.innerHTML = '⭐ 已存入库';
    bookmarkBtn.style.background = 'var(--success)';
    bookmarkBtn.style.boxShadow = '0 4px 14px rgba(16, 185, 129, 0.2)';

    // 3秒后恢复
    setTimeout(() => {
      bookmarkBtn.innerHTML = originalBtnContent;
      bookmarkBtn.style.background = 'var(--danger)';
      bookmarkBtn.style.boxShadow = '0 4px 14px rgba(239, 68, 68, 0.2)';
      bookmarkBtn.disabled = false;
    }, 3000);

  } catch (error) {
    console.error('保存收藏流程失败:', error);
    showStatus('❌ 存入失败: ' + error.message, 'error');
    bookmarkBtn.innerHTML = originalBtnContent;
    bookmarkBtn.disabled = false;
  }
}
