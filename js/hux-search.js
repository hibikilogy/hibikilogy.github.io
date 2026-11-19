/**
 * hux-search.js — Lunr.js 本地搜索（中文分词增强）
 *
 * 依赖:
 *   - lunr.min.js
 *   - lunr.stemmer.support.js
 *   - lunr.zh.js
 */

(function () {
  'use strict';

  const SEARCH_INDEX_URL = '/search.json';
  const MAX_RESULTS = 20;

  let index = null;
  let store = [];

  // 延迟初始化：只有用户第一次聚焦搜索框时才加载索引
  let loadPromise = null;

  function loadIndex() {
    if (loadPromise) return loadPromise;

    loadPromise = fetch(SEARCH_INDEX_URL)
      .then((res) => {
        if (!res.ok) throw new Error('search.json not found');
        return res.json();
      })
      .then((data) => {
        store = data;

        // Lunr 中文分词增强
        if (window.lunr && window.lunr.zh) {
          lunr.Pipeline.registerFunction(lunr.zh.trimmer, 'trimmer-zh');
          lunr.Pipeline.registerFunction(lunr.zh.stopWordFilter, 'stopWordFilter-zh');
          lunr.Pipeline.registerFunction(lunr.zh.stemmer, 'stemmer-zh');
        }

        index = lunr(function () {
          this.ref('url');

          // 权重：标题最高，摘要其次，标签和作者较低
          this.field('title', { boost: 10 });
          this.field('subtitle', { boost: 5 });
          this.field('tags', { boost: 3 });
          this.field('author', { boost: 2 });
          this.field('excerpt', { boost: 1 });

          // 中文分词 pipeline
          if (window.lunr && window.lunr.zh) {
            this.pipeline.add(lunr.zh.trimmer);
            this.pipeline.add(lunr.zh.stopWordFilter);
            this.pipeline.add(lunr.zh.stemmer);
            this.searchPipeline.add(lunr.zh.stemmer);
          }

          data.forEach((doc) => {
            // 标签数组 → 空格分隔字符串，方便分词
            const tagsStr = Array.isArray(doc.tags) ? doc.tags.join(' ') : '';
            this.add({
              url: doc.url,
              title: doc.title || '',
              subtitle: doc.subtitle || '',
              tags: tagsStr,
              author: doc.author || '',
              excerpt: doc.excerpt || '',
            });
          });
        });

        return true;
      })
      .catch((err) => {
        console.error('[search] 索引加载失败:', err);
        return false;
      });

    return loadPromise;
  }

  /**
   * 在原文中高亮匹配关键词
   */
  function highlight(text, query) {
    if (!text || !query) return text || '';
    // 转义正则特殊字符
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(' + escaped + ')', 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  /**
   * 根据 URL 从 store 中取原始文档
   */
  function findDocByUrl(url) {
    // Lunr 里 ref 存的是完整 URL，这里精确匹配
    for (let i = 0; i < store.length; i++) {
      if (store[i].url === url) return store[i];
    }
    return null;
  }

  function doSearch(query) {
    if (!index || !query || query.trim().length === 0) return [];

    const q = query.trim();
    let results;

    try {
      // 多策略：先精确匹配，失败再 wildcard
      results = index.search(q);

      // 如果结果太少，尝试 wildcard 匹配每个词
      if (results.length < 3) {
        const tokens = q.split(/\s+/).filter(Boolean);
        const wildcardQuery = tokens.map((t) => '*' + t + '*').join(' ');
        if (wildcardQuery !== q) {
          const more = index.search(wildcardQuery);
          // 合并去重
          const seen = new Set(results.map((r) => r.ref));
          more.forEach((r) => {
            if (!seen.has(r.ref)) {
              results.push(r);
              seen.add(r.ref);
            }
          });
        }
      }
    } catch (e) {
      console.warn('[search] 查询异常:', e);
      results = [];
    }

    return results.slice(0, MAX_RESULTS).map((r) => {
      const doc = findDocByUrl(r.ref);
      if (!doc) return null;
      return {
        score: r.score,
        doc: doc,
      };
    }).filter(Boolean);
  }

  /**
   * 渲染搜索结果到容器
   */
  function renderResults(containerEl, results, query) {
    if (results.length === 0) {
      if (query && query.trim().length > 0) {
        containerEl.innerHTML =
          '<div class="search-empty">没有找到与 "<strong>' +
          escapeHtml(query) +
          '</strong>" 相关的文章</div>';
      } else {
        containerEl.innerHTML =
          '<div class="search-hint">输入标题、标签或摘要关键词开始搜索…</div>';
      }
      return;
    }

    const html = results
      .map((r, idx) => {
        const doc = r.doc;
        const tags = (doc.tags || [])
          .map((t) => '<span class="search-tag">' + escapeHtml(t) + '</span>')
          .join(' ');
        return (
          '<a href="' +
          doc.url +
          '" class="search-result-item" data-idx="' +
          idx +
          '">' +
          '<div class="search-result-title">' +
          highlight(doc.title, query) +
          '</div>' +
          (doc.subtitle
            ? '<div class="search-result-subtitle">' +
              highlight(doc.subtitle, query) +
              '</div>'
            : '') +
          '<div class="search-result-excerpt">' +
          highlight(doc.excerpt, query) +
          '</div>' +
          '<div class="search-result-meta">' +
          '<span class="search-result-date">' +
          escapeHtml(doc.date) +
          '</span>' +
          (tags ? '<span class="search-result-tags">' + tags + '</span>' : '') +
          '</div>' +
          '</a>'
        );
      })
      .join('');

    containerEl.innerHTML =
      '<div class="search-result-count">找到 ' + results.length + ' 条结果</div>' + html;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ========= 弹层控制 =========

  let modalEl = null;
  let inputEl = null;
  let resultsEl = null;
  let currentActiveIdx = -1;

  function createModal() {
    if (modalEl) return modalEl;

    modalEl = document.createElement('div');
    modalEl.className = 'search-modal';
    modalEl.innerHTML =
      '<div class="search-modal-mask"></div>' +
      '<div class="search-modal-panel" role="dialog" aria-label="站内搜索">' +
      '<div class="search-modal-input-wrap">' +
      '<i class="fa fa-search search-modal-icon" aria-hidden="true"></i>' +
      '<input type="text" class="search-modal-input" placeholder="搜索文章标题、标签、摘要…" autocomplete="off" spellcheck="false">' +
      '<button type="button" class="search-modal-clear" aria-label="清除搜索" style="display:none">&times;</button>' +
      '</div>' +
      '<div class="search-modal-results"></div>' +
      '</div>';
    document.body.appendChild(modalEl);

    inputEl = modalEl.querySelector('.search-modal-input');
    resultsEl = modalEl.querySelector('.search-modal-results');

    // 事件：点击遮罩关闭
    modalEl.querySelector('.search-modal-mask').addEventListener('click', closeModal);

    // 事件：清除按钮
    modalEl.querySelector('.search-modal-clear').addEventListener('click', () => {
      inputEl.value = '';
      inputEl.focus();
      renderResults(resultsEl, [], '');
    });

    // 事件：输入搜索
    let debounceTimer = null;
    inputEl.addEventListener('input', () => {
      const q = inputEl.value;
      modalEl.querySelector('.search-modal-clear').style.display = q ? '' : 'none';
      currentActiveIdx = -1;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const res = doSearch(q);
        renderResults(resultsEl, res, q);
      }, 150);
    });

    // 事件：键盘导航
    inputEl.addEventListener('keydown', onKeyDown);

    // 事件：点击结果项 → 跳转
    resultsEl.addEventListener('click', (e) => {
      const item = e.target.closest('.search-result-item');
      if (!item) return;
      closeModal();
    });

    return modalEl;
  }

  function onKeyDown(e) {
    const items = resultsEl.querySelectorAll('.search-result-item');
    if (items.length === 0) {
      if (e.key === 'Escape') closeModal();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      currentActiveIdx = Math.min(currentActiveIdx + 1, items.length - 1);
      updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      currentActiveIdx = Math.max(currentActiveIdx - 1, -1);
      updateActiveItem(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentActiveIdx >= 0 && currentActiveIdx < items.length) {
        items[currentActiveIdx].click();
      } else if (items.length > 0) {
        // 没选中时直接进第一个
        items[0].click();
      }
    } else if (e.key === 'Escape') {
      closeModal();
    }
  }

  function updateActiveItem(items) {
    items.forEach((it) => it.classList.remove('active'));
    if (currentActiveIdx >= 0) {
      items[currentActiveIdx].classList.add('active');
      // 滚动可见
      items[currentActiveIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  function openModal(initialQuery) {
    createModal();
    modalEl.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    loadIndex().then(() => {
      inputEl.focus();
      if (initialQuery) {
        inputEl.value = initialQuery;
        inputEl.dispatchEvent(new Event('input'));
      } else {
        renderResults(resultsEl, [], '');
      }
    });
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  // 全局 ESC 监听（打开后按 ESC 关闭）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl && modalEl.classList.contains('is-open')) {
      closeModal();
    }
    // Ctrl+K 快捷键打开
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (modalEl && modalEl.classList.contains('is-open')) {
        closeModal();
      } else {
        openModal();
      }
    }
  });

  // 暴露给外部
  window.HuxSearch = { open: openModal, close: closeModal };
})();
