let allBookmarks = [];
let filteredBookmarks = [];
let currentCategory = 'all';
let searchQuery = '';
let editingCategoryId = null;

// 默认分类结构
const DEFAULT_CATEGORIES = [
  { id: 'tech-tools', name: '技术工具', icon: '🔧', children: [
    { id: 'dev-tools', name: '开发工具', icon: '💻', parentId: 'tech-tools' },
    { id: 'ai-tools', name: 'AI工具', icon: '🤖', parentId: 'tech-tools' }
  ]},
  { id: 'learning', name: '学习资源', icon: '📚', children: [
    { id: 'tutorials', name: '教程文档', icon: '📖', parentId: 'learning' },
    { id: 'courses', name: '在线课程', icon: '🎓', parentId: 'learning' }
  ]},
  { id: 'news', name: '新闻资讯', icon: '📰', children: [] },
  { id: 'entertainment', name: '娱乐休闲', icon: '🎮', children: [] },
  { id: 'business', name: '商业服务', icon: '💼', children: [] },
  { id: 'design', name: '设计创意', icon: '🎨', children: [] },
  { id: 'lifestyle', name: '生活服务', icon: '🏠', children: [] },
  { id: 'other', name: '其他', icon: '📁', children: [] }
];

let categories = [];

let currentView = 'grid';
let currentSort = 'newest';
let selectedTags = new Set();

// 更新加载进度
function updateLoadingProgress(message) {
  const progressEl = document.getElementById('loadingProgress');
  if (progressEl) {
    progressEl.textContent = message;
  }
}

// 隐藏全局加载遮罩
function hideGlobalLoading() {
  const loadingEl = document.getElementById('globalLoading');
  if (loadingEl) {
    loadingEl.classList.add('fade-out');
    setTimeout(() => {
      loadingEl.style.display = 'none';
    }, 300);
  }
}

// 显示侧边栏加载状态
function showSidebarLoading() {
  const sidebarNav = document.getElementById('sidebarNav');
  if (sidebarNav) {
    sidebarNav.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <div class="loading-spinner" style="margin: 0 auto 12px;"></div>
        <p style="font-size: 13px; color: var(--text-muted);">加载分类中...</p>
      </div>
    `;
  }
}

// 显示书签加载状态（骨架屏）
function showBookmarksLoading() {
  const container = document.getElementById('bookmarksContainer');
  if (container) {
    const skeletons = Array.from({ length: 6 }, (_, i) => `
      <div class="bookmark-skeleton" style="
        background: var(--bg-card);
        border-radius: var(--radius-lg);
        padding: 20px;
        margin-bottom: 16px;
        border: 1px solid var(--border-color);
      ">
        <div style="display: flex; gap: 16px;">
          <div style="
            width: 120px;
            height: 80px;
            background: var(--bg-main);
            border-radius: var(--radius-md);
            animation: pulse 1.5s ease-in-out infinite;
          "></div>
          <div style="flex: 1;">
            <div style="
              height: 20px;
              background: var(--bg-main);
              border-radius: 4px;
              margin-bottom: 12px;
              width: 70%;
              animation: pulse 1.5s ease-in-out infinite;
            "></div>
            <div style="
              height: 14px;
              background: var(--bg-main);
              border-radius: 4px;
              margin-bottom: 8px;
              width: 90%;
              animation: pulse 1.5s ease-in-out infinite;
            "></div>
            <div style="
              height: 14px;
              background: var(--bg-main);
              border-radius: 4px;
              width: 60%;
              animation: pulse 1.5s ease-in-out infinite;
            "></div>
          </div>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = skeletons;
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. 立即加载主题和隐藏全局loading
  const settings = await chrome.storage.sync.get({ theme: 'default' });
  if (settings.theme !== 'default') {
    document.body.className = `theme-${settings.theme}`;
  }

    // 2. 快速隐藏全局loading，显示界面框架
    hideGlobalLoading();
    
    // 3. 显示加载占位符
    showSidebarLoading();
    showBookmarksLoading();
    
    // 4. 初始化基础组件（不依赖数据）
  initSyncButtons();
  initModal();
  initReaderDrawer();
  
  // 视图切换事件
  const gridBtn = document.getElementById('gridViewBtn');
  const listBtn = document.getElementById('listViewBtn');
  const timelineBtn = document.getElementById('timelineViewBtn');

  gridBtn?.addEventListener('click', () => {
    currentView = 'grid';
    updateViewButtons(gridBtn);
    renderBookmarks();
  });

  listBtn?.addEventListener('click', () => {
    currentView = 'list';
    updateViewButtons(listBtn);
    renderBookmarks();
  });

  timelineBtn?.addEventListener('click', () => {
    currentView = 'timeline';
    updateViewButtons(timelineBtn);
    renderBookmarks();
  });

  function updateViewButtons(activeBtn) {
    [gridBtn, listBtn, timelineBtn].forEach(btn => btn?.classList.remove('active'));
    activeBtn?.classList.add('active');
  }

  // 排序事件
  const sortSelect = document.getElementById('sortSelect');
  sortSelect?.addEventListener('change', (e) => {
    currentSort = e.target.value;
    filterBookmarks();
  });
  
  // 搜索框事件
  const searchBox = document.getElementById('searchBox');
  if (searchBox) {
    searchBox.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      filterBookmarks();
    });
  }

  // 重新分类按钮事件
  const reclassifyBtn = document.getElementById('reclassifyBtn');
  reclassifyBtn?.addEventListener('click', reclassifyAllBookmarks);

    // 5. 异步加载分类数据（不阻塞界面显示）
    loadCategories()
      .then(() => {
        renderSidebarNav();
      })
      .catch(error => {
        const sidebarNav = document.getElementById('sidebarNav');
        if (sidebarNav) {
          sidebarNav.innerHTML = `
            <div style="padding: 20px; text-align: center;">
              <p style="font-size: 13px; color: var(--danger);">加载失败</p>
              <button onclick="location.reload()" style="margin-top: 10px; padding: 6px 12px; font-size: 12px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer;">重试</button>
            </div>
          `;
        }
      });

    // 6. 异步加载书签数据（不阻塞界面显示）
    loadBookmarks()
      .then(() => {
      })
      .catch(error => {
        const container = document.getElementById('bookmarksContainer');
        if (container) {
          container.innerHTML = `
            <div style="padding: 60px 20px; text-align: center;">
              <p style="font-size: 15px; color: var(--danger); margin-bottom: 12px;">❌ 加载失败</p>
              <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">${error.message}</p>
              <button onclick="location.reload()" style="padding: 10px 20px; background: var(--primary); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;">重新加载</button>
            </div>
          `;
        }
      });
    
  } catch (error) {
    console.error('初始化失败:', error);
    hideGlobalLoading();
    showNotification('❌ 初始化失败: ' + error.message, 'error');
  }
});

// 初始化阅读器抽屉
function initReaderDrawer() {
  const drawer = document.getElementById('readerDrawer');
  const closeBtn = document.getElementById('closeDrawer');
  const overlay = drawer?.querySelector('.drawer-overlay');

  const closeDrawer = () => {
    drawer?.classList.remove('visible');
    document.body.style.overflow = '';
  };

  closeBtn?.addEventListener('click', closeDrawer);
  overlay?.addEventListener('click', closeDrawer);
}

// 打开阅读器
function openReader(bookmarkId) {
  const bookmark = allBookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) return;

  const drawer = document.getElementById('readerDrawer');
  const titleEl = document.getElementById('readerTitle');
  const categoryEl = document.getElementById('readerCategory');
  const metaEl = document.getElementById('readerMeta');
  const summaryEl = document.getElementById('readerSummary');
  const contentEl = document.getElementById('readerMainContent');
  const sourceLink = document.getElementById('drawerSourceLink');

  if (titleEl) titleEl.textContent = bookmark.pageInfo.title;
  if (categoryEl) {
    categoryEl.textContent = bookmark.category || '其他';
    categoryEl.className = 'badge badge-primary';
  }
  if (metaEl) {
    const date = new Date(bookmark.createdAt || bookmark.timestamp).toLocaleString();
    metaEl.textContent = `${bookmark.pageInfo.domain} · ${date}`;
  }
  if (summaryEl) summaryEl.textContent = bookmark.summary || '暂无 AI 摘要';
  if (contentEl) contentEl.textContent = bookmark.pageInfo.bodyText || '暂无抓取到的正文内容';
  if (sourceLink) sourceLink.href = bookmark.pageInfo.url;

  drawer?.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

