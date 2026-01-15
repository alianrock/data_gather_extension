// Turso 数据库 HTTP API 封装

class TursoClient {
  constructor(dbUrl, authToken) {
    // 将 libsql:// 转换为 https://
    this.httpUrl = dbUrl.replace('libsql://', 'https://');
    this.authToken = authToken;
  }

  // 执行单条 SQL 语句
  async execute(sql, params = []) {
    try {
      const response = await fetch(this.httpUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          statements: [
            {
              q: sql,
              params: params
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // 检查是否有错误
      if (data[0] && data[0].error) {
        console.error('Turso SQL 错误详情:', data[0].error);
        throw new Error(data[0].error.message || 'SQL 执行失败');
      }

      return {
        success: true,
        rows: data[0]?.results?.rows || [],
        columns: data[0]?.results?.columns || [],
        rowsAffected: data[0]?.results?.rows_affected || 0
      };
    } catch (error) {
      console.error('Turso 执行失败:', error);
      return {
        success: false,
        error: error.message,
        rows: [],
        columns: []
      };
    }
  }

  // 执行多条 SQL 语句（事务）
  async batch(statements) {
    try {
      const formattedStatements = statements.map(stmt => {
        if (typeof stmt === 'string') {
          return { q: stmt, params: [] };
        }
        return { q: stmt.sql, params: stmt.params || [] };
      });

      const response = await fetch(this.httpUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          statements: formattedStatements
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      // 检查批量执行中是否有任何错误
      const errors = data.filter(result => result.error);
      if (errors.length > 0) {
        console.error('Turso 批量执行部分失败:', errors);
        return {
          success: false,
          error: errors.map(e => e.error.message).join('; '),
          results: data
        };
      }

      return { success: true, results: data };
    } catch (error) {
      console.error('Turso 批量执行失败:', error);
      return { success: false, error: error.message };
    }
  }
}

// 收藏数据管理
class BookmarkManager {
  constructor() {
    this.client = null;
    this.enabled = false;
    // 同步锁，防止并发同步
    this._syncLock = false;
    this._syncQueue = [];
    // 失败重试队列
    this._retryQueue = [];
    this._maxRetries = 3;
  }

  // 初始化
  async init() {
    const settings = await chrome.storage.sync.get({
      tursoEnabled: false,
      tursoDbUrl: '',
      tursoAuthToken: ''
    });

    this.settings = settings;
    this.enabled = settings.tursoEnabled && settings.tursoDbUrl && settings.tursoAuthToken;

    if (this.enabled) {
      this.client = new TursoClient(settings.tursoDbUrl, settings.tursoAuthToken);
      // 初始化时尝试处理重试队列
      this._processRetryQueue();
    }

    return this.enabled;
  }

  // 获取配置状态信息
  getStatusMessage() {
    if (!this.settings) {
      return '配置未加载';
    }

    const hasUrl = !!this.settings.tursoDbUrl;
    const hasToken = !!this.settings.tursoAuthToken;
    const isEnabled = this.settings.tursoEnabled;

    if (!isEnabled && hasUrl && hasToken) {
      return '云端配置已填写，但未勾选"启用"';
    }
    if (!isEnabled) {
      return '未开启云端同步';
    }
    if (!hasUrl) {
      return '未填写数据库 URL';
    }
    if (!hasToken) {
      return '未填写 Auth Token';
    }
    return '已启用';
  }

  // ============ 同步锁机制 ============

  // 获取同步锁
  async _acquireLock(operation) {
    if (this._syncLock) {
      return new Promise((resolve) => {
        this._syncQueue.push({ operation, resolve });
      });
    }
    this._syncLock = true;
    return true;
  }

  // 释放同步锁
  _releaseLock(operation) {
    this._syncLock = false;

    // 处理队列中的下一个操作
    if (this._syncQueue.length > 0) {
      const next = this._syncQueue.shift();
      next.resolve(true);
    }
  }

  // ============ 重试队列机制 ============

  // 添加到重试队列
  _addToRetryQueue(type, data) {
    const existingIndex = this._retryQueue.findIndex(
      item => item.type === type && item.data.id === data.id
    );

    if (existingIndex >= 0) {
      // 更新重试次数
      this._retryQueue[existingIndex].retries++;
    } else {
      this._retryQueue.push({
        type,
        data,
        retries: 1,
        timestamp: Date.now()
      });
    }

    // 持久化重试队列
    this._saveRetryQueue();
  }

  // 保存重试队列到本地存储
  async _saveRetryQueue() {
    try {
      await chrome.storage.local.set({ _tursoRetryQueue: this._retryQueue });
    } catch (e) {
      console.warn('保存重试队列失败:', e);
    }
  }

  // 加载重试队列
  async _loadRetryQueue() {
    try {
      const data = await chrome.storage.local.get(['_tursoRetryQueue']);
      this._retryQueue = data._tursoRetryQueue || [];
    } catch (e) {
      this._retryQueue = [];
    }
  }

  // 处理重试队列
  async _processRetryQueue() {
    await this._loadRetryQueue();

    if (this._retryQueue.length === 0) return;

    const toRemove = [];

    for (let i = 0; i < this._retryQueue.length; i++) {
      const item = this._retryQueue[i];

      if (item.retries >= this._maxRetries) {
        console.warn(`❌ 重试次数超限，放弃: ${item.type} - ${item.data.id}`);
        toRemove.push(i);
        continue;
      }

      let success = false;

      try {
        switch (item.type) {
          case 'delete':
            const deleteResult = await this.deleteFromTurso(item.data.id, true);
            success = deleteResult.success;
            break;
          case 'save':
            const saveResult = await this.saveToTurso(item.data, true);
            success = saveResult.success;
            break;
        }
      } catch (e) {
        console.warn(`重试失败: ${item.type}`, e);
      }

      if (success) {
        toRemove.push(i);
      }
    }

    // 移除成功的项
    this._retryQueue = this._retryQueue.filter((_, i) => !toRemove.includes(i));
    await this._saveRetryQueue();
  }

  // ============ 书签相关方法 ============

  // 保存收藏到 Turso
  async saveToTurso(bookmark, isRetry = false) {
    if (!this.enabled || !this.client) {
      return { success: false, error: 'Turso 未启用' };
    }

    const sql = `
      INSERT INTO bookmarks (id, url, title, description, summary, category, tags, screenshot, domain, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        summary = excluded.summary,
        category = excluded.category,
        tags = excluded.tags,
        screenshot = excluded.screenshot,
        updated_at = excluded.updated_at
    `;

    const params = [
      bookmark.id,
      bookmark.pageInfo?.url || '',
      bookmark.pageInfo?.title || '',
      bookmark.pageInfo?.description || '',
      bookmark.summary || '',
      bookmark.category || '其他',
      Array.isArray(bookmark.tags) ? JSON.stringify(bookmark.tags) : (bookmark.tags || '[]'),
      '', // 不保存 screenshot 到数据库（太大），只保存本地
      bookmark.pageInfo?.domain || '',
      bookmark.createdAt || new Date().toISOString(),
      bookmark.updatedAt || new Date().toISOString()
    ];

    const result = await this.client.execute(sql, params);

    // 如果失败且不是重试，加入重试队列
    if (!result.success && !isRetry) {
      this._addToRetryQueue('save', bookmark);
    }

    return result;
  }

  // 更新书签到 Turso（单条更新）
  async updateBookmarkInTurso(bookmark) {
    return await this.saveToTurso(bookmark);
  }

  // 从 Turso 获取所有收藏
  async getAllFromTurso() {
    if (!this.enabled || !this.client) {
      return { success: false, error: 'Turso 未启用', rows: [] };
    }

    const sql = 'SELECT * FROM bookmarks ORDER BY created_at DESC';
    const result = await this.client.execute(sql);

    if (result.success && result.rows) {
      // 转换为应用使用的格式
      const bookmarks = result.rows.map(row => this.rowToBookmark(row, result.columns));
      return { success: true, bookmarks };
    }

    return { success: false, error: result.error, bookmarks: [] };
  }

  // 将数据库行转换为收藏对象
  rowToBookmark(row, columns) {
    const obj = {};
    columns.forEach((col, index) => {
      obj[col] = row[index];
    });

    return {
      id: obj.id,
      pageInfo: {
        url: obj.url,
        title: obj.title,
        description: obj.description,
        domain: obj.domain
      },
      summary: obj.summary,
      category: obj.category,
      tags: (() => {
        try {
          return obj.tags ? JSON.parse(obj.tags) : [];
        } catch (e) {
          console.error('解析标签失败:', e);
          return [];
        }
      })(),
      screenshot: obj.screenshot || '',
      createdAt: obj.created_at,
      updatedAt: obj.updated_at,
      timestamp: obj.created_at
    };
  }

  // 从 Turso 删除收藏
  async deleteFromTurso(id, isRetry = false) {
    if (!this.enabled || !this.client) {
      return { success: false, error: 'Turso 未启用' };
    }

    const sql = 'DELETE FROM bookmarks WHERE id = ?';
    const result = await this.client.execute(sql, [id]);

    // 如果失败且不是重试，加入重试队列
    if (!result.success && !isRetry) {
      this._addToRetryQueue('delete', { id });
    }

    return result;
  }

  // 同步本地收藏到 Turso（带失败追踪）
  async syncToTurso(localBookmarks) {
    if (!this.enabled || !this.client) {
      return { success: false, error: 'Turso 未启用' };
    }

    // 获取同步锁
    await this._acquireLock('syncToTurso');

    try {
      let successCount = 0;
      let failCount = 0;
      const failedItems = [];

      for (const bookmark of localBookmarks) {
        const result = await this.saveToTurso(bookmark);
        if (result.success) {
          successCount++;
        } else {
          failCount++;
          failedItems.push({
            id: bookmark.id,
            title: bookmark.pageInfo?.title || '未知',
            error: result.error
          });
          console.error('同步收藏失败:', bookmark.id, result.error);
        }
      }

      return {
        success: failCount === 0,
        successCount,
        failCount,
        failedItems,
        message: `同步完成: ${successCount} 成功, ${failCount} 失败`
      };
    } finally {
      this._releaseLock('syncToTurso');
    }
  }

  // 从 Turso 同步到本地（基于 updated_at 智能合并）
  async syncFromTurso() {
    // 获取同步锁
    await this._acquireLock('syncFromTurso');

    try {
      const result = await this.getAllFromTurso();

      if (!result.success) {
        return result;
      }

      // 获取本地收藏
      const localData = await chrome.storage.local.get(['bookmarks']);
      const localBookmarks = localData.bookmarks || [];

      // 智能合并数据（基于 updated_at 比较）
      const mergedBookmarks = [];
      const localMap = new Map(localBookmarks.map(b => [b.id, b]));
      const cloudMap = new Map(result.bookmarks.map(b => [b.id, b]));

      // 需要上传到云端的本地修改
      const toUpload = [];

      // 处理云端存在的书签
      for (const cloudBookmark of result.bookmarks) {
        const localBookmark = localMap.get(cloudBookmark.id);

        if (localBookmark) {
          // 两端都存在，基于 updated_at 比较
          const localTime = new Date(localBookmark.updatedAt || localBookmark.createdAt || 0).getTime();
          const cloudTime = new Date(cloudBookmark.updatedAt || cloudBookmark.createdAt || 0).getTime();

          if (localTime > cloudTime) {
            // 本地更新，保留本地版本并标记需要上传
            mergedBookmarks.push(localBookmark);
            toUpload.push(localBookmark);
          } else {
            // 云端更新或相同，使用云端版本但保留本地 screenshot
            const merged = {
              ...cloudBookmark,
              screenshot: localBookmark.screenshot || cloudBookmark.screenshot
            };
            mergedBookmarks.push(merged);
          }

          localMap.delete(cloudBookmark.id);
        } else {
          // 仅云端存在
          mergedBookmarks.push(cloudBookmark);
        }
      }

      // 添加仅存在于本地的收藏（新添加的）
      for (const [id, bookmark] of localMap) {
        mergedBookmarks.push(bookmark);
        toUpload.push(bookmark);
      }

      // 按时间排序
      mergedBookmarks.sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || 0);
        const timeB = new Date(b.createdAt || b.timestamp || 0);
        return timeB - timeA;
      });

      // 保存到本地
      await chrome.storage.local.set({ bookmarks: mergedBookmarks });

      // 后台上传本地较新的数据到云端
      if (toUpload.length > 0) {
        setTimeout(async () => {
          for (const bookmark of toUpload) {
            await this.saveToTurso(bookmark);
          }
        }, 100);
      }

      return {
        success: true,
        bookmarks: mergedBookmarks,
        uploaded: toUpload.length,
        message: `同步完成，共 ${mergedBookmarks.length} 条收藏${toUpload.length > 0 ? `，${toUpload.length} 条已上传` : ''}`
      };
    } finally {
      this._releaseLock('syncFromTurso');
    }
  }

  // ============ 分类相关方法 ============

  // 保存分类到 Turso（使用 UPSERT 替代 DELETE + INSERT）
  async saveCategoriesToTurso(categories) {
    if (!this.enabled || !this.client) {
      return { success: false, error: 'Turso 未启用' };
    }

    // 获取同步锁
    await this._acquireLock('saveCategories');

    try {
      // 构建批量 UPSERT 语句
      const statements = [];
      const now = new Date().toISOString();
      const allCategoryIds = [];

      // 为每个分类生成 UPSERT 语句
      for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        allCategoryIds.push(cat.id);

        statements.push({
          sql: `
            INSERT INTO categories (id, name, icon, parent_id, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              icon = excluded.icon,
              parent_id = excluded.parent_id,
              sort_order = excluded.sort_order,
              updated_at = excluded.updated_at
          `,
          params: [
            cat.id,
            cat.name,
            cat.icon || '📁',
            null,
            i,
            now,
            now
          ]
        });

        // 处理子分类
        if (cat.children && cat.children.length > 0) {
          for (let j = 0; j < cat.children.length; j++) {
            const child = cat.children[j];
            allCategoryIds.push(child.id);

            statements.push({
              sql: `
                INSERT INTO categories (id, name, icon, parent_id, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name,
                  icon = excluded.icon,
                  parent_id = excluded.parent_id,
                  sort_order = excluded.sort_order,
                  updated_at = excluded.updated_at
              `,
              params: [
                child.id,
                child.name,
                child.icon || '📄',
                cat.id,
                j,
                now,
                now
              ]
            });
          }
        }
      }

      // 添加删除不再存在的分类的语句（在所有 UPSERT 之后执行）
      if (allCategoryIds.length > 0) {
        // SQLite 不支持 NOT IN 带参数数组，所以构建占位符
        const placeholders = allCategoryIds.map(() => '?').join(',');
        statements.push({
          sql: `DELETE FROM categories WHERE id NOT IN (${placeholders})`,
          params: allCategoryIds
        });
      }

      // 批量执行
      const result = await this.client.batch(statements);

      if (result.success) {
        return {
          success: true,
          count: allCategoryIds.length,
          message: `已同步 ${allCategoryIds.length} 个分类`
        };
      } else {
        return {
          success: false,
          error: result.error,
          message: '分类同步失败'
        };
      }
    } finally {
      this._releaseLock('saveCategories');
    }
  }

