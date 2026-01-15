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

// 提取主要内容 - 使用智能算法提取网页核心内容
function extractMainContent() {
  // 优先查找语义化标签
  let mainContent = document.querySelector('main') ||
                   document.querySelector('article') ||
                   document.querySelector('[role="main"]') ||
                   document.querySelector('.main-content') ||
                   document.querySelector('.content') ||
                   document.querySelector('#content') ||
                   document.querySelector('#main');

  // 如果没有找到，使用内容密度算法找到主要内容区域
  if (!mainContent || mainContent === document.body) {
    mainContent = findMainContentByDensity();
  }

  // 如果还是没找到，使用body
  if (!mainContent) {
    mainContent = document.body;
  }

  // 移除脚本、样式等不需要的标签
  const clone = mainContent.cloneNode(true);
  const unwantedSelectors = [
    'script', 'style', 'nav', 'header', 'footer', 'aside',
    '.sidebar', '.navigation', '.menu', '.ad', '.advertisement',
    '.comment', '.comments', '.social-share', '.share-buttons',
    '.related', '.related-posts', '.breadcrumb', '.breadcrumbs'
  ];
  
  unwantedSelectors.forEach(selector => {
    const elements = clone.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  });

  // 提取文本内容
  let text = clone.innerText || clone.textContent || '';
  
  // 清理文本：移除多余空白、换行
  text = text.replace(/\s+/g, ' ').trim();
  
  // 移除常见的无用文本模式
  text = text.replace(/\s*(Cookie|隐私|Privacy|Terms|条款|使用|使用条款)\s*/gi, '');
  
  // 如果文本太短，尝试从段落中提取
  if (text.length < 200) {
    const paragraphs = Array.from(clone.querySelectorAll('p'))
      .map(p => p.innerText.trim())
      .filter(t => t.length > 50)
      .slice(0, 10)
      .join(' ');
    
    if (paragraphs.length > text.length) {
      text = paragraphs;
    }
  }
  
  // 限制长度，但保留更多内容用于AI分析
  return text.substring(0, 8000);
}

// 使用内容密度算法找到主要内容区域
function findMainContentByDensity() {
  const candidates = [];
  const allElements = document.querySelectorAll('div, section, article, main');
  
  allElements.forEach(element => {
    // 跳过明显不是内容的元素
    const tagName = element.tagName.toLowerCase();
    const className = element.className || '';
    const id = element.id || '';
    
    const skipPatterns = [
      /nav/i, /menu/i, /sidebar/i, /footer/i, /header/i,
      /ad/i, /comment/i, /social/i, /share/i, /related/i
    ];
    
    if (skipPatterns.some(pattern => 
      pattern.test(className) || pattern.test(id) || pattern.test(tagName)
    )) {
      return;
    }
    
    // 计算文本密度
    const text = element.innerText || '';
    const textLength = text.trim().length;
    
    // 跳过太短的内容
    if (textLength < 200) {
      return;
    }
    
    // 计算链接密度（链接太多可能是导航栏）
    const links = element.querySelectorAll('a');
    const linkDensity = links.length / Math.max(textLength / 100, 1);
    
    // 计算段落密度
    const paragraphs = element.querySelectorAll('p');
    const paragraphDensity = paragraphs.length / Math.max(textLength / 500, 1);
    
    // 计算内容分数
    const score = textLength * (1 - Math.min(linkDensity, 0.5)) * (1 + paragraphDensity * 0.5);
    
    candidates.push({
      element: element,
      score: score,
      textLength: textLength
    });
  });
  
  // 按分数排序，返回得分最高的元素
  candidates.sort((a, b) => b.score - a.score);
  
  if (candidates.length > 0 && candidates[0].textLength > 300) {
    return candidates[0].element;
  }
  
  return null;
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
  // 内容脚本已初始化
}