// 提取并渲染标签云
function renderTagCloud() {
  const tagCloud = document.getElementById('tagCloud');
  const tagList = document.getElementById('tagList');
  if (!tagCloud || !tagList) return;

  const tags = new Map(); // tag -> count
  
  allBookmarks.forEach(b => {
    // 优先从 tags 字段读取，如果没有（旧数据）则从摘要中提取
    if (Array.isArray(b.tags) && b.tags.length > 0) {
      b.tags.forEach(tag => {
        tags.set(tag, (tags.get(tag) || 0) + 1);
      });
    } else {
      const summary = b.summary || '';
      // 匹配 #标签 或 【标签】
      const found = summary.match(/[#＃]([^\s#＃]+)|【([^】]+)】/g);
      if (found) {
        found.forEach(t => {
          const cleanTag = t.replace(/[#＃【】]/g, '').trim();
          if (cleanTag.length > 1 && cleanTag.length < 10) {
            tags.set(cleanTag, (tags.get(cleanTag) || 0) + 1);
          }
        });
      }
    }
  });

  if (tags.size === 0) {
    tagCloud.classList.add('hidden');
    return;
  }

  tagCloud.classList.remove('hidden');
  
  // 按频率排序并取前 20 个
  const sortedTags = Array.from(tags.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  tagList.innerHTML = `
    <div class="tag-item ${selectedTags.size === 0 ? 'active' : ''}" id="allTagsBtn">
      全部标签
    </div>
    ${sortedTags.map(([tag, count]) => `
      <div class="tag-item ${selectedTags.has(tag) ? 'active' : ''}" data-tag="${tag}">
        ${tag} <span style="opacity:0.5;font-size:10px;">${count}</span>
      </div>
    `).join('')}
  `;

  // 绑定点击事件
  const allBtn = document.getElementById('allTagsBtn');
  allBtn?.addEventListener('click', () => {
    selectedTags.clear();
    filterBookmarks();
  });

  tagList.querySelectorAll('.tag-item[data-tag]').forEach(el => {
    el.addEventListener('click', () => {
      const tag = el.dataset.tag;
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
      } else {
        selectedTags.add(tag);
      }
      filterBookmarks();
    });
  });
}

// 加载分类
async function loadCategories() {
  try {
    // 1. 快速加载本地分类并立即返回
    const result = await chrome.storage.local.get(['categories']);
    if (result.categories && result.categories.length > 0) {
      categories = result.categories;
    } else {
      categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
      await saveCategories(false); // 不同步到云端，避免首次加载时覆盖云端数据
    }

    // 2. 后台异步同步云端分类（不阻塞界面）
    setTimeout(async () => {
      try {
    await bookmarkManager.init();
    if (bookmarkManager.enabled) {
      showBackgroundStatus('⏳ 正在同步分类...', 'syncing', 0);
      
      try {
        const cloudResult = await bookmarkManager.getCategoriesFromTurso();
        if (cloudResult.success && cloudResult.categories.length > 0) {
          const localCount = categories.length;
          const cloudCount = cloudResult.categories.length;
          
          // 智能合并策略：合并本地和云端分类，避免数据丢失
          const mergedCategories = mergeCategories(categories, cloudResult.categories);
          const mergedCount = mergedCategories.length;
          
          // 检查是否有变化
          const hasChanges = JSON.stringify(mergedCategories) !== JSON.stringify(categories);
          
          if (hasChanges) {
            categories = mergedCategories;
          await chrome.storage.local.set({ categories });
            renderSidebarNav();

            // 如果合并后的数据与云端不同，上传到云端
            if (JSON.stringify(mergedCategories) !== JSON.stringify(cloudResult.categories)) {
              setTimeout(async () => {
                try {
                  await bookmarkManager.saveCategoriesToTurso(categories);
                } catch (uploadError) {
                  // 上传失败不影响本地功能
                }
              }, 0);
            }

            showBackgroundStatus(`✅ 已合并分类 (${mergedCount}个)`, 'success');
          } else {
            hideBackgroundStatus();
          }
        } else if (cloudResult.success && cloudResult.categories.length === 0) {
          // 云端为空，上传本地数据
          if (categories.length > 0) {
            try {
              await bookmarkManager.saveCategoriesToTurso(categories);
              showBackgroundStatus(`✅ 已上传 ${categories.length} 个分类到云端`, 'success');
            } catch (uploadError) {
              showBackgroundStatus('⚠️ 上传分类失败', 'warning');
            }
          } else {
            hideBackgroundStatus();
          }
        }
      } catch (syncError) {
            showBackgroundStatus('⚠️ 分类同步失败', 'warning');
      }
    } else {
      hideBackgroundStatus();
    }
      } catch (initError) {
        hideBackgroundStatus();
      }
    }, 0);
    
  } catch (error) {
    console.error('加载分类失败:', error);
    categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    throw error; // 抛出错误让调用者处理
  }
}

// 智能合并分类（避免数据丢失）
function mergeCategories(localCategories, cloudCategories) {
  // 创建ID到分类的映射
  const localMap = new Map();
  const cloudMap = new Map();
  
  // 建立本地分类映射
  localCategories.forEach(cat => {
    localMap.set(cat.id, cat);
    if (cat.children && Array.isArray(cat.children)) {
      cat.children.forEach(child => {
        localMap.set(child.id, { ...child, parentId: cat.id });
      });
    }
  });
  
  // 建立云端分类映射
  cloudCategories.forEach(cat => {
    cloudMap.set(cat.id, cat);
    if (cat.children && Array.isArray(cat.children)) {
      cat.children.forEach(child => {
        cloudMap.set(child.id, { ...child, parentId: cat.id });
      });
    }
  });
  
  // 合并主分类
  const mergedCategories = [];
  const processedIds = new Set();
  
  // 先处理所有本地分类
  localCategories.forEach(localCat => {
    const cloudCat = cloudMap.get(localCat.id);
    
    if (cloudCat) {
      // 分类存在于两端，合并子分类
      const mergedChildren = [];
      const childIds = new Set();
      
      // 添加本地子分类
      if (localCat.children && Array.isArray(localCat.children)) {
        localCat.children.forEach(child => {
          mergedChildren.push(child);
          childIds.add(child.id);
        });
      }
      
      // 添加云端独有的子分类
      if (cloudCat.children && Array.isArray(cloudCat.children)) {
        cloudCat.children.forEach(child => {
          if (!childIds.has(child.id)) {
            mergedChildren.push(child);
            childIds.add(child.id);
          }
        });
      }
      
      // 保留更完整的分类（优先保留有子分类的版本）
      const mergedCat = {
        ...localCat,
        children: mergedChildren.length > 0 ? mergedChildren : (localCat.children || cloudCat.children || [])
      };
      
      // 如果云端有本地没有的属性，保留云端的
      if (cloudCat.icon && !localCat.icon) mergedCat.icon = cloudCat.icon;
      if (cloudCat.name && !localCat.name) mergedCat.name = cloudCat.name;
      
      mergedCategories.push(mergedCat);
    } else {
      // 本地独有的分类，直接添加
      mergedCategories.push(localCat);
    }
    
    processedIds.add(localCat.id);
  });
  
  // 添加云端独有的分类
  cloudCategories.forEach(cloudCat => {
    if (!processedIds.has(cloudCat.id)) {
      mergedCategories.push(cloudCat);
      processedIds.add(cloudCat.id);
    }
  });
  
  return mergedCategories;
}

// 保存分类
async function saveCategories(syncToCloud = true) {
  try {
    // 保存到本地（快速完成）
    await chrome.storage.local.set({ categories });

    // 后台异步同步到云端，不阻塞UI
    if (syncToCloud && bookmarkManager.enabled) {
      // 使用 setTimeout 让同步在后台执行，不阻塞UI
      setTimeout(async () => {
        showBackgroundStatus('⏳ 正在同步分类到云端...', 'syncing', 0);
      try {
        const result = await bookmarkManager.saveCategoriesToTurso(categories);
        if (result.success) {
            showBackgroundStatus(`✅ 已同步 ${categories.length} 个分类到云端`, 'success');
        } else {
            showBackgroundStatus('⚠️ 分类同步失败', 'warning');
        }
      } catch (syncError) {
          showBackgroundStatus('⚠️ 分类同步失败', 'warning');
      }
      }, 0);
    }
  } catch (error) {
    // 保存失败
  }
}

// 获取展开状态
function getExpandedCategories() {
  try {
    const saved = localStorage.getItem('expandedCategories');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

// 保存展开状态
function saveExpandedCategories(expanded) {
  try {
    localStorage.setItem('expandedCategories', JSON.stringify(expanded));
  } catch {
    // 忽略存储错误
  }
}

// 切换分类展开状态
function toggleCategoryExpand(categoryId) {
  const expanded = getExpandedCategories();
  const index = expanded.indexOf(categoryId);
  if (index > -1) {
    expanded.splice(index, 1);
  } else {
    expanded.push(categoryId);
  }
  saveExpandedCategories(expanded);

  // 更新 DOM
  const wrapper = document.querySelector(`.nav-item-parent[data-parent-id="${categoryId}"]`);
  if (wrapper) {
    wrapper.classList.toggle('expanded', index === -1);
  }
}

// 渲染左侧导航
function renderSidebarNav() {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;

  const allCount = allBookmarks.length;
  const allCountBadge = document.getElementById('allCountBadge');
  if (allCountBadge) allCountBadge.textContent = allCount;

  const expandedCategories = getExpandedCategories();
  let html = '';

  categories.forEach((cat, index) => {
    const count = countBookmarksInCategory(cat.id);
    const hasChildren = cat.children && cat.children.length > 0;
    const isExpanded = expandedCategories.includes(cat.id);

    if (hasChildren) {
      // 有子分类的父分类 - 使用包装容器
      html += `<div class="nav-item-parent ${isExpanded ? 'expanded' : ''}" data-parent-id="${cat.id}">`;
    }

    html += `
      <div class="nav-item ${currentCategory === cat.id ? 'active' : ''}"
           data-category="${cat.id}"
           data-category-index="${index}"
           draggable="true">
        ${hasChildren ? `
          <button class="nav-toggle" data-toggle="${cat.id}" title="${isExpanded ? '收起' : '展开'}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        ` : `
          <span class="drag-handle" title="拖动排序">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 14px; height: 14px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
            </svg>
          </span>
        `}
        <span class="nav-icon">${cat.icon || '📁'}</span>
        <span class="nav-label">${cat.name}</span>
        <span class="nav-count">${count}</span>
        <div class="nav-item-actions">
          <button class="nav-action" data-action="add-child" data-id="${cat.id}" title="添加子分类">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 12px; height: 12px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          <button class="nav-action" data-action="edit" data-id="${cat.id}" title="编辑">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 12px; height: 12px;">
              <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
            </svg>
          </button>
        </div>
      </div>
    `;

    if (hasChildren) {
      html += '<div class="nav-children">';
      cat.children.forEach((child, childIndex) => {
        const childCount = countBookmarksInCategory(child.id);
        html += `
          <div class="nav-item ${currentCategory === child.id ? 'active' : ''}"
               data-category="${child.id}"
               data-parent-index="${index}"
               data-child-index="${childIndex}"
               draggable="true">
            <span class="drag-handle" title="拖动排序">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 12px; height: 12px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
              </svg>
            </span>
            <span class="nav-icon">${child.icon || '•'}</span>
            <span class="nav-label">${child.name}</span>
            <span class="nav-count">${childCount}</span>
            <div class="nav-item-actions">
              <button class="nav-action" data-action="edit" data-id="${child.id}" title="编辑">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 12px; height: 12px;">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                </svg>
              </button>
            </div>
          </div>
        `;
      });
      html += '</div></div>'; // 关闭 nav-children 和 nav-item-parent
    }
  });

  nav.innerHTML = html;

  // 更新分类数量
  const categoryCountEl = document.getElementById('categoryCount');
  if (categoryCountEl) {
    let total = categories.length;
    categories.forEach(c => { if (c.children) total += c.children.length; });
    categoryCountEl.textContent = total;
  }

  // 绑定事件
  bindNavEvents();
  bindToggleEvents();
  initDragAndDrop();
}

// 绑定展开/折叠事件
function bindToggleEvents() {
  document.querySelectorAll('.nav-toggle[data-toggle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const categoryId = btn.dataset.toggle;
      toggleCategoryExpand(categoryId);
    });
  });
}

// 拖拽排序状态
let draggedElement = null;
let draggedData = null;

// 初始化拖拽排序
function initDragAndDrop() {
  const navItems = document.querySelectorAll('.nav-item[draggable="true"]');
  
  navItems.forEach(item => {
    // 拖拽开始
    item.addEventListener('dragstart', (e) => {
      draggedElement = item;
      
      // 记录拖拽的元素信息
      if (item.dataset.categoryIndex !== undefined) {
        // 父分类
        draggedData = {
          type: 'parent',
          index: parseInt(item.dataset.categoryIndex)
        };
      } else if (item.dataset.parentIndex !== undefined && item.dataset.childIndex !== undefined) {
        // 子分类
        draggedData = {
          type: 'child',
          parentIndex: parseInt(item.dataset.parentIndex),
          childIndex: parseInt(item.dataset.childIndex)
        };
      }
      
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', item.innerHTML);
    });

    // 拖拽经过
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      if (item !== draggedElement && item.hasAttribute('draggable')) {
        item.classList.add('drag-over');
      }
    });

    // 拖拽离开
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });

    // 放下
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.classList.remove('drag-over');
      
      if (draggedElement !== item && item.hasAttribute('draggable') && draggedData) {
        // 获取目标位置信息
        let targetData = null;
        if (item.dataset.categoryIndex !== undefined) {
          targetData = {
            type: 'parent',
            index: parseInt(item.dataset.categoryIndex)
          };
        } else if (item.dataset.parentIndex !== undefined && item.dataset.childIndex !== undefined) {
          targetData = {
            type: 'child',
            parentIndex: parseInt(item.dataset.parentIndex),
            childIndex: parseInt(item.dataset.childIndex)
          };
        }
        
        if (targetData) {
          await reorderCategories(draggedData, targetData);
        }
      }
    });

    // 拖拽结束
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('drag-over');
      });
      draggedElement = null;
      draggedData = null;
    });
  });
}

