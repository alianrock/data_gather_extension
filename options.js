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

// 加载保存的配置
async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    aiProvider: 'openai',
    aiApiUrl: API_PRESETS.openai.url,
    aiApiKey: '',
    aiModel: API_PRESETS.openai.model,
    summaryLanguage: 'zh-CN',
    summaryStyle: 'social',
    dataApiUrl: '',
    dataApiKey: '',
    dataApiMethod: 'POST'
  });

  document.getElementById('aiProvider').value = settings.aiProvider;
  document.getElementById('aiApiUrl').value = settings.aiApiUrl;
  document.getElementById('aiApiKey').value = settings.aiApiKey;
  document.getElementById('aiModel').value = settings.aiModel;
  document.getElementById('summaryLanguage').value = settings.summaryLanguage;
  document.getElementById('summaryStyle').value = settings.summaryStyle;
  document.getElementById('dataApiUrl').value = settings.dataApiUrl;
  document.getElementById('dataApiKey').value = settings.dataApiKey;
  document.getElementById('dataApiMethod').value = settings.dataApiMethod;
}

// 保存配置
async function saveSettings() {
  const settings = {
    aiProvider: document.getElementById('aiProvider').value,
    aiApiUrl: document.getElementById('aiApiUrl').value.trim(),
    aiApiKey: document.getElementById('aiApiKey').value.trim(),
    aiModel: document.getElementById('aiModel').value.trim(),
    summaryLanguage: document.getElementById('summaryLanguage').value,
    summaryStyle: document.getElementById('summaryStyle').value,
    dataApiUrl: document.getElementById('dataApiUrl').value.trim(),
    dataApiKey: document.getElementById('dataApiKey').value.trim(),
    dataApiMethod: document.getElementById('dataApiMethod').value
  };

  // 验证必填字段
  if (!settings.aiApiUrl || !settings.aiApiKey) {
    showStatus('请填写AI API URL和API Key', 'error');
    return;
  }

  try {
    await chrome.storage.sync.set(settings);
    showStatus('设置保存成功！', 'success');
  } catch (error) {
    showStatus('保存失败: ' + error.message, 'error');
  }
}

// 显示状态消息
function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;

  setTimeout(() => {
    statusDiv.className = 'status';
  }, 3000);
}

// AI提供商变化时更新预设
document.getElementById('aiProvider').addEventListener('change', (e) => {
  const provider = e.target.value;
  const preset = API_PRESETS[provider];

  if (provider !== 'custom') {
    document.getElementById('aiApiUrl').value = preset.url;
    document.getElementById('aiModel').value = preset.model;
  }
});

// 保存按钮点击事件
document.getElementById('saveBtn').addEventListener('click', saveSettings);

// 页面加载时加载设置
document.addEventListener('DOMContentLoaded', loadSettings);
