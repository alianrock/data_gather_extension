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
    dataApiUrl: '',
    dataApiKey: '',
    dataApiMethod: 'POST'
  });

  document.getElementById('aiProvider').value = settings.aiProvider;
  document.getElementById('aiApiUrl').value = settings.aiApiUrl;
  document.getElementById('aiApiKey').value = settings.aiApiKey;
  document.getElementById('aiModel').value = settings.aiModel;
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

// 显示测试结果
function showTestResult(message, type, details = '') {
  const testResultDiv = document.getElementById('testResult');
  testResultDiv.innerHTML = message + (details ? `<br><small style="margin-top: 5px; display: block;">${details}</small>` : '');
  testResultDiv.className = `status ${type}`;
  testResultDiv.style.display = 'block';
}

// 测试AI API连接
async function testAIAPI() {
  const testBtn = document.getElementById('testAiBtn');
  const originalText = testBtn.textContent;

  // 获取当前表单的值（未保存的也可以测试）
  const provider = document.getElementById('aiProvider').value;
  const apiUrl = document.getElementById('aiApiUrl').value.trim();
  const apiKey = document.getElementById('aiApiKey').value.trim();
  const model = document.getElementById('aiModel').value.trim();

  // 验证必填字段
  if (!apiUrl) {
    showTestResult('❌ 请填写AI API URL', 'error');
    return;
  }

  if (!apiKey) {
    showTestResult('❌ 请填写AI API Key', 'error');
    return;
  }

  try {
    // 禁用按钮并显示加载状态
    testBtn.disabled = true;
    testBtn.textContent = '⏳ 测试中...';
    showTestResult('⏳ 正在测试API连接...', 'info');

    // 测试提示词
    const testPrompt = '请用一句话回复：AI API测试成功';

    let response;
    let result;

    if (provider === 'anthropic') {
      // Anthropic API测试
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-sonnet-20241022',
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: testPrompt
          }]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API错误 (${response.status}): ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      result = data.content[0].text;

    } else {
      // OpenAI或兼容API测试
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: testPrompt
          }],
          max_tokens: 100
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API错误 (${response.status}): ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      result = data.choices[0].message.content;
    }

    // 显示成功结果
    showTestResult(
      '✅ AI API连接成功！',
      'success',
      `模型: ${model || '默认'}<br>响应: ${result}`
    );

  } catch (error) {
    console.error('AI API测试失败:', error);
    showTestResult(
      '❌ AI API测试失败',
      'error',
      error.message
    );
  } finally {
    // 恢复按钮状态
    testBtn.disabled = false;
    testBtn.textContent = originalText;
  }
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

// 测试AI API按钮点击事件
document.getElementById('testAiBtn').addEventListener('click', testAIAPI);

// 页面加载时加载设置
document.addEventListener('DOMContentLoaded', loadSettings);