// 重新排序分类
async function reorderCategories(draggedData, targetData) {
  try {
    // 父分类之间的排序
    if (draggedData.type === 'parent' && targetData.type === 'parent') {
      if (draggedData.index === targetData.index) return;
      
      const [movedCategory] = categories.splice(draggedData.index, 1);
      categories.splice(targetData.index, 0, movedCategory);
    }
    // 子分类之间的排序（同一个父分类下）
    else if (draggedData.type === 'child' && targetData.type === 'child') {
      if (draggedData.parentIndex === targetData.parentIndex) {
        // 同一父分类下的子分类排序
        if (draggedData.childIndex === targetData.childIndex) return;
        
        const parent = categories[draggedData.parentIndex];
        if (parent && parent.children) {
          const [movedChild] = parent.children.splice(draggedData.childIndex, 1);
          parent.children.splice(targetData.childIndex, 0, movedChild);
        }
      } else {
        // 跨父分类移动子分类
        const fromParent = categories[draggedData.parentIndex];
        const toParent = categories[targetData.parentIndex];
        
        if (fromParent && fromParent.children && toParent && toParent.children) {
          const [movedChild] = fromParent.children.splice(draggedData.childIndex, 1);
          movedChild.parentId = toParent.id; // 更新parentId
          toParent.children.splice(targetData.childIndex, 0, movedChild);
        }
      }
    }
    // 不支持父子分类之间的相互拖动
    else {
      showNotification('⚠️ 不支持父子分类之间的拖动', 'error');
      return;
    }
    
    // 保存到本地存储
    await saveCategories(true); // 同步到云端
    
    // 重新渲染导航
    renderSidebarNav();
    
    // 显示成功提示
    showNotification('✅ 分类顺序已更新', 'success');
    
  } catch (error) {
    console.error('重新排序失败:', error);
    showNotification('❌ 排序失败: ' + error.message, 'error');
  }
}

// 绑定导航事件
function bindNavEvents() {
  // 分类点击
  document.querySelectorAll('.nav-item[data-category]').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.nav-action')) return;
      if (e.target.closest('.drag-handle')) return;
      
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      currentCategory = item.dataset.category;
      updateContentTitle();
      filterBookmarks();
    });
  });

  // 操作按钮
  document.querySelectorAll('.nav-action').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === 'edit') {
        openEditModal(id);
      } else if (action === 'add-child') {
        openAddChildModal(id);
      }
    });
  });

  // 添加分类按钮
  const addBtn = document.getElementById('addCategoryBtn');
  if (addBtn) {
    addBtn.onclick = () => openAddModal();
  }
}

// 更新内容标题
function updateContentTitle() {
  const titleEl = document.getElementById('currentCategoryTitle');
  if (!titleEl) return;

  if (currentCategory === 'all') {
    titleEl.textContent = '全部收藏';
  } else if (currentCategory === 'starred') {
    titleEl.textContent = '⭐ 特别关注';
  } else if (currentCategory === 'recent') {
    titleEl.textContent = '🕒 最近更新';
  } else {
    const cat = findCategoryById(currentCategory);
    if (cat) {
      titleEl.textContent = `${cat.icon || '📁'} ${cat.name}`;
    }
  }
}

