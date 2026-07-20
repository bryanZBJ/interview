import fs from 'node:fs';
import path from 'node:path';

const ICON_NAMES = [
  'search', 'house', 'library', 'book-open', 'rotate-ccw', 'check',
  'sun', 'moon', 'monitor', 'menu', 'chevron-right', 'arrow-left', 'list-filter',
  'shuffle'
];

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function escapeInlineScript(source) {
  return source.replace(/<\/script/gi, '<\\/script');
}

function readIcons(rootDir) {
  return Object.fromEntries(ICON_NAMES.map((name) => {
    const file = path.join(rootDir, 'node_modules', 'lucide-static', 'icons', `${name}.svg`);
    const svg = fs.readFileSync(file, 'utf8')
      .replace(/<\?xml[^>]*>/g, '')
      .replace('<svg ', '<svg aria-hidden="true" focusable="false" class="icon" ')
      .trim();
    return [name, svg];
  }));
}

export function renderPage(data, rootDir) {
  const css = fs.readFileSync(path.join(rootDir, 'src', 'site.css'), 'utf8');
  const quizScript = escapeInlineScript(fs.readFileSync(path.join(rootDir, 'src', 'quiz.js'), 'utf8'));
  const script = escapeInlineScript(fs.readFileSync(path.join(rootDir, 'src', 'site.js'), 'utf8'));
  const payload = { ...data, icons: readIcons(rootDir) };

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Java 与 AI 应用开发面试学习笔记">
  <link rel="icon" href="data:,">
  <title>${data.title}</title>
  <style>${css}</style>
</head>
<body>
  <a class="skip-link" href="#main-content">跳到正文</a>
  <div class="app-shell">
    <aside class="sidebar" aria-label="主导航">
      <div class="brand">
        <span class="brand-mark">NOTE</span>
        <strong>${data.title}</strong>
        <span>Java × AI 应用开发</span>
      </div>
      <nav class="primary-nav">
        <button type="button" data-route="home" aria-label="首页"></button>
        <button type="button" data-route="library" aria-label="知识库"></button>
        <button type="button" data-route="quiz" aria-label="练习"></button>
        <button type="button" data-route="review" aria-label="复习"></button>
      </nav>
      <div class="sidebar-topics" id="sidebar-topics" aria-label="专题"></div>
      <div class="theme-control" role="group" aria-label="主题">
        <button type="button" data-theme="light" aria-label="浅色"></button>
        <button type="button" data-theme="dark" aria-label="深色"></button>
        <button type="button" data-theme="system" aria-label="跟随系统"></button>
      </div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <button class="mobile-menu" id="mobile-menu" type="button" aria-label="打开专题菜单"></button>
        <div class="topbar-title" id="topbar-title">学习概览</div>
        <button class="search-trigger" id="open-search" type="button" aria-label="搜索知识点">
          <span id="search-trigger-icon"></span>
          <span>搜索</span>
          <kbd>⌘ K</kbd>
        </button>
      </header>
      <main id="main-content" tabindex="-1"></main>
    </section>
  </div>

  <nav class="mobile-nav" aria-label="移动端主导航">
    <button type="button" data-route="home" aria-label="首页"></button>
    <button type="button" data-route="library" aria-label="知识库"></button>
    <button type="button" data-route="quiz" aria-label="练习"></button>
    <button type="button" data-route="review" aria-label="复习"></button>
  </nav>

  <dialog class="search-dialog" id="search-dialog" aria-labelledby="search-title">
    <form method="dialog" class="search-panel">
      <div class="search-input-row">
        <span id="dialog-search-icon"></span>
        <label class="sr-only" id="search-title" for="search-input">搜索知识点</label>
        <input id="search-input" type="search" autocomplete="off" placeholder="搜索标题、正文或代码关键词">
        <button class="icon-button" value="close" aria-label="关闭搜索">×</button>
      </div>
      <div class="search-results" id="search-results" aria-live="polite"></div>
    </form>
  </dialog>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <script type="application/json" id="site-data">${safeJson(payload)}</script>
  <script>${quizScript}</script>
  <script>${script}</script>
</body>
</html>`;
}
