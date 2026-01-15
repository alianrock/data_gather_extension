// 预设的API配置
const API_PRESETS = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini'
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-sonnet-20241022'
  },
  custom: {
    url: '',
    model: ''
  }
};

// 辅助函数：安全地获取元素值
const getElValue = (id) => {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
};

// 辅助函数：安全地获取复选框状态
const getElChecked = (id) => {
  const el = document.getElementById(id);
  return el ? el.checked : false;
};

// 状态显示和主题应用
function applyTheme(theme) {
  document.body.className = theme === 'default' ? '' : `theme-${theme}`;
}

// 加载保存的配置
async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    aiProvider: 'openai',
    aiApiUrl: API_PRESETS.openai.url,
    aiApiKey: '',
    aiModel: API_PRESETS.openai.model,
    summaryLanguage: 'zh-CN',
    summaryStyle: 'social',
    theme: 'default',
    dataApiUrl: '',
    dataApiKey: '',
    dataApiMethod: 'POST',
    tursoEnabled: false,
    tursoDbUrl: '',
    tursoAuthToken: ''
  });

  // 应用主题
  applyTheme(settings.theme);

  // 安全地回填数据
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  const setChecked = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };

  setVal('aiProvider', settings.aiProvider);
  setVal('aiApiUrl', settings.aiApiUrl);
  setVal('aiApiKey', settings.aiApiKey);
  setVal('aiModel', settings.aiModel);
  setVal('summaryLanguage', settings.summaryLanguage);
  setVal('summaryStyle', settings.summaryStyle);
  setVal('theme', settings.theme);
  setVal('dataApiUrl', settings.dataApiUrl);
  setVal('dataApiKey', settings.dataApiKey);
  setChecked('tursoEnabled', settings.tursoEnabled);
  setVal('tursoDbUrl', settings.tursoDbUrl);
  setVal('tursoAuthToken', settings.tursoAuthToken);
}

// 保存配置
async function saveSettings() {
  const settings = {
    aiProvider: getElValue('aiProvider') || 'openai',
    aiApiUrl: getElValue('aiApiUrl'),
    aiApiKey: getElValue('aiApiKey'),
    aiModel: getElValue('aiModel'),
    summaryLanguage: getElValue('summaryLanguage') || 'zh-CN',
    summaryStyle: getElValue('summaryStyle') || 'social',
    theme: getElValue('theme') || 'default',
    dataApiUrl: getElValue('dataApiUrl'),
    dataApiKey: getElValue('dataApiKey'),
    dataApiMethod: 'POST', // 默认使用 POST
    tursoEnabled: getElChecked('tursoEnabled'),
    tursoDbUrl: getElValue('tursoDbUrl'),
    tursoAuthToken: getElValue('tursoAuthToken')
  };

  // 验证逻辑
  if (settings.tursoEnabled && (!settings.tursoDbUrl || !settings.tursoAuthToken)) {
    showStatus('启用 Turso 同步需要填写数据库 URL 和 Auth Token', 'error');
    return;
  }

  try {
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '正在保存...';
    }

    await chrome.storage.sync.set(settings);

    // 立即应用主题
    applyTheme(settings.theme);
    
    showStatus('设置已成功保存！✨', 'success');

    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存所有更改';
    }
  } catch (error) {
    console.error('保存设置失败:', error);
    showStatus('保存失败: ' + error.message, 'error');
    
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存所有更改';
    }
  }
}

// 显示状态消息
function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  if (!statusDiv) return;

  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';

  // 4秒后自动消失
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 4000);
}