// 统计分类下的书签数量
function countBookmarksInCategory(categoryId) {
  return allBookmarks.filter(b => {
    const cat = b.category || '其他';
    return cat === categoryId || getCategoryNameById(categoryId) === cat;
  }).length;
}

// 根据ID获取分类名称
function getCategoryNameById(id) {
  for (const cat of categories) {
    if (cat.id === id) return cat.name;
    if (cat.children) {
      const child = cat.children.find(c => c.id === id);
      if (child) return child.name;
    }
  }
  return id;
}

// 根据名称获取分类ID
function getCategoryIdByName(name) {
  for (const cat of categories) {
    if (cat.name === name) return cat.id;
    if (cat.children) {
      const child = cat.children.find(c => c.name === name);
      if (child) return child.id;
    }
  }
  return name;
}

// 查找分类
function findCategoryById(id) {
  for (const cat of categories) {
    if (cat.id === id) return cat;
    if (cat.children) {
      const child = cat.children.find(c => c.id === id);
      if (child) return child;
    }
  }
  return null;
}

// 初始化弹窗
function initModal() {
  const modal = document.getElementById('categoryModal');
  const closeBtn = document.getElementById('modalClose');
  const cancelBtn = document.getElementById('modalCancel');
  const saveBtn = document.getElementById('modalSave');
  const deleteBtn = document.getElementById('modalDelete');

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (saveBtn) saveBtn.addEventListener('click', saveCategory);
  if (deleteBtn) deleteBtn.addEventListener('click', deleteCategory);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
}

// 打开编辑弹窗
function openEditModal(id) {
  const cat = findCategoryById(id);
  if (!cat) return;

  editingCategoryId = id;
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('modalTitle');
  const nameInput = document.getElementById('categoryNameInput');
  const iconInput = document.getElementById('categoryIconInput');
  const deleteBtn = document.getElementById('modalDelete');

  title.textContent = '编辑分类';
  nameInput.value = cat.name;
  iconInput.value = cat.icon || '📁';
  deleteBtn.style.display = 'block';
  
  modal.classList.add('visible');
  nameInput.focus();
}

// 打开添加子分类弹窗
function openAddChildModal(parentId) {
  editingCategoryId = `new-child:${parentId}`;
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('modalTitle');
  const nameInput = document.getElementById('categoryNameInput');
  const iconInput = document.getElementById('categoryIconInput');
  const deleteBtn = document.getElementById('modalDelete');

  title.textContent = '添加子分类';
  nameInput.value = '';
  iconInput.value = '📄';
  deleteBtn.style.display = 'none';
  
  modal.classList.add('visible');
  nameInput.focus();
}

// 打开添加分类弹窗
function openAddModal() {
  editingCategoryId = 'new';
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('modalTitle');
  const nameInput = document.getElementById('categoryNameInput');
  const iconInput = document.getElementById('categoryIconInput');
  const deleteBtn = document.getElementById('modalDelete');

  title.textContent = '添加分类';
  nameInput.value = '';
  iconInput.value = '📁';
  deleteBtn.style.display = 'none';
  
  modal.classList.add('visible');
  nameInput.focus();
}

// 关闭弹窗
function closeModal() {
  const modal = document.getElementById('categoryModal');
  modal.classList.remove('visible');
  editingCategoryId = null;
}

// 保存分类
async function saveCategory() {
  const nameInput = document.getElementById('categoryNameInput');
  const iconInput = document.getElementById('categoryIconInput');
  const saveBtn = document.getElementById('modalSave');
  const cancelBtn = document.getElementById('modalCancel');
  const deleteBtn = document.getElementById('modalDelete');
  
  const name = nameInput.value.trim();
  const icon = iconInput.value.trim() || '📁';

  if (!name) {
    showNotification('⚠️ 请输入分类名称', 'error');
    nameInput.focus();
    return;
  }

  // 禁用所有按钮和输入框
  nameInput.disabled = true;
  iconInput.disabled = true;
  saveBtn.disabled = true;
  cancelBtn.disabled = true;
  if (deleteBtn) deleteBtn.disabled = true;

  // 保存按钮显示loading
  const originalBtnText = saveBtn.innerHTML;
  saveBtn.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
      <div class="loading-spinner loading-spinner-white"></div>
      <span>保存中...</span>
    </div>
  `;

  try {
    const isNew = editingCategoryId === 'new' || editingCategoryId.startsWith('new-child:');

  if (editingCategoryId === 'new') {
    // 添加新分类
    categories.push({
      id: `cat-${Date.now()}`,
      name,
      icon,
      children: []
    });
  } else if (editingCategoryId.startsWith('new-child:')) {
    // 添加子分类
    const parentId = editingCategoryId.replace('new-child:', '');
    const parent = categories.find(c => c.id === parentId);
    if (parent) {
      if (!parent.children) parent.children = [];
      parent.children.push({
        id: `${parentId}-${Date.now()}`,
        name,
        icon,
        parentId
      });
    }
  } else {
    // 编辑现有分类
    const oldCat = findCategoryById(editingCategoryId);
    if (oldCat) {
      const oldName = oldCat.name;
      oldCat.name = name;
      oldCat.icon = icon;
      
      // 更新书签分类
      if (oldName !== name) {
        await updateBookmarksCategory(oldName, name);
      }
    }
  }

  await saveCategories();
  
    // 恢复按钮状态
    saveBtn.innerHTML = originalBtnText;
    nameInput.disabled = false;
    iconInput.disabled = false;
    saveBtn.disabled = false;
    cancelBtn.disabled = false;
    if (deleteBtn) deleteBtn.disabled = false;
    
  closeModal();
  renderSidebarNav();
    
    const successMsg = isNew ? '✅ 分类已添加' : '✅ 分类已更新';
    showNotification(successMsg, 'success');

  } catch (error) {
    console.error('保存分类失败:', error);
    showNotification('❌ 保存失败: ' + error.message, 'error');
    
    // 恢复按钮状态
    saveBtn.innerHTML = originalBtnText;
    nameInput.disabled = false;
    iconInput.disabled = false;
    saveBtn.disabled = false;
    cancelBtn.disabled = false;
    if (deleteBtn) deleteBtn.disabled = false;
  }
}

// 删除分类
async function deleteCategory() {
  if (!editingCategoryId) return;

  const cat = findCategoryById(editingCategoryId);
  if (!cat) return;

  const count = countBookmarksInCategory(editingCategoryId);
  let msg = `确定要删除分类"${cat.name}"吗？`;
  if (count > 0) {
    msg += `\n\n该分类下有 ${count} 个收藏，删除后将归入"其他"。`;
  }

  if (!confirm(msg)) return;

  const deleteBtn = document.getElementById('modalDelete');
  const saveBtn = document.getElementById('modalSave');
  const cancelBtn = document.getElementById('modalCancel');
  const nameInput = document.getElementById('categoryNameInput');
  const iconInput = document.getElementById('categoryIconInput');

  // 禁用所有按钮和输入框
  nameInput.disabled = true;
  iconInput.disabled = true;
  saveBtn.disabled = true;
  cancelBtn.disabled = true;
  deleteBtn.disabled = true;

  // 删除按钮显示loading
  const originalBtnText = deleteBtn.innerHTML;
  deleteBtn.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
      <div class="loading-spinner loading-spinner-white"></div>
      <span>删除中...</span>
    </div>
  `;

  try {
  // 移动书签到其他
  const categoryName = cat.name;
  allBookmarks.forEach(b => {
    if (b.category === categoryName || b.category === editingCategoryId) {
      b.category = '其他';
    }
  });
  await chrome.storage.local.set({ bookmarks: allBookmarks });

  // 删除分类
  const parentIndex = categories.findIndex(c => c.id === editingCategoryId);
  if (parentIndex !== -1) {
    categories.splice(parentIndex, 1);
  } else {
    for (const cat of categories) {
      if (cat.children) {
        const childIndex = cat.children.findIndex(c => c.id === editingCategoryId);
        if (childIndex !== -1) {
          cat.children.splice(childIndex, 1);
          break;
        }
      }
    }
  }

  await saveCategories();
    
    // 恢复按钮状态
    deleteBtn.innerHTML = originalBtnText;
    nameInput.disabled = false;
    iconInput.disabled = false;
    saveBtn.disabled = false;
    cancelBtn.disabled = false;
    deleteBtn.disabled = false;
    
  closeModal();
  renderSidebarNav();
  filterBookmarks();
    
    showNotification('✅ 分类已删除', 'success');

  } catch (error) {
    console.error('删除分类失败:', error);
    showNotification('❌ 删除失败: ' + error.message, 'error');
    
    // 恢复按钮状态
    deleteBtn.innerHTML = originalBtnText;
    nameInput.disabled = false;
    iconInput.disabled = false;
    saveBtn.disabled = false;
    cancelBtn.disabled = false;
    deleteBtn.disabled = false;
  }
}

