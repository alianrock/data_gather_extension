// 内容脚本 - 运行在网页上下文中

// 监听来自popup或background的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageInfo') {
    // 获取网页信息
    const pageInfo = extractPageInfo();
    sendResponse({ success: true, data: pageInfo });
    return true;
  }

  if (request.action === 'highlightElement') {
    // 高亮显示特定元素（可选功能）
    highlightElement(request.selector);
    sendResponse({ success: true });
    return true;
  }
});

// 提取网页信息
function extractPageInfo() {
  try {
    // 获取网页标题
    const title = document.title;

    // 获取URL
    const url = window.location.href;

    // 获取各种meta标签信息
    const description = getMetaContent('description') ||
                       getMetaContent('og:description') ||
                       getMetaContent('twitter:description') || '';

    const keywords = getMetaContent('keywords') || '';

    const author = getMetaContent('author') || '';

    const ogImage = getMetaContent('og:image') ||
                   getMetaContent('twitter:image') || '';

    // 获取语言
    const language = document.documentElement.lang || 'zh-CN';

    // 获取主要文本内容
    const bodyText = extractMainContent();

    // 获取所有标题
    const headings = extractHeadings();

    // 获取图片信息
    const images = extractImages();

    // 获取链接信息
    const links = extractLinks();

    // 获取结构化数据（JSON-LD）
    const structuredData = extractStructuredData();

    // 获取页面元数据
    const metadata = {
      charset: document.characterSet,
      viewport: getMetaContent('viewport'),
      robots: getMetaContent('robots'),
      canonical: getCanonicalUrl()
    };

    return {
      title,
      url,
      description,
      keywords,
      author,
      language,
      ogImage,
      bodyText,
      headings,
      images,
      links,
      structuredData,
      metadata,
      domain: new URL(url).hostname,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('提取网页信息失败:', error);
    return null;
  }
}

// 获取meta标签内容
function getMetaContent(name) {
  const meta = document.querySelector(`meta[name="${name}"]`) ||
               document.querySelector(`meta[property="${name}"]`);
  return meta ? meta.content : '';
}

// 获取canonical URL
function getCanonicalUrl() {
  const canonical = document.querySelector('link[rel="canonical"]');
  return canonical ? canonical.href : '';
}

// 提取主要内容
function extractMainContent() {
  // 尝试找到主要内容区域
  const mainContent = document.querySelector('main') ||
                     document.querySelector('article') ||
                     document.querySelector('[role="main"]') ||
                     document.body;

  // 移除脚本、样式等标签
  const clone = mainContent.cloneNode(true);
  const unwantedElements = clone.querySelectorAll('script, style, nav, header, footer, aside');
  unwantedElements.forEach(el => el.remove());

  // 获取文本内容，限制长度
  const text = clone.innerText || clone.textContent || '';
  return text.trim().substring(0, 5000);
}

// 提取标题
function extractHeadings() {
  const headings = [];
  const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

  headingElements.forEach((heading, index) => {
    if (index < 20) { // 限制数量
      const text = heading.innerText.trim();
      if (text.length > 0) {
        headings.push({
          level: heading.tagName.toLowerCase(),
          text: text
        });
      }
    }
  });

  return headings;
}

// 提取图片信息
function extractImages() {
  const images = [];
  const imgElements = document.querySelectorAll('img');

  imgElements.forEach((img, index) => {
    if (index < 10) { // 限制数量
      // 确保图片有实际尺寸（过滤掉跟踪像素等）
      if (img.width > 50 && img.height > 50) {
        images.push({
          src: img.src,
          alt: img.alt || '',
          width: img.width,
          height: img.height
        });
      }
    }
  });

  return images;
}

// 提取链接信息
function extractLinks() {
  const links = [];
  const linkElements = document.querySelectorAll('a[href]');
  const urlSet = new Set();

  linkElements.forEach((link) => {
    const href = link.href;
    // 避免重复，限制数量
    if (!urlSet.has(href) && links.length < 20) {
      urlSet.add(href);
      links.push({
        url: href,
        text: link.innerText.trim() || link.title || '',
        isExternal: !href.startsWith(window.location.origin)
      });
    }
  });

  return links;
}

// 提取结构化数据（JSON-LD）
function extractStructuredData() {
  const structuredData = [];
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  scripts.forEach(script => {
    try {
      const data = JSON.parse(script.textContent);
      structuredData.push(data);
    } catch (e) {
      console.warn('解析结构化数据失败:', e);
    }
  });

  return structuredData;
}

// 高亮显示元素（可选功能）
function highlightElement(selector) {
  try {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      el.style.outline = '3px solid #667eea';
      el.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';
    });

    // 3秒后移除高亮
    setTimeout(() => {
      elements.forEach(el => {
        el.style.outline = '';
        el.style.backgroundColor = '';
      });
    }, 3000);
  } catch (error) {
    console.error('高亮元素失败:', error);
  }
}

// 页面加载完成后的初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  console.log('网页信息收集助手内容脚本已加载');
}