// 执行 Turso 查询
async function executeTursoQuery(dbUrl, authToken, sql, args = []) {
  try {
    const httpUrl = dbUrl.replace('libsql://', 'https://');
    const response = await fetch(httpUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        statements: [{ q: sql, params: args }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    
    // 检查是否有 SQL 错误
    if (data[0] && data[0].error) {
      return { success: false, error: data[0].error.message };
    }
    
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  // 安全绑定事件
  const bindEvent = (id, event, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
  };

  bindEvent('saveBtn', 'click', saveSettings);
  
  bindEvent('theme', 'change', (e) => {
    const theme = e.target.value;
    applyTheme(theme);
    // 立即保存主题设置，不影响其他设置
    chrome.storage.sync.set({ theme });
  });
  
  bindEvent('aiProvider', 'change', (e) => {
    const provider = e.target.value;
    const preset = API_PRESETS[provider];
    if (provider !== 'custom' && preset) {
      const urlEl = document.getElementById('aiApiUrl');
      const modelEl = document.getElementById('aiModel');
      if (urlEl) urlEl.value = preset.url;
      if (modelEl) modelEl.value = preset.model;
    }
  });

  bindEvent('tursoEnabled', 'change', (e) => {
    if (e.target.checked) {
      showStatus('请填写数据库配置后点击"保存设置"', 'info');
    }
  });

  bindEvent('testTursoBtn', 'click', async () => {
    const tursoDbUrl = getElValue('tursoDbUrl');
    const tursoAuthToken = getElValue('tursoAuthToken');
    const statusDiv = document.getElementById('tursoStatus');

    if (!tursoDbUrl || !tursoAuthToken) {
      if (statusDiv) {
        statusDiv.textContent = '❌ 请先填写 Turso 数据库 URL 和 Auth Token';
        statusDiv.style.color = 'var(--danger)';
      }
      return;
    }

    if (statusDiv) {
      statusDiv.textContent = '⏳ 正在测试连接...';
      statusDiv.style.color = 'var(--text-muted)';
    }

    try {
      const result = await executeTursoQuery(tursoDbUrl, tursoAuthToken, 'SELECT 1 as test');
      if (statusDiv) {
        if (result.success) {
          statusDiv.textContent = '✅ 连接成功！数据库通信正常 (记得点击底部的"保存所有更改")';
          statusDiv.style.color = 'var(--success)';
        } else {
          statusDiv.textContent = '❌ 连接失败: ' + result.error;
          statusDiv.style.color = 'var(--danger)';
        }
      }
    } catch (error) {
      if (statusDiv) {
        statusDiv.textContent = '❌ 发生异常: ' + error.message;
        statusDiv.style.color = 'var(--danger)';
      }
    }
  });

  bindEvent('initTursoBtn', 'click', async () => {
    const tursoDbUrl = getElValue('tursoDbUrl');
    const tursoAuthToken = getElValue('tursoAuthToken');
    const statusDiv = document.getElementById('tursoStatus');

    if (!tursoDbUrl || !tursoAuthToken) {
      alert('请先填写 Turso 配置');
      return;
    }

    if (!confirm('这将在云端数据库中创建必要的表结构（bookmarks 和 categories）。如果表已存在则跳过。确认继续？')) {
      return;
    }

    if (statusDiv) {
      statusDiv.textContent = '⏳ 正在初始化表结构...';
      statusDiv.style.color = 'var(--warning)';
    }

    try {
      // 创建 bookmarks 表
      const createBookmarksSQL = `
        CREATE TABLE IF NOT EXISTS bookmarks (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          title TEXT,
          description TEXT,
          summary TEXT,
          category TEXT DEFAULT '其他',
          tags TEXT,
          screenshot TEXT,
          domain TEXT,
          created_at TEXT,
          updated_at TEXT
        )
      `;
      
      // 创建 categories 表
      const createCategoriesSQL = `
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          icon TEXT DEFAULT '📁',
          parent_id TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT,
          updated_at TEXT
        )
      `;
      
      const result1 = await executeTursoQuery(tursoDbUrl, tursoAuthToken, createBookmarksSQL);
      const result2 = await executeTursoQuery(tursoDbUrl, tursoAuthToken, createCategoriesSQL);
      
      // 尝试为旧表添加 tags 字段 (如果不存在)
      try {
        await executeTursoQuery(tursoDbUrl, tursoAuthToken, 'ALTER TABLE bookmarks ADD COLUMN tags TEXT');
      } catch (e) {
        // 如果字段已存在，会报错，这里直接忽略
      }
      
      if (statusDiv) {
        if (result1.success && result2.success) {
          statusDiv.textContent = '✅ 初始化成功！bookmarks 和 categories 表已创建';
          statusDiv.style.color = 'var(--success)';
        } else {
          const errors = [];
          if (!result1.success) errors.push('bookmarks: ' + result1.error);
          if (!result2.success) errors.push('categories: ' + result2.error);
          statusDiv.textContent = '❌ 初始化失败: ' + errors.join('; ');
          statusDiv.style.color = 'var(--danger)';
        }
      }
    } catch (error) {
      if (statusDiv) {
        statusDiv.textContent = '❌ 初始化发生异常: ' + error.message;
        statusDiv.style.color = 'var(--danger)';
      }
    }
  });
});