// 更新书签分类
async function updateBookmarksCategory(oldName, newName) {
  let updated = false;
  allBookmarks.forEach(b => {
    if (b.category === oldName) {
      b.category = newName;
      updated = true;
    }
  });
  if (updated) {
    await chrome.storage.local.set({ bookmarks: allBookmarks });
  }
}

// UI 层同步锁（立即生效，防止重复点击）
let _uiSyncLock = false;

// 初始化同步按钮
async function initSyncButtons() {
  const syncFromBtn = document.getElementById('syncFromCloudBtn');
  const syncToBtn = document.getElementById('syncToCloudBtn');
  const syncStatus = document.getElementById('syncStatus');

  await bookmarkManager.init();

  if (!bookmarkManager.enabled) {
    if (syncFromBtn) syncFromBtn.disabled = true;
    if (syncToBtn) syncToBtn.disabled = true;
    if (syncStatus) {
      const msg = bookmarkManager.getStatusMessage();
      syncStatus.textContent = `⚠️ ${msg}`;
      syncStatus.title = '请在设置页面配置云端同步';
      syncStatus.style.cursor = 'help';
    }
    return;
  }

  if (syncStatus) syncStatus.textContent = '☁️ 云端已连接';

  if (syncFromBtn) {
    syncFromBtn.addEventListener('click', async () => {
      // 检查 UI 层同步锁（立即生效）
      if (_uiSyncLock) {
        if (syncStatus) syncStatus.textContent = '⏳ 同步中，请稍候...';
        showNotification('⏳ 正在同步中，请等待完成', 'info');
        return;
      }

      // 立即设置 UI 锁
      _uiSyncLock = true;
      syncFromBtn.disabled = true;
      syncToBtn.disabled = true;
      if (syncCatBtn) syncCatBtn.disabled = true;
      syncFromBtn.textContent = '...';
      if (syncStatus) syncStatus.textContent = '⏳ 同步中...';

      try {
        // 先获取分类（无锁操作），再同步书签
        const categoryResult = await bookmarkManager.getCategoriesFromTurso();

        // 处理分类（智能合并，避免覆盖）
        if (categoryResult.success && categoryResult.categories.length > 0) {
          const beforeCount = categories.length;
          categories = mergeCategories(categories, categoryResult.categories);
          const afterCount = categories.length;
          await chrome.storage.local.set({ categories });
          renderSidebarNav();

        }

        // 拉取书签（有锁操作）
        const bookmarkResult = await bookmarkManager.syncFromTurso();

        // 处理书签
        if (bookmarkResult.success) {
          allBookmarks = bookmarkResult.bookmarks;
          filteredBookmarks = [...allBookmarks];
          updateStats();
          renderBookmarks();
          renderSidebarNav();

        }

        if (bookmarkResult.success && categoryResult.success) {
          const uploadInfo = bookmarkResult.uploaded > 0 ? ` (↑${bookmarkResult.uploaded})` : '';
          if (syncStatus) syncStatus.textContent = `✅ 已拉取 ${allBookmarks.length} 书签${uploadInfo} + ${categories.length} 分类`;
        } else if (bookmarkResult.success) {
          if (syncStatus) syncStatus.textContent = '⚠️ 书签已拉取，分类无数据';
        } else {
          if (syncStatus) syncStatus.textContent = '❌ 拉取失败';
        }
      } catch (error) {
        if (syncStatus) syncStatus.textContent = '❌ 错误: ' + error.message;
      }

      // 释放 UI 锁并恢复按钮
      _uiSyncLock = false;
      syncFromBtn.disabled = false;
      syncToBtn.disabled = false;
      if (syncCatBtn) syncCatBtn.disabled = false;
      syncFromBtn.textContent = '↓ 拉取';
    });
  }

  if (syncToBtn) {
    syncToBtn.addEventListener('click', async () => {
      // 检查 UI 层同步锁
      if (_uiSyncLock) {
        if (syncStatus) syncStatus.textContent = '⏳ 同步中，请稍候...';
        showNotification('⏳ 正在同步中，请等待完成', 'info');
        return;
      }

      // 立即设置 UI 锁
      _uiSyncLock = true;
      syncToBtn.disabled = true;
      syncFromBtn.disabled = true;
      if (syncCatBtn) syncCatBtn.disabled = true;
      syncToBtn.textContent = '...';
      if (syncStatus) syncStatus.textContent = '⏳ 上传中...';

      try {
        // 顺序执行以避免同步锁冲突
        const bookmarkResult = await bookmarkManager.syncToTurso(allBookmarks);
        const categoryResult = await bookmarkManager.saveCategoriesToTurso(categories);

        if (bookmarkResult.success && categoryResult.success) {
          if (syncStatus) syncStatus.textContent = `✅ 已上传 ${allBookmarks.length} 书签 + ${categories.length} 分类`;
        } else if (bookmarkResult.successCount > 0 || categoryResult.success) {
          // 部分成功
          const bookmarkMsg = bookmarkResult.failCount > 0
            ? `书签: ${bookmarkResult.successCount}成功/${bookmarkResult.failCount}失败`
            : `书签: ${bookmarkResult.successCount}成功`;
          const categoryMsg = categoryResult.success ? '分类成功' : '分类失败';

          if (syncStatus) {
            syncStatus.textContent = `⚠️ ${bookmarkMsg}, ${categoryMsg}`;
            syncStatus.title = bookmarkResult.failedItems?.map(f => f.title).join(', ') || '';
          }

          // 显示失败详情
          if (bookmarkResult.failedItems && bookmarkResult.failedItems.length > 0) {
            console.warn('⚠️ 以下书签上传失败:', bookmarkResult.failedItems);
            showNotification(`⚠️ ${bookmarkResult.failCount} 条书签上传失败，将自动重试`, 'warning');
          }
        } else {
          if (syncStatus) syncStatus.textContent = '❌ 上传失败';
        }
      } catch (error) {
        if (syncStatus) syncStatus.textContent = '❌ 错误: ' + error.message;
      }

      syncToBtn.disabled = false;
      syncFromBtn.disabled = false; // 恢复拉取按钮
      syncToBtn.textContent = '↑ 推送';
    });
  }

  // 同步分类按钮
  const syncCatBtn = document.getElementById('syncCategoriesBtn');
  if (syncCatBtn) {
    syncCatBtn.addEventListener('click', async () => {
      if (!bookmarkManager.enabled) {
        alert('请先在设置中配置并启用 Turso 云端同步\n\n当前状态：' + bookmarkManager.getStatusMessage());
        return;
      }

      // 检查是否正在同步中
      if (bookmarkManager.isSyncing()) {
        showNotification('⏳ 正在同步中，请等待完成', 'info');
        return;
      }

      const action = confirm('选择同步方向：\n\n确定 = 上传本地分类到云端\n取消 = 从云端拉取分类到本地');

      syncCatBtn.disabled = true;
      syncFromBtn.disabled = true;
      syncToBtn.disabled = true;
      syncCatBtn.textContent = '⏳ 同步中...';

      try {
        if (action) {
          // 上传到云端
          const result = await bookmarkManager.saveCategoriesToTurso(categories);
          if (result.success) {
            alert('✅ 分类已上传到云端！' + result.message);
          } else {
            alert('❌ 上传失败: ' + result.error);
          }
        } else {
          // 从云端拉取（智能合并，避免覆盖）
          const result = await bookmarkManager.getCategoriesFromTurso();
          if (result.success && result.categories.length > 0) {
            const beforeCount = categories.length;
            categories = mergeCategories(categories, result.categories);
            const afterCount = categories.length;
            await chrome.storage.local.set({ categories });
            renderSidebarNav();
            
            if (afterCount > beforeCount) {
              alert(`✅ 已合并分类：本地${beforeCount}个 + 云端${result.categories.length}个 = 合并后${afterCount}个`);
            } else {
              alert('✅ 已从云端同步 ' + result.categories.length + ' 个分类！');
            }
          } else if (result.categories.length === 0) {
            alert('⚠️ 云端暂无分类数据');
          } else {
            alert('❌ 拉取失败: ' + result.error);
          }
        }
      } catch (error) {
        alert('❌ 同步失败: ' + error.message);
      }

      syncCatBtn.disabled = false;
      syncFromBtn.disabled = false;
      syncToBtn.disabled = false;
      syncCatBtn.textContent = '🔄 同步分类';
    });
  }

}

