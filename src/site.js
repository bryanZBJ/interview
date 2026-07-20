(() => {
  'use strict';

  const STORAGE_KEY = 'interview-learning-progress-v1';
  const STATUS = new Set(['unlearned', 'review', 'mastered']);
  const STATUS_LABEL = {
    unlearned: '未学习',
    review: '需复习',
    mastered: '已掌握'
  };
  const data = JSON.parse(document.getElementById('site-data').textContent);
  const main = document.getElementById('main-content');
  const searchDialog = document.getElementById('search-dialog');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const toast = document.getElementById('toast');
  const { createQuestionTitle, createQuizQueue, extractAnswerHtml } = globalThis.InterviewQuiz;
  const documentMap = new Map(data.documents.map((document) => [document.slug, document]));
  const pointMap = new Map(data.points.map((point) => [point.id, point]));
  const quizCandidates = data.points.filter((point) => documentMap.has(point.documentSlug));
  const topics = [...new Set(data.documents.map((document) => document.topic))];
  let storageEnabled = true;
  let toastTimer;
  let searchTimer;
  let state = loadState();
  let quizQueue = [];
  let currentQuizId = null;
  let answerRevealed = false;
  let quizRoundTotal = 0;

  function icon(name) {
    return data.icons[name] || '';
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function loadState() {
    const fallback = { progress: {}, lastRead: null, theme: 'system' };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.progress !== 'object') {
        throw new Error('invalid progress payload');
      }
      const progress = {};
      for (const [pointId, record] of Object.entries(parsed.progress)) {
        if (record && STATUS.has(record.status)) progress[pointId] = record;
      }
      return {
        progress,
        lastRead: parsed.lastRead && typeof parsed.lastRead === 'object' ? parsed.lastRead : null,
        theme: ['light', 'dark', 'system'].includes(parsed.theme) ? parsed.theme : 'system'
      };
    } catch (error) {
      try {
        const corrupted = localStorage.getItem(STORAGE_KEY);
        if (corrupted) localStorage.setItem(`${STORAGE_KEY}-corrupt-${Date.now()}`, corrupted);
        localStorage.removeItem(STORAGE_KEY);
      } catch (_ignored) {
        storageEnabled = false;
      }
      setTimeout(() => showToast('学习状态数据异常，已恢复为空状态'), 0);
      return fallback;
    }
  }

  function saveState() {
    if (!storageEnabled) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {
      storageEnabled = false;
      showToast('当前浏览器无法保存状态，阅读与搜索仍可使用');
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
  }

  function applyTheme(theme) {
    state.theme = theme;
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.theme === theme));
    });
    saveState();
  }

  function pointStatus(pointId) {
    return state.progress[pointId]?.status || 'unlearned';
  }

  function setPointStatus(pointId, status) {
    if (!STATUS.has(status) || !pointMap.has(pointId)) return;
    const restoreQuizFocus = routeName() === 'quiz' && pointId === currentQuizId;
    if (status === 'unlearned') delete state.progress[pointId];
    else state.progress[pointId] = { status, updatedAt: Date.now() };
    saveState();
    showToast(`已标记为${STATUS_LABEL[status]}`);
    renderRoute();
    if (restoreQuizFocus) {
      requestAnimationFrame(() => {
        document.querySelector(`[data-point-id="${CSS.escape(pointId)}"] [data-action="status"][data-status="${status}"]`)?.focus();
      });
    }
  }

  function parseRoute() {
    const raw = location.hash.startsWith('#/') ? location.hash.slice(2) : 'home';
    const [pathname, query = ''] = raw.split('?');
    return {
      parts: pathname.split('/').filter(Boolean).map(decodeURIComponent),
      query: new URLSearchParams(query)
    };
  }

  function navigate(path) {
    location.hash = path.startsWith('#/') ? path : `#/${path}`;
  }

  function routeName() {
    return parseRoute().parts[0] || 'home';
  }

  function progressFor(points) {
    const total = points.length;
    const mastered = points.filter((point) => pointStatus(point.id) === 'mastered').length;
    const review = points.filter((point) => pointStatus(point.id) === 'review').length;
    return { total, mastered, review, percent: total ? Math.round(mastered / total * 100) : 0 };
  }

  function statusBadge(status) {
    return `<span class="status-badge ${status}">${STATUS_LABEL[status]}</span>`;
  }

  function heading(title, description, eyebrow = 'INTERVIEW NOTES') {
    return `<header class="page-heading">
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
    </header>`;
  }

  function firstPoint(document) {
    return document.points[0] || null;
  }

  function pointRoute(point) {
    return `read/${encodeURIComponent(point.documentSlug)}/${encodeURIComponent(point.headingId)}`;
  }

  function renderHome() {
    const overall = progressFor(data.points);
    const started = data.points.filter((point) => pointStatus(point.id) !== 'unlearned').length;
    const topicCards = topics.map((topic) => {
      const topicPoints = data.points.filter((point) => point.topic === topic);
      const progress = progressFor(topicPoints);
      return `<button class="topic-card" type="button" data-action="topic" data-topic="${escapeHtml(topic)}">
        <span class="row-main">
          <span class="row-title">${escapeHtml(topic)}</span>
          <span class="row-meta">${progress.mastered} / ${progress.total} 已掌握 · ${progress.review} 待复习</span>
          <span class="progress-track"><span style="width:${progress.percent}%"></span></span>
        </span>
        ${icon('chevron-right')}
      </button>`;
    }).join('');

    const continuePoint = state.lastRead ? pointMap.get(state.lastRead.pointId) : null;
    const continueBlock = continuePoint ? `<section>
      <div class="section-header"><div><h2>继续学习</h2><p>接着上次的位置往下看</p></div></div>
      <button class="document-row" type="button" data-action="point" data-point="${continuePoint.id}">
        <span class="row-main"><span class="row-title">${escapeHtml(continuePoint.title)}</span><span class="row-meta">${escapeHtml(continuePoint.topic)}</span></span>
        ${icon('chevron-right')}
      </button>
    </section>` : '';

    main.innerHTML = `${heading('学习驾驶舱', '集中查看掌握进度、待复习内容，并从上次位置继续。')}
      <section class="metrics" aria-label="学习数据">
        <div class="metric"><span class="metric-label">知识点</span><strong>${overall.total}</strong></div>
        <div class="metric"><span class="metric-label">已开始</span><strong>${started}</strong></div>
        <div class="metric review"><span class="metric-label">需复习</span><strong>${overall.review}</strong></div>
        <div class="metric mastered"><span class="metric-label">掌握度</span><strong>${overall.percent}%</strong></div>
      </section>
      ${continueBlock}
      <section>
        <div class="section-header"><div><h2>专题进度</h2><p>${topics.length} 个专题，按自己的节奏推进</p></div></div>
        <div class="topic-grid">${topicCards}</div>
      </section>`;
    document.getElementById('topbar-title').textContent = '学习概览';
  }

  function renderLibrary(query) {
    const topic = query.get('topic') || 'all';
    const status = query.get('status') || 'all';
    const keyword = (query.get('q') || '').trim().toLowerCase();
    const documents = data.documents.filter((document) => {
      const topicMatch = topic === 'all' || document.topic === topic;
      const statusMatch = status === 'all' || document.points.some((point) => pointStatus(point.id) === status);
      const keywordMatch = !keyword || `${document.title} ${document.searchText}`.toLowerCase().includes(keyword);
      return topicMatch && statusMatch && keywordMatch;
    });
    const rows = documents.map((document) => {
      const progress = progressFor(document.points);
      const target = firstPoint(document);
      return `<button class="document-row" type="button" data-action="document" data-document="${document.slug}" ${target ? '' : 'disabled'}>
        <span class="row-main">
          <span class="row-title">${escapeHtml(document.title)}</span>
          <span class="row-meta">${escapeHtml(document.topic)} · ${progress.total} 个知识点 · ${progress.percent}% 已掌握</span>
          <span class="progress-track"><span style="width:${progress.percent}%"></span></span>
        </span>
        ${icon('chevron-right')}
      </button>`;
    }).join('');
    const option = (value, label, selected) => `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;

    main.innerHTML = `${heading('知识库', '按专题、状态或关键词浏览全部面试笔记。', 'KNOWLEDGE LIBRARY')}
      <section class="filters" aria-label="知识库筛选">
        <div class="field"><label for="library-keyword">关键词</label><input id="library-keyword" type="search" value="${escapeHtml(query.get('q') || '')}" placeholder="例如 JVM、Redis、Agent"></div>
        <div class="field"><label for="topic-filter">专题</label><select id="topic-filter">${option('all', '全部专题', topic === 'all')}${topics.map((item) => option(item, item, item === topic)).join('')}</select></div>
        <div class="field"><label for="status-filter">状态</label><select id="status-filter">${option('all', '全部状态', status === 'all')}${option('unlearned', '未学习', status === 'unlearned')}${option('review', '需复习', status === 'review')}${option('mastered', '已掌握', status === 'mastered')}</select></div>
      </section>
      <div class="section-header"><div><h2>文档</h2><p>找到 ${documents.length} 份笔记</p></div></div>
      <section class="document-list">${rows || '<div class="empty-state"><strong>没有匹配内容</strong>清除筛选或换一个关键词试试。</div>'}</section>`;
    document.getElementById('topbar-title').textContent = '知识库';
  }

  function renderStatusControl(point) {
    const current = pointStatus(point.id);
    return `<div class="reader-status" data-point-id="${point.id}">
      <span class="reader-status-label">当前知识点：${escapeHtml(point.title)}</span>
      <div class="status-segment" role="group" aria-label="学习状态">
        ${['unlearned', 'review', 'mastered'].map((status) => `<button type="button" data-action="status" data-status="${status}" aria-pressed="${current === status}">${STATUS_LABEL[status]}</button>`).join('')}
      </div>
    </div>`;
  }

  function renderReader(parts) {
    const note = documentMap.get(parts[1]);
    if (!note) {
      main.innerHTML = `${heading('文档不存在', '该文档未进入发布允许列表。')}<button class="text-button" data-route="library">返回知识库</button>`;
      return;
    }
    const requestedHeading = parts[2];
    const point = note.points.find((item) => item.headingId === requestedHeading || item.id === requestedHeading) || firstPoint(note);
    if (!point) {
      main.innerHTML = `${heading(note.title, '这份文档还没有可标记的知识点。')}<article class="article">${note.html}</article>`;
      return;
    }
    const globalIndex = data.points.findIndex((item) => item.id === point.id);
    const previous = data.points[globalIndex - 1];
    const next = data.points[globalIndex + 1];
    state.lastRead = { pointId: point.id, documentSlug: note.slug, headingId: point.headingId };
    saveState();

    const toc = note.points.map((item) => `<button type="button" class="${item.id === point.id ? 'active' : ''}" data-action="point" data-point="${item.id}">${escapeHtml(item.title)}</button>`).join('');
    main.innerHTML = `<div class="reader-toolbar"><button class="back-button" type="button" data-route="library">${icon('arrow-left')}<span>知识库</span></button></div>
      <div class="reader-layout">
        <div>
          ${renderStatusControl(point)}
          <article class="article" data-document="${note.slug}">${note.html}</article>
          <nav class="reader-pagination" aria-label="知识点翻页">
            <button type="button" data-action="point" data-point="${previous?.id || ''}" ${previous ? '' : 'disabled'}>上一篇<br><strong>${escapeHtml(previous?.title || '已经是第一篇')}</strong></button>
            <button type="button" data-action="point" data-point="${next?.id || ''}" ${next ? '' : 'disabled'}>下一篇<br><strong>${escapeHtml(next?.title || '已经是最后一篇')}</strong></button>
          </nav>
        </div>
        <aside class="toc" aria-label="页内目录"><strong>本文知识点</strong>${toc}</aside>
      </div>`;
    document.getElementById('topbar-title').textContent = note.title;
    requestAnimationFrame(() => {
      const headingElement = document.querySelector(`.article #${CSS.escape(point.headingId)}`);
      if (headingElement) {
        headingElement.classList.add('point-highlight');
        headingElement.scrollIntoView({ block: 'start' });
      }
    });
  }

  function renderReview(query) {
    const topic = query.get('topic') || 'all';
    const points = data.points.filter((point) => pointStatus(point.id) === 'review' && (topic === 'all' || point.topic === topic));
    const rows = points.map((point) => `<button class="review-row" type="button" data-action="point" data-point="${point.id}">
      <span class="row-main"><span class="row-title">${escapeHtml(point.title)}</span><span class="row-meta">${escapeHtml(point.topic)} · ${escapeHtml(documentMap.get(point.documentSlug)?.title || '')}</span></span>
      ${statusBadge('review')}${icon('chevron-right')}
    </button>`).join('');
    const topicOptions = topics.map((item) => `<option value="${escapeHtml(item)}" ${item === topic ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('');

    main.innerHTML = `${heading('复习清单', '把还不稳的知识点集中起来，一项一项消化。', 'REVIEW QUEUE')}
      <section class="filters">
        <div class="field"><label for="review-topic">专题</label><select id="review-topic"><option value="all">全部专题</option>${topicOptions}</select></div>
      </section>
      <div class="section-header"><div><h2>待复习知识点</h2><p>当前设备共有 ${points.length} 项</p></div>${points[0] ? `<button class="primary-button" type="button" data-action="point" data-point="${points[0].id}">${icon('book-open')}开始复习</button>` : ''}</div>
      <section class="review-list">${rows || '<div class="empty-state"><strong>当前没有待复习内容</strong>阅读时将不熟悉的知识点标记为“需复习”，它会出现在这里。</div>'}</section>`;
    document.getElementById('topbar-title').textContent = '复习';
  }

  function takeNextQuizPoint(lastId = currentQuizId) {
    const currentPoint = pointMap.get(currentQuizId);
    if (currentPoint && documentMap.has(currentPoint.documentSlug)) return currentPoint;

    if (!quizQueue.length) {
      quizQueue = createQuizQueue(quizCandidates, { lastId });
      quizRoundTotal = quizQueue.length;
    }

    while (quizQueue.length) {
      const point = pointMap.get(quizQueue.shift());
      if (point && documentMap.has(point.documentSlug)) {
        currentQuizId = point.id;
        return point;
      }
    }

    currentQuizId = null;
    return null;
  }

  function quizAnswerHtml(point, note) {
    try {
      return extractAnswerHtml(note.html, point.headingId) || `<p>${escapeHtml(point.excerpt)}</p>`;
    } catch (_error) {
      return `<p>${escapeHtml(point.excerpt)}</p>`;
    }
  }

  function focusQuiz(selector) {
    requestAnimationFrame(() => {
      const target = document.querySelector(selector);
      if (!target) return;
      target.scrollIntoView({ block: 'start' });
      target.focus({ preventScroll: true });
    });
  }

  function renderQuiz() {
    const point = takeNextQuizPoint();
    if (!point) {
      main.innerHTML = `${heading('随机练习', '从全部题库随机抽题，先回答，再核对笔记。', 'QUIZ')}
        <div class="empty-state"><strong>暂无可练习题目</strong>题目来源文档不存在或题库中没有合格知识点。</div>
        <button class="text-button" type="button" data-route="library">返回知识库</button>`;
      document.getElementById('topbar-title').textContent = '随机练习';
      return;
    }

    const note = documentMap.get(point.documentSlug);
    const roundPosition = Math.max(1, quizRoundTotal - quizQueue.length);
    const answer = answerRevealed ? `<section data-quiz-answer tabindex="-1" aria-live="polite">
      ${renderStatusControl(point)}
      <article class="article">
        <h2>参考答案</h2>
        ${quizAnswerHtml(point, note)}
      </article>
      <div class="reader-toolbar">
        <button class="text-button" type="button" data-action="quiz-original">${icon('book-open')}查看原文</button>
        <button class="primary-button" type="button" data-action="quiz-next">${icon('shuffle')}下一题</button>
      </div>
    </section>` : `<button class="primary-button" type="button" data-action="quiz-reveal">${icon('book-open')}查看答案</button>`;

    main.innerHTML = `${heading('随机练习', '从全部题库随机抽题，先回答，再核对笔记。', 'QUIZ')}
      <div class="section-header"><div><h2>全部题库</h2><p>${quizRoundTotal} 道可练习题 · 本轮位置 ${roundPosition} / ${quizRoundTotal}</p></div></div>
      <section data-quiz-question tabindex="-1">
        <p class="eyebrow">专题：${escapeHtml(point.topic)} · 来源文档：${escapeHtml(note.title)}</p>
        <h2>${escapeHtml(createQuestionTitle(point.title))}</h2>
      </section>
      ${answer}`;
    document.getElementById('topbar-title').textContent = '随机练习';
  }

  function renderRoute() {
    const route = parseRoute();
    const view = route.parts[0] || 'home';
    document.querySelectorAll('[data-route]').forEach((button) => {
      const active = button.dataset.route === view;
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    if (view === 'library') renderLibrary(route.query);
    else if (view === 'read') renderReader(route.parts);
    else if (view === 'quiz') renderQuiz();
    else if (view === 'review') renderReview(route.query);
    else renderHome();
  }

  function updateLibraryFilters() {
    const params = new URLSearchParams();
    const keyword = document.getElementById('library-keyword')?.value.trim();
    const topic = document.getElementById('topic-filter')?.value;
    const status = document.getElementById('status-filter')?.value;
    if (keyword) params.set('q', keyword);
    if (topic && topic !== 'all') params.set('topic', topic);
    if (status && status !== 'all') params.set('status', status);
    navigate(`library${params.size ? `?${params}` : ''}`);
  }

  function highlight(text, query) {
    const safe = escapeHtml(text);
    if (!query) return safe;
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(escapedQuery, 'ig'), (match) => `<mark>${match}</mark>`);
  }

  function runSearch(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      searchResults.innerHTML = '<div class="empty-state"><strong>输入关键词开始搜索</strong>支持中文、英文和代码关键词。</div>';
      return;
    }
    const ranked = data.points.map((point) => {
      const title = point.title.toLowerCase();
      const body = point.excerpt.toLowerCase();
      let score = 0;
      if (title === normalized) score = 100;
      else if (title.includes(normalized)) score = 70;
      else if (body.includes(normalized)) score = 30;
      return { point, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 30);

    searchResults.innerHTML = ranked.length ? ranked.map(({ point }) => `<button class="search-result" type="button" data-action="search-result" data-point="${point.id}">
      <span class="row-main"><span class="row-title">${highlight(point.title, normalized)}</span><span class="row-meta">${escapeHtml(point.topic)} · ${highlight(point.excerpt, normalized)}</span></span>${icon('chevron-right')}
    </button>`).join('') : '<div class="empty-state"><strong>没有找到匹配内容</strong>试试 JVM、事务、Redis、Agent 等关键词。</div>';
  }

  function openSearch() {
    if (!searchDialog.open) searchDialog.showModal();
    searchInput.value = '';
    runSearch('');
    setTimeout(() => searchInput.focus(), 0);
  }

  function initializeShell() {
    const navContent = {
      home: `${icon('house')}<span>首页</span>`,
      library: `${icon('library')}<span>知识库</span>`,
      quiz: `${icon('shuffle')}<span>练习</span>`,
      review: `${icon('rotate-ccw')}<span>复习</span>`
    };
    document.querySelectorAll('[data-route]').forEach((button) => {
      if (navContent[button.dataset.route]) button.innerHTML = navContent[button.dataset.route];
    });
    document.getElementById('search-trigger-icon').innerHTML = icon('search');
    document.getElementById('dialog-search-icon').innerHTML = icon('search');
    document.getElementById('mobile-menu').innerHTML = icon('menu');
    const themeIcons = { light: 'sun', dark: 'moon', system: 'monitor' };
    document.querySelectorAll('[data-theme]').forEach((button) => {
      button.innerHTML = icon(themeIcons[button.dataset.theme]);
      button.title = button.getAttribute('aria-label');
    });
    document.getElementById('sidebar-topics').innerHTML = topics.map((topic) => `<button class="sidebar-topic" type="button" data-action="topic" data-topic="${escapeHtml(topic)}">${escapeHtml(topic)}</button>`).join('');
  }

  document.addEventListener('click', (event) => {
    const routeButton = event.target.closest('[data-route]');
    if (routeButton) {
      navigate(routeButton.dataset.route);
      return;
    }
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'topic') navigate(`library?topic=${encodeURIComponent(action.dataset.topic)}`);
    if (action.dataset.action === 'document') {
      const document = documentMap.get(action.dataset.document);
      const point = document && firstPoint(document);
      if (point) navigate(pointRoute(point));
    }
    if (['point', 'search-result'].includes(action.dataset.action)) {
      const point = pointMap.get(action.dataset.point);
      if (point) {
        if (searchDialog.open) searchDialog.close();
        navigate(pointRoute(point));
      }
    }
    if (action.dataset.action === 'status') {
      const container = action.closest('[data-point-id]');
      if (container) setPointStatus(container.dataset.pointId, action.dataset.status);
    }
    if (action.dataset.action === 'quiz-reveal') {
      answerRevealed = true;
      renderQuiz();
      focusQuiz('[data-quiz-answer]');
    }
    if (action.dataset.action === 'quiz-next') {
      const lastId = currentQuizId;
      currentQuizId = null;
      answerRevealed = false;
      takeNextQuizPoint(lastId);
      renderQuiz();
      focusQuiz('[data-quiz-question]');
    }
    if (action.dataset.action === 'quiz-original') {
      const point = pointMap.get(currentQuizId);
      if (point) navigate(pointRoute(point));
    }
  });

  document.addEventListener('change', (event) => {
    if (['topic-filter', 'status-filter'].includes(event.target.id)) updateLibraryFilters();
    if (event.target.id === 'review-topic') {
      const topic = event.target.value;
      navigate(`review${topic === 'all' ? '' : `?topic=${encodeURIComponent(topic)}`}`);
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'library-keyword') {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(updateLibraryFilters, 150);
    }
  });

  document.getElementById('open-search').addEventListener('click', openSearch);
  document.getElementById('mobile-menu').addEventListener('click', () => navigate('library'));
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(searchInput.value), 150);
  });
  document.querySelectorAll('[data-theme]').forEach((button) => button.addEventListener('click', () => applyTheme(button.dataset.theme)));
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
    if (event.key === 'Escape' && searchDialog.open) searchDialog.close();
  });
  window.addEventListener('hashchange', renderRoute);

  initializeShell();
  applyTheme(state.theme);
  if (!location.hash) navigate('home');
  else renderRoute();
})();