  // 从 Turso 获取所有分类
  async getCategoriesFromTurso() {
    if (!this.enabled || !this.client) {
      return { success: false, error: 'Turso 未启用', categories: [] };
    }

    const sql = 'SELECT * FROM categories ORDER BY sort_order ASC';
    const result = await this.client.execute(sql);

    if (!result.success) {
      return { success: false, error: result.error, categories: [] };
    }

    // 转换为应用使用的格式
    const flatCategories = result.rows.map(row => {
      const obj = {};
      result.columns.forEach((col, index) => {
        obj[col] = row[index];
      });
      return obj;
    });

    // 构建层级结构
    const parentCategories = flatCategories.filter(c => !c.parent_id);
    const categories = parentCategories.map(parent => ({
      id: parent.id,
      name: parent.name,
      icon: parent.icon,
      children: flatCategories
        .filter(c => c.parent_id === parent.id)
        .map(child => ({
          id: child.id,
          name: child.name,
          icon: child.icon,
          parentId: child.parent_id
        }))
    }));

    return { success: true, categories };
  }

  // 同步分类（从云端拉取）
  async syncCategoriesFromTurso() {
    const result = await this.getCategoriesFromTurso();

    if (!result.success || result.categories.length === 0) {
      // 如果云端没有分类，不覆盖本地
      return result;
    }

    // 保存到本地
    await chrome.storage.local.set({ categories: result.categories });

    return {
      success: true,
      categories: result.categories,
      message: `同步完成，共 ${result.categories.length} 个分类`
    };
  }

  // ============ 状态查询 ============

  // 检查是否有待处理的重试项
  async hasPendingRetries() {
    await this._loadRetryQueue();
    return this._retryQueue.length > 0;
  }

  // 获取待重试项数量
  async getPendingRetryCount() {
    await this._loadRetryQueue();
    return this._retryQueue.length;
  }

  // 检查同步锁状态
  isSyncing() {
    return this._syncLock;
  }
}

// 导出全局实例
const bookmarkManager = new BookmarkManager();