// 加载收藏
async function loadBookmarks() {
  try {
    // 1. 快速加载本地数据并立即显示
    const localResult = await chrome.storage.local.get(['bookmarks']);
    allBookmarks = localResult.bookmarks || [];
    filteredBookmarks = [...allBookmarks];
    updateStats();
    renderBookmarks();
    renderSidebarNav();

    // 2. 后台异步同步云端数据（不阻塞界面）
    setTimeout(async () => {
      try {
        await bookmarkManager.init();
        if (bookmarkManager.enabled) {
          const syncStatus = document.getElementById('syncStatus');

          // 检查是否正在同步中
          if (bookmarkManager.isSyncing()) {
            if (syncStatus) syncStatus.textContent = '⏳ 等待同步...';
            return;
          }

          if (syncStatus) syncStatus.textContent = '⏳ 同步中...';
          showBackgroundStatus('⏳ 正在同步书签...', 'syncing', 0);

          try {
            const result = await bookmarkManager.syncFromTurso();
            if (result.success && result.bookmarks.length > 0) {
              const localCount = allBookmarks.length;
              const cloudCount = result.bookmarks.length;
              const uploadedCount = result.uploaded || 0;

              allBookmarks = result.bookmarks;
              filteredBookmarks = [...allBookmarks];
              updateStats();
              renderBookmarks();
              renderSidebarNav();

              if (syncStatus) syncStatus.textContent = '☁️ 已同步';

              // 显示详细的同步信息
              if (uploadedCount > 0) {
                showBackgroundStatus(`✅ 已同步 ${cloudCount} 个，↑${uploadedCount} 条`, 'success');
              } else if (cloudCount !== localCount) {
                showBackgroundStatus(`✅ 已同步 ${cloudCount} 个书签`, 'success');
              } else {
                hideBackgroundStatus();
              }
            } else {
              if (syncStatus) syncStatus.textContent = '☁️ 本地最新';
              hideBackgroundStatus();
            }

            // 检查是否有待重试的项目
            const pendingRetries = await bookmarkManager.getPendingRetryCount();
            if (pendingRetries > 0) {
              console.warn(`⚠️ 有 ${pendingRetries} 条待重试的同步项`);
              if (syncStatus) {
                syncStatus.textContent = `☁️ 已同步 (${pendingRetries}项待重试)`;
                syncStatus.title = `有 ${pendingRetries} 条数据同步失败，将在下次启动时自动重试`;
              }
            }
          } catch (syncError) {
            console.warn('⚠️ 云端同步异常:', syncError);
            const syncStatus = document.getElementById('syncStatus');
            if (syncStatus) syncStatus.textContent = '⚠️ 同步失败';
            showBackgroundStatus('⚠️ 书签同步失败', 'warning');
          }
        } else {
          hideBackgroundStatus();
        }
      } catch (initError) {
        console.warn('⚠️ 云端初始化失败:', initError);
        hideBackgroundStatus();
      }
    }, 0);

  } catch (error) {
    console.error('加载收藏失败:', error);
    throw error; // 抛出错误让调用者处理
  }
}

// 筛选收藏
function filterBookmarks() {
  filteredBookmarks = allBookmarks.filter(bookmark => {
    let categoryMatch = false;
    
    if (currentCategory === 'all') {
      categoryMatch = true;
    } else if (currentCategory === 'starred') {
      // 假设收藏夹中有 starred 字段，如果没有则暂不支持，这里预留逻辑
      categoryMatch = bookmark.starred === true;
    } else if (currentCategory === 'recent') {
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const createdAt = new Date(bookmark.createdAt || bookmark.timestamp).getTime();
      categoryMatch = createdAt > oneWeekAgo;
    } else {
      const bookmarkCat = bookmark.category || '其他';
      const categoryName = getCategoryNameById(currentCategory);
      categoryMatch = bookmarkCat === currentCategory || 
                      bookmarkCat === categoryName ||
                      getCategoryIdByName(bookmarkCat) === currentCategory;
    }
    
    // 标签筛选
    let tagMatch = selectedTags.size === 0;
    if (!tagMatch) {
      const summary = bookmark.summary || '';
      const tags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
      tagMatch = Array.from(selectedTags).every(selectedTag => 
        tags.includes(selectedTag) || summary.includes(selectedTag)
      );
    }
    
    const searchMatch = !searchQuery || 
      (bookmark.pageInfo?.title || '').toLowerCase().includes(searchQuery) ||
      (bookmark.pageInfo?.url || '').toLowerCase().includes(searchQuery) ||
      (bookmark.summary || '').toLowerCase().includes(searchQuery) ||
      (bookmark.pageInfo?.description || '').toLowerCase().includes(searchQuery);
    
    return categoryMatch && tagMatch && searchMatch;
  });

  // 应用排序
  sortBookmarks();

  updateStats();
  renderBookmarks();
}

// 排序功能
function sortBookmarks() {
  filteredBookmarks.sort((a, b) => {
    const timeA = new Date(a.createdAt || a.timestamp).getTime();
    const timeB = new Date(b.createdAt || b.timestamp).getTime();
    
    switch (currentSort) {
      case 'newest': return timeB - timeA;
      case 'oldest': return timeA - timeB;
      case 'title': return (a.pageInfo?.title || '').localeCompare(b.pageInfo?.title || '');
      default: return timeB - timeA;
    }
  });
}

// 更新统计
function updateStats() {
  const totalEl = document.getElementById('totalCount');
  const filteredEl = document.getElementById('filteredCount');
  if (totalEl) totalEl.textContent = allBookmarks.length;
  if (filteredEl) filteredEl.textContent = `${filteredBookmarks.length} 条结果`;
}

// 渲染书签
function renderBookmarks() {
  const container = document.getElementById('bookmarksContainer');
  if (!container) return;
  
  // 渲染标签云
  renderTagCloud();
  
  if (filteredBookmarks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="opacity: 0.15;">
          <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <h3 class="empty-title">${allBookmarks.length === 0 ? '暂无收藏' : '没有匹配的结果'}</h3>
        <p class="empty-desc">${allBookmarks.length === 0 ? '开始收集感兴趣的网页吧' : '尝试其他筛选条件'}</p>
      </div>
    `;
    return;
  }

  if (currentView === 'timeline') {
    renderTimeline(container);
  } else {
    // 默认列表视图，grid-view 为网格视图
    const viewClass = currentView === 'grid' ? 'grid-view' : '';
    container.innerHTML = `
      <div class="bookmarks-grid ${viewClass}">
        ${filteredBookmarks.map(b => createBookmarkCard(b)).join('')}
      </div>
    `;
  }

  // 绑定事件
  filteredBookmarks.forEach(bookmark => {
    const deleteBtn = document.getElementById(`delete-${bookmark.id}`);
    const openBtn = document.getElementById(`open-${bookmark.id}`);
    const previewBtn = document.getElementById(`preview-${bookmark.id}`);
    const editCatBtn = document.getElementById(`editcat-${bookmark.id}`);
    const editTagBtn = document.getElementById(`edittag-${bookmark.id}`);
    
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteBookmark(bookmark.id);
      });
    }
    
    if (openBtn) {
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.tabs.create({ url: bookmark.pageInfo.url });
      });
    }

    if (previewBtn) {
      previewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openReader(bookmark.id);
      });
    }

    if (editCatBtn) {
      editCatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editBookmarkCategory(bookmark.id);
      });
    }

    if (editTagBtn) {
      editTagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editBookmarkTags(bookmark.id);
      });
    }
  });
}

// 渲染时间线视图
function renderTimeline(container) {
  // 按日期分组
  const groups = new Map();
  filteredBookmarks.forEach(b => {
    const date = new Date(b.createdAt || b.timestamp).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(b);
  });

  let html = '<div class="timeline-container">';
  for (const [date, items] of groups.entries()) {
    html += `
      <div class="timeline-group">
        <div class="timeline-header">
          <div class="timeline-dot"></div>
          <div class="timeline-date">${date}</div>
        </div>
        <div class="bookmarks-grid">
          ${items.map(b => createBookmarkCard(b)).join('')}
        </div>
      </div>
    `;
  }
  html += '</div>';
  container.innerHTML = html;
}

// 编辑书签分类
let currentEditingBookmarkId = null;

async function editBookmarkCategory(bookmarkId) {
  const bookmark = allBookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) return;

  currentEditingBookmarkId = bookmarkId;
  const currentCat = bookmark.category || '其他';

  // 显示模态框
  const modal = document.getElementById('editCategoryModal');
  const titleEl = document.getElementById('editCategoryBookmarkTitle');
  const categoryList = document.getElementById('editCategoryList');

  // 显示书签标题
  titleEl.textContent = bookmark.pageInfo?.title || '无标题';

  // 收集所有分类选项
  let allCategories = [];
  categories.forEach(cat => {
    allCategories.push({ name: cat.name, icon: cat.icon || '📁', level: 0 });
    if (cat.children) {
      cat.children.forEach(child => {
        allCategories.push({ name: child.name, icon: child.icon || '•', level: 1 });
      });
    }
  });

  // 生成分类选项
  categoryList.innerHTML = allCategories.map(cat => `
    <button class="category-edit-option ${currentCat === cat.name ? 'active' : ''}" 
            data-category="${escapeHtml(cat.name)}"
            style="${cat.level === 1 ? 'padding-left: 8px;' : ''}">
      <span class="category-edit-icon">${cat.icon}</span>
      <span>${escapeHtml(cat.name)}</span>
    </button>
  `).join('');

  // 绑定点击事件
  categoryList.querySelectorAll('.category-edit-option').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const newCategory = btn.dataset.category;
      await updateBookmarkCategoryWithLoading(bookmarkId, newCategory, btn);
    });
  });

  // 显示模态框
  modal.style.display = 'flex';

  // 绑定关闭事件
  const closeBtn = document.getElementById('closeEditCategoryModal');
  const cancelBtn = document.getElementById('cancelEditCategory');
  
  const closeModal = () => {
    modal.style.display = 'none';
    currentEditingBookmarkId = null;
  };

  closeBtn.onclick = closeModal;
  cancelBtn.onclick = closeModal;
  
  // 点击遮罩关闭
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };
}

// 更新书签分类（带loading状态）
async function updateBookmarkCategoryWithLoading(bookmarkId, newCategory, buttonElement) {
  const bookmark = allBookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) return;

  const oldCategory = bookmark.category || '其他';
  const categoryList = document.getElementById('editCategoryList');
  const allButtons = categoryList.querySelectorAll('.category-edit-option');

  // 禁用所有按钮
  allButtons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
  });

  // 在选中的按钮上显示loading
  const originalContent = buttonElement.innerHTML;
  buttonElement.innerHTML = `
    <div class="category-edit-loading">
      <div class="loading-spinner"></div>
      <span style="font-size: 11px;">更新中...</span>
    </div>
  `;

  try {
    // 更新分类
    bookmark.category = newCategory;
    
    // 保存到本地存储（快速完成）
    await chrome.storage.local.set({ bookmarks: allBookmarks });
    
    // 后台异步同步到云端，不阻塞UI
    setTimeout(async () => {
      if (bookmarkManager.enabled) {
        showBackgroundStatus('⏳ 正在同步书签...', 'syncing', 0);
        try {
          const result = await bookmarkManager.updateBookmarkInTurso(bookmark);
          if (result.success) {
            showBackgroundStatus('✅ 书签已同步', 'success');
          } else {
            showBackgroundStatus('⚠️ 书签同步失败', 'warning');
          }
        } catch (e) {
          showBackgroundStatus('⚠️ 书签同步失败', 'warning');
        }
      }
    }, 0);

    // 关闭模态框
    const modal = document.getElementById('editCategoryModal');
    modal.style.display = 'none';
    currentEditingBookmarkId = null;

    // 更新显示
    filterBookmarks();
    renderSidebarNav();

    // 显示成功提示
    const message = oldCategory !== newCategory 
      ? `✅ 分类已从"${oldCategory}"更改为"${newCategory}"`
      : `✅ 分类确认为"${newCategory}"`;
    
    showNotification(message, 'success');

  } catch (error) {
    console.error('更新分类失败:', error);
    showNotification('❌ 更新失败: ' + error.message, 'error');

    // 恢复按钮状态
    buttonElement.innerHTML = originalContent;
    allButtons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  }
}

// 显示后台状态（右下角）
let backgroundStatusTimeout = null;
function showBackgroundStatus(message, type = 'info', duration = 3000) {
  const statusEl = document.getElementById('backgroundStatus');
  const iconEl = statusEl.querySelector('.background-status-icon');
  const textEl = statusEl.querySelector('.background-status-text');
  
  if (!statusEl || !iconEl || !textEl) return;
  
  // 清除之前的定时器
  if (backgroundStatusTimeout) {
    clearTimeout(backgroundStatusTimeout);
  }
  
  // 设置图标
  iconEl.className = 'background-status-icon';
  if (type === 'syncing') {
    iconEl.classList.add('syncing');
  } else if (type === 'success') {
    iconEl.classList.add('success');
  } else if (type === 'warning') {
    iconEl.classList.add('warning');
  }
  
  // 设置文字
  textEl.textContent = message;
  
  // 显示
  statusEl.classList.add('visible');
  
  // 如果设置了持续时间，自动隐藏
  if (duration > 0) {
    backgroundStatusTimeout = setTimeout(() => {
      statusEl.classList.remove('visible');
    }, duration);
  }
}

// 隐藏后台状态
function hideBackgroundStatus() {
  const statusEl = document.getElementById('backgroundStatus');
  if (statusEl) {
    statusEl.classList.remove('visible');
  }
  if (backgroundStatusTimeout) {
    clearTimeout(backgroundStatusTimeout);
    backgroundStatusTimeout = null;
  }
}

// 显示通知
function showNotification(message, type = 'info') {
  // 创建通知元素
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    padding: 14px 20px;
    background: ${type === 'success' ? '#ecfdf5' : type === 'error' ? '#fef2f2' : '#eff6ff'};
    color: ${type === 'success' ? '#059669' : type === 'error' ? '#dc2626' : '#2563eb'};
    border: 1px solid ${type === 'success' ? '#a7f3d0' : type === 'error' ? '#fecaca' : '#bfdbfe'};
    border-radius: 10px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    font-size: 14px;
    font-weight: 600;
    z-index: 10000;
    animation: slideInRight 0.3s ease;
    max-width: 400px;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(400px); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  // 3秒后移除
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => {
      document.body.removeChild(notification);
      document.head.removeChild(style);
    }, 300);
  }, 3000);
}

// 编辑书签标签
async function editBookmarkTags(bookmarkId) {
  const bookmark = allBookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) return;

  const currentTags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
  const tagsStr = currentTags.join(', ');
  
  const newTagsStr = prompt(
    `编辑标签（用逗号或空格分隔）\n\n当前标签：${tagsStr || '暂无'}\n\n提示：可以输入多个标签，例如：技术, 编程, JavaScript`,
    tagsStr
  );
  
  if (newTagsStr !== null) {
    try {
      // 解析标签，支持逗号或空格分隔
      const newTags = newTagsStr
        .split(/[,，、\s]+/)
        .map(tag => tag.trim().replace(/^[#＃]+/, ''))
        .filter(tag => tag.length > 0 && tag.length < 20);
      
      bookmark.tags = newTags;
      await chrome.storage.local.set({ bookmarks: allBookmarks });
      
      // 后台异步同步到云端，不阻塞UI
      setTimeout(async () => {
        if (bookmarkManager.enabled) {
          showBackgroundStatus('⏳ 正在同步标签...', 'syncing', 0);
          try {
            const result = await bookmarkManager.updateBookmarkInTurso(bookmark);
            if (result.success) {
              showBackgroundStatus('✅ 标签已同步', 'success');
            } else {
              showBackgroundStatus('⚠️ 标签同步失败', 'warning');
            }
          } catch (e) {
            showBackgroundStatus('⚠️ 标签同步失败', 'warning');
          }
        }
      }, 0);
      
      filterBookmarks();
      renderTagCloud();
      
      showNotification('✅ 标签已更新', 'success');
      
    } catch (error) {
      console.error('更新标签失败:', error);
      showNotification('❌ 更新失败: ' + error.message, 'error');
    }
  }
}

// 创建书签卡片 - Landing Page Mockup 风格
function createBookmarkCard(bookmark) {
  const title = bookmark.pageInfo?.title || '无标题';
  const url = bookmark.pageInfo?.url || '';
  const domain = bookmark.pageInfo?.domain || (url ? new URL(url).hostname : '');
  const summary = bookmark.summary || bookmark.pageInfo?.description || '暂无摘要内容';
  const category = bookmark.category || '其他';
  const screenshot = bookmark.screenshot || '';

  // 计算时间显示
  const createdAt = new Date(bookmark.createdAt || bookmark.timestamp);
  const now = new Date();
  const diffMs = now - createdAt;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let dateText;
  let isNew = false;
  if (diffMins < 5) {
    dateText = '刚刚添加';
    isNew = true;
  } else if (diffMins < 60) {
    dateText = `${diffMins}分钟前`;
  } else if (diffHours < 24) {
    dateText = `${diffHours}小时前`;
  } else if (diffDays < 7) {
    dateText = `${diffDays}天前`;
  } else {
    dateText = createdAt.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric'
    });
  }

  // 获取标签
  const tags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
  const tagsHtml = tags.length > 0 ? `
    <div class="card-tags">
      ${tags.slice(0, 3).map(tag => `<span class="card-tag">#${escapeHtml(tag)}</span>`).join('')}
      ${tags.length > 3 ? `<span class="card-tag">+${tags.length - 3}</span>` : ''}
    </div>
  ` : '';

  // 缩略图背景颜色 - 根据分类生成温暖的颜色
  const categoryColors = {
    '工具': 'linear-gradient(135deg, rgba(201, 136, 90, 0.15) 0%, rgba(212, 165, 116, 0.2) 100%)',
    '开发': 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    '设计': 'linear-gradient(135deg, #dbeafe 0%, #93c5fd 100%)',
    '阅读': 'linear-gradient(135deg, #dcfce7 0%, #86efac 100%)',
    '资讯': 'linear-gradient(135deg, #fce7f3 0%, #f9a8d4 100%)',
    '视频': 'linear-gradient(135deg, #fee2e2 0%, #fca5a5 100%)',
    '其他': 'linear-gradient(135deg, #f0ebe6 0%, #e8e4df 100%)'
  };
  const thumbBg = categoryColors[category] || categoryColors['其他'];

  return `
    <article class="bookmark-card${isNew ? ' bookmark-new' : ''}">
      <div class="card-thumb" style="background: ${thumbBg};">
        ${screenshot
          ? `<img src="${screenshot}" alt="${escapeHtml(title)}" loading="lazy">`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>`
        }
      </div>
      <div class="card-info">
        <h3 class="card-title" title="${escapeHtml(title)}">${escapeHtml(title)}</h3>
        <p class="card-summary">${escapeHtml(summary)}</p>
        ${tagsHtml}
        <div class="card-meta">
          <span class="card-category" id="editcat-${bookmark.id}">${category}</span>
          <span class="card-date${isNew ? ' new-badge' : ''}">${dateText}</span>
          <div class="card-actions">
            <button class="btn-icon" id="preview-${bookmark.id}" title="快速预览">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" style="width: 16px; height: 16px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
            <button class="btn-icon" id="open-${bookmark.id}" title="访问网页">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </button>
            <button class="btn-icon" id="edittag-${bookmark.id}" title="编辑标签">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6Z" />
              </svg>
            </button>
            <button class="btn-icon delete" id="delete-${bookmark.id}" title="永久删除">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px;">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}

// 删除书签
async function deleteBookmark(id) {
  if (!confirm('确定删除此收藏？')) return;

  // 禁用删除按钮
  const deleteBtn = document.getElementById(`delete-${id}`);
  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.style.opacity = '0.5';
  }

  try {
    allBookmarks = allBookmarks.filter(b => b.id !== id);
    await chrome.storage.local.set({ bookmarks: allBookmarks });

    // 后台异步同步删除到云端，不阻塞UI
    setTimeout(async () => {
      if (bookmarkManager.enabled) {
        showBackgroundStatus('⏳ 正在同步删除...', 'syncing', 0);
        try {
          const result = await bookmarkManager.deleteFromTurso(id);
          if (result.success) {
            showBackgroundStatus('✅ 删除已同步', 'success');
          } else {
            // 删除失败，会自动加入重试队列
            showBackgroundStatus('⚠️ 删除同步失败，稍后重试', 'warning');

            // 更新同步状态显示
            const syncStatus = document.getElementById('syncStatus');
            const pendingRetries = await bookmarkManager.getPendingRetryCount();
            if (syncStatus && pendingRetries > 0) {
              syncStatus.textContent = `☁️ 已连接 (${pendingRetries}项待重试)`;
              syncStatus.title = '有待重试的同步项，将自动重试';
            }
          }
        } catch (e) {
          showBackgroundStatus('⚠️ 删除同步失败，稍后重试', 'warning');
        }
      }
    }, 0);

    filterBookmarks();
    renderSidebarNav();

    showNotification('✅ 收藏已删除', 'success');

  } catch (error) {
    console.error('删除失败:', error);
    showNotification('❌ 删除失败: ' + error.message, 'error');

    // 恢复按钮状态
    if (deleteBtn) {
      deleteBtn.disabled = false;
      deleteBtn.style.opacity = '1';
    }
  }
}

// HTML转义
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 重新分类
async function reclassifyAllBookmarks() {
  if (!confirm('重新根据内容计算所有收藏的分类？\n\n这可能需要一些时间...')) return;

  const reclassifyBtn = document.getElementById('reclassifyBtn');
  
  // 禁用按钮并显示loading
  const originalContent = reclassifyBtn ? reclassifyBtn.innerHTML : '';
  if (reclassifyBtn) {
    reclassifyBtn.disabled = true;
    reclassifyBtn.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 6px;">
        <div class="loading-spinner" style="border-color: currentColor; border-top-color: transparent;"></div>
        <span>重新分类中...</span>
      </div>
    `;
  }

  showNotification('⏳ 正在重新分类所有收藏...', 'info');

  try {
  let updated = 0;
    const total = allBookmarks.length;
  
    for (let i = 0; i < allBookmarks.length; i++) {
      const bookmark = allBookmarks[i];
    const oldCategory = bookmark.category;
    const newCategory = classifyBookmark(bookmark);
    
    if (newCategory !== oldCategory) {
      bookmark.category = newCategory;
      updated++;
    }
      
      // 每处理10个更新一次进度
      if ((i + 1) % 10 === 0 || i === allBookmarks.length - 1) {
        showNotification(`⏳ 正在处理... ${i + 1}/${total}`, 'info');
    }
  }

  await chrome.storage.local.set({ bookmarks: allBookmarks });
    
    // 同步到云端
    if (bookmarkManager.enabled && updated > 0) {
      try {
        await bookmarkManager.syncToTurso(allBookmarks);
      } catch (e) {
        console.warn('云端同步失败:', e);
      }
    }
    
  filterBookmarks();
  renderSidebarNav();
    
    showNotification(`✅ 完成！更新了 ${updated} 条收藏的分类`, 'success');
    
  } catch (error) {
    console.error('重新分类失败:', error);
    showNotification('❌ 重新分类失败: ' + error.message, 'error');
  } finally {
    // 恢复按钮状态
    if (reclassifyBtn && originalContent) {
      reclassifyBtn.disabled = false;
      reclassifyBtn.innerHTML = originalContent;
    }
  }
}

// 分类算法
function classifyBookmark(bookmark) {
  const title = (bookmark.pageInfo?.title || '').toLowerCase();
  const description = (bookmark.pageInfo?.description || '').toLowerCase();
  const summary = (bookmark.summary || '').toLowerCase();
  const domain = (bookmark.pageInfo?.domain || '').toLowerCase();
  const url = (bookmark.pageInfo?.url || '').toLowerCase();
  
  const allText = `${title} ${description} ${summary} ${domain} ${url}`;
  
  if (/(技术|工具|开发|编程|代码|api|sdk|github|developer|software|code|programming|dev)/i.test(allText)) {
    return '技术工具';
  }
  if (/(学习|教育|课程|教程|培训|知识|教学|study|learn|course|tutorial|education)/i.test(allText)) {
    return '学习资源';
  }
  if (/(新闻|资讯|报道|消息|时事|news|article|report|media)/i.test(allText)) {
    return '新闻资讯';
  }
  if (/(娱乐|游戏|视频|音乐|电影|entertainment|game|video|music|movie|youtube|bilibili)/i.test(allText)) {
    return '娱乐休闲';
  }
  if (/(商业|企业|公司|商务|business|company|enterprise)/i.test(allText)) {
    return '商业服务';
  }
  if (/(设计|创意|艺术|design|creative|art|ui|ux|figma|dribbble)/i.test(allText)) {
    return '设计创意';
  }
  if (/(生活|购物|美食|旅游|健康|life|shopping|food|travel|health)/i.test(allText)) {
    return '生活服务';
  }
  
  return '其他';
}

// 显示错误
function showError(message) {
  const container = document.getElementById('bookmarksContainer');
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">❌</div>
      <h3 class="empty-title">出错了</h3>
      <p class="empty-desc">${message}</p>
    </div>
  `;
}

// 暴露给HTML
window.reclassifyAllBookmarks = reclassifyAllBookmarks;


