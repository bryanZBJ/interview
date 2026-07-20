# Random Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有单 HTML 面试知识库中增加覆盖全部已发布知识点、单轮不重复、先答后看的随机练习页。

**Architecture:** 新增独立的 `src/quiz.js` 纯逻辑模块，通过 `globalThis.InterviewQuiz` 同时服务 Node 测试和浏览器页面；`src/site.js` 只管理路由、练习状态和 DOM 交互。构建时由 `src/template.mjs` 将逻辑模块与页面脚本一起内联，GitHub Pages 仍只部署自动生成的 `site/index.html`。

**Tech Stack:** Node.js 20、原生 JavaScript、DOMParser、HTML/CSS、Lucide Static、Node Test Runner、Playwright、GitHub Pages

---

## 文件结构

- Create: `src/quiz.js` - 题目过滤、题目文案、洗牌队列、章节答案提取。
- Create: `tests/quiz.test.mjs` - 随机练习纯逻辑测试。
- Modify: `package.json` - 让 `npm test` 执行所有 Node 单元测试。
- Modify: `src/template.mjs` - 内联 quiz 模块，增加练习导航与 shuffle 图标。
- Modify: `src/site.js` - 增加 `#/quiz` 页面、队列状态与交互事件。
- Modify: `src/site.css` - 增加练习页面和四栏移动导航样式。
- Modify: `tests/build.test.mjs` - 验证单 HTML 包含练习模块和导航。
- Modify: `tests/site.spec.mjs` - 验证桌面、手机、答案展开、换题和状态同步。
- Generated only: `site/index.html` - 本地验证时会重建，但不暂存；GitHub Actions 会从提交源码重新生成。

### Task 1: 随机练习纯逻辑

**Files:**
- Create: `tests/quiz.test.mjs`
- Create: `src/quiz.js`
- Modify: `package.json:10`

- [ ] **Step 1: 扩展 Node 测试入口**

将 `package.json` 的测试脚本改为：

```json
"test": "node --test tests/*.test.mjs"
```

- [ ] **Step 2: 编写题目筛选、文案和洗牌的失败测试**

创建 `tests/quiz.test.mjs`：

```js
import assert from 'node:assert/strict';
import test from 'node:test';

await import('../src/quiz.js');

const {
  createQuestionTitle,
  createQuizQueue,
  extractAnswerHtml,
  isQuizEligible
} = globalThis.InterviewQuiz;

const point = (title, overrides = {}) => ({
  id: `id-${title}`,
  title,
  excerpt: '正文',
  documentSlug: 'java',
  headingId: 'heading',
  ...overrides
});

test('quiz filter excludes structural headings and keeps interview concepts', () => {
  assert.equal(isQuizEligible(point('使用说明')), false);
  assert.equal(isQuizEligible(point('今日产出与完成打卡')), false);
  assert.equal(isQuizEligible(point('什么是 Java 内存模型？')), true);
  assert.equal(isQuizEligible(point('ArrayList 和 LinkedList 的区别')), true);
  assert.equal(isQuizEligible(point('有效题目', { excerpt: '' })), false);
});

test('question title preserves questions and converts concept titles', () => {
  assert.equal(createQuestionTitle('Q1：什么是 Token？'), 'Q1：什么是 Token？');
  assert.equal(createQuestionTitle('什么是 BPMN？'), '什么是 BPMN？');
  assert.equal(createQuestionTitle('Java 内存模型'), '请解释：Java 内存模型');
});

test('quiz queue contains each eligible point once', () => {
  const points = [point('A'), point('B'), point('C'), point('使用说明')];
  const queue = createQuizQueue(points, { random: () => 0 });

  assert.deepEqual(new Set(queue), new Set(['id-A', 'id-B', 'id-C']));
  assert.equal(queue.length, 3);
});

test('new round avoids immediately repeating the previous question', () => {
  const points = [point('A'), point('B')];
  const queue = createQuizQueue(points, { lastId: 'id-B', random: () => 0.99 });

  assert.notEqual(queue[0], 'id-B');
});

test('answer extraction stops before the next same-level heading', () => {
  class FakeDOMParser {
    parseFromString() {
      const after = { outerHTML: '<p>答案 A</p>', nextElementSibling: null, matches: () => false };
      const nextHeading = { outerHTML: '<h2>问题 B</h2>', nextElementSibling: null, matches: (selector) => selector.includes('h2') };
      after.nextElementSibling = nextHeading;
      const heading = { tagName: 'H2', nextElementSibling: after };
      return { getElementById: () => heading };
    }
  }

  assert.equal(extractAnswerHtml('<h2 id="a">问题 A</h2><p>答案 A</p><h2>问题 B</h2>', 'a', FakeDOMParser), '<p>答案 A</p>');
});
```

- [ ] **Step 3: 运行测试并确认失败**

Run: `npm test`

Expected: FAIL，错误包含 `Cannot find module '../src/quiz.js'`。

- [ ] **Step 4: 实现最小纯逻辑模块**

创建 `src/quiz.js`：

```js
((root) => {
  'use strict';

  const STRUCTURAL_TITLE = /使用说明|阅读说明|学习目标|必须理解|核心结论|生产建议|面试口述|今日产出|完成打卡|参考资料|延伸阅读|实验原文|跟着做|阅读项目代码|修改实验|记录表|预期观察|快速验收|不看答案自测|自测|总结/;

  function isQuizEligible(point) {
    return Boolean(
      point
      && String(point.title || '').trim()
      && String(point.excerpt || '').trim()
      && String(point.documentSlug || '').trim()
      && String(point.headingId || '').trim()
      && !STRUCTURAL_TITLE.test(point.title)
    );
  }

  function createQuestionTitle(title) {
    const value = String(title || '').trim();
    return /[?？]$/.test(value) || /^(?:Q\d*|追问|问题)/i.test(value) ? value : `请解释：${value}`;
  }

  function createQuizQueue(points, { lastId = null, random = Math.random } = {}) {
    const queue = points.filter(isQuizEligible).map((point) => point.id);
    for (let index = queue.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [queue[index], queue[target]] = [queue[target], queue[index]];
    }
    if (queue.length > 1 && queue[0] === lastId) {
      [queue[0], queue[1]] = [queue[1], queue[0]];
    }
    return queue;
  }

  function extractAnswerHtml(documentHtml, headingId, Parser = root.DOMParser) {
    if (!Parser || !documentHtml || !headingId) return '';
    const parsed = new Parser().parseFromString(documentHtml, 'text/html');
    const heading = parsed.getElementById(headingId);
    if (!heading || !/^H[2-3]$/.test(heading.tagName)) return '';
    const level = Number(heading.tagName.slice(1));
    const stopSelector = Array.from({ length: level }, (_item, index) => `h${index + 1}`).join(',');
    const fragments = [];
    let node = heading.nextElementSibling;
    while (node && !node.matches(stopSelector)) {
      fragments.push(node.outerHTML);
      node = node.nextElementSibling;
    }
    return fragments.join('');
  }

  root.InterviewQuiz = Object.freeze({
    createQuestionTitle,
    createQuizQueue,
    extractAnswerHtml,
    isQuizEligible
  });
})(globalThis);
```

- [ ] **Step 5: 运行 Node 测试并确认通过**

Run: `npm test`

Expected: 所有 `build.test.mjs` 和 `quiz.test.mjs` 用例 PASS。

- [ ] **Step 6: 提交纯逻辑**

```bash
git add package.json src/quiz.js tests/quiz.test.mjs
git commit -m "feat: add random quiz engine"
```

### Task 2: 将练习模块内联到单 HTML

**Files:**
- Modify: `tests/build.test.mjs:67-99`
- Modify: `src/template.mjs:4-7,29-33,55-59,82-86,101-102`

- [ ] **Step 1: 编写构建失败断言**

在 `writeSite emits one self-contained and safe HTML page` 用例中增加：

```js
assert.match(html, /globalThis\.InterviewQuiz|root\.InterviewQuiz/);
assert.match(html, /data-route="quiz"/);
```

并将可访问标签数组改为：

```js
for (const label of ['首页', '知识库', '练习', '复习', '搜索', '浅色', '深色', '跟随系统']) {
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test`

Expected: FAIL，生成页面中不存在 `InterviewQuiz` 或 `data-route="quiz"`。

- [ ] **Step 3: 内联脚本并增加导航**

在 `ICON_NAMES` 中加入 `'shuffle'`。在 `renderPage` 中分别读取并转义脚本：

```js
const quizScript = fs.readFileSync(path.join(rootDir, 'src', 'quiz.js'), 'utf8')
  .replaceAll('</script', '<\\/script');
const script = fs.readFileSync(path.join(rootDir, 'src', 'site.js'), 'utf8')
  .replaceAll('</script', '<\\/script');
```

在桌面和手机导航的“知识库”与“复习”之间加入：

```html
<button type="button" data-route="quiz" aria-label="练习"></button>
```

将页面底部脚本改为：

```html
<script>${quizScript}</script>
<script>${script}</script>
```

- [ ] **Step 4: 运行构建测试并确认通过**

Run: `npm test`

Expected: 全部 Node 测试 PASS，且输出仍只包含一个 HTML 文件。

- [ ] **Step 5: 提交构建集成**

```bash
git add src/template.mjs tests/build.test.mjs
git commit -m "feat: add quiz route to static shell"
```

### Task 3: 练习路由与先答后看交互

**Files:**
- Modify: `tests/site.spec.mjs`
- Modify: `src/site.js:17-24,137-151,279-310,358-366,378-403`

- [ ] **Step 1: 编写练习主流程的失败测试**

在 `tests/site.spec.mjs` 增加：

```js
test('reveals one quiz answer and moves to a different question', async ({ page }) => {
  await page.getByRole('button', { name: '练习' }).first().click();
  await expect(page).toHaveURL(/#\/quiz$/);
  const question = page.locator('[data-quiz-question]');
  await expect(question).toBeVisible();
  const firstQuestion = await question.textContent();
  await expect(page.locator('[data-quiz-answer]')).toBeHidden();

  await page.getByRole('button', { name: '查看答案' }).click();
  await expect(page.locator('[data-quiz-answer]')).toBeVisible();
  await expect(page.getByRole('button', { name: '下一题' })).toBeVisible();

  await page.getByRole('button', { name: '下一题' }).click();
  await expect(question).not.toHaveText(firstQuestion);
  await expect(page.locator('[data-quiz-answer]')).toBeHidden();
});
```

- [ ] **Step 2: 构建页面并确认端到端测试失败**

Run: `npm run build && npx playwright test tests/site.spec.mjs -g "reveals one quiz" --project=desktop-1280`

Expected: FAIL，找不到“练习”页面或题目元素。

- [ ] **Step 3: 增加练习状态与取题函数**

在 `state = loadState()` 后增加：

```js
const quiz = globalThis.InterviewQuiz;
let quizQueue = [];
let currentQuizId = null;
let answerRevealed = false;
let quizRoundTotal = 0;

function selectNextQuiz() {
  const previousId = currentQuizId;
  if (!quizQueue.length) {
    quizQueue = quiz.createQuizQueue(data.points, { lastId: previousId });
    quizRoundTotal = quizQueue.length;
  }
  currentQuizId = quizQueue.shift() || null;
  answerRevealed = false;
}
```

- [ ] **Step 4: 增加练习页面渲染函数**

在 `renderReview` 前增加：

```js
function renderQuiz() {
  if (!currentQuizId || !pointMap.has(currentQuizId)) selectNextQuiz();
  const point = pointMap.get(currentQuizId);
  if (!point) {
    main.innerHTML = `${heading('随机练习', '当前发布内容中没有可用于练习的知识点。', 'QUIZ')}<button class="text-button" data-route="library">返回知识库</button>`;
    document.getElementById('topbar-title').textContent = '随机练习';
    return;
  }

  const note = documentMap.get(point.documentSlug);
  const answer = answerRevealed
    ? quiz.extractAnswerHtml(note?.html || '', point.headingId) || `<p>${escapeHtml(point.excerpt)}</p>`
    : '';
  const position = quizRoundTotal - quizQueue.length;

  main.innerHTML = `<div class="quiz-page" id="quiz-top">
    ${heading('随机练习', '从全部已发布知识点中随机抽题。', 'QUIZ')}
    <section class="quiz-workspace" aria-labelledby="quiz-question">
      <div class="quiz-progress"><span>本轮 ${position} / ${quizRoundTotal}</span><span>全部题库</span></div>
      <p class="quiz-source">${escapeHtml(point.topic)} · ${escapeHtml(note?.title || '未知文档')}</p>
      <h2 id="quiz-question" data-quiz-question>${escapeHtml(quiz.createQuestionTitle(point.title))}</h2>
      ${answerRevealed ? `<section class="quiz-answer article" data-quiz-answer aria-live="polite" tabindex="-1"><h3>参考答案</h3>${answer}</section>
        ${renderStatusControl(point)}
        <div class="quiz-actions"><button class="text-button" type="button" data-action="quiz-original">查看原文</button><button class="primary-button" type="button" data-action="quiz-next">下一题</button></div>`
        : '<button class="primary-button quiz-reveal" type="button" data-action="quiz-reveal">查看答案</button>'}
    </section>
  </div>`;
  document.getElementById('topbar-title').textContent = '随机练习';
}
```

- [ ] **Step 5: 接入路由、导航内容和点击事件**

在 `renderRoute` 分支中增加：

```js
else if (view === 'quiz') renderQuiz();
```

在 `navContent` 增加：

```js
quiz: `${icon('shuffle')}<span>练习</span>`,
```

在统一点击事件的 `status` 分支后增加：

```js
if (action.dataset.action === 'quiz-reveal') {
  answerRevealed = true;
  renderQuiz();
  requestAnimationFrame(() => document.querySelector('[data-quiz-answer]')?.focus());
}
if (action.dataset.action === 'quiz-next') {
  selectNextQuiz();
  renderQuiz();
  requestAnimationFrame(() => {
    document.getElementById('quiz-top')?.scrollIntoView({ block: 'start' });
    document.querySelector('[data-quiz-question]')?.focus({ preventScroll: true });
  });
}
if (action.dataset.action === 'quiz-original') {
  const point = pointMap.get(currentQuizId);
  if (point) navigate(pointRoute(point));
}
```

给题目 `h2` 增加 `tabindex="-1"`，保证“下一题”后的焦点调用生效。

- [ ] **Step 6: 运行主流程测试并确认通过**

Run: `npm run build && npx playwright test tests/site.spec.mjs -g "reveals one quiz" --project=desktop-1280`

Expected: PASS；初始答案隐藏，展开后可见，下一题不同且答案重新隐藏。

- [ ] **Step 7: 提交交互实现**

```bash
git add src/site.js tests/site.spec.mjs
git commit -m "feat: add random quiz interaction"
```

### Task 4: 学习状态同步与原文跳转

**Files:**
- Modify: `tests/site.spec.mjs`

- [ ] **Step 1: 编写状态同步失败测试**

在 `tests/site.spec.mjs` 增加：

```js
test('persists quiz status and opens the source section', async ({ page }) => {
  await page.goto('/#/quiz');
  await page.getByRole('button', { name: '查看答案' }).click();
  const currentPointId = await page.locator('.reader-status').getAttribute('data-point-id');
  await page.getByRole('button', { name: '需复习' }).click();
  await expect(page.getByRole('button', { name: '需复习' })).toHaveAttribute('aria-pressed', 'true');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('interview-learning-progress-v1')));
  expect(stored.progress[currentPointId].status).toBe('review');

  await page.getByRole('button', { name: '复习' }).first().click();
  await expect(page.locator(`[data-point="${currentPointId}"]`)).toBeVisible();

  await page.goto('/#/quiz');
  await page.getByRole('button', { name: '查看答案' }).click();
  const source = await page.locator('.reader-status').getAttribute('data-point-id');
  await page.getByRole('button', { name: '查看原文' }).click();
  await expect(page).toHaveURL(/#\/read\//);
  await expect(page.locator('.point-highlight')).toBeVisible();
  await expect(page.locator(`.reader-status[data-point-id="${source}"]`)).toBeVisible();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm run build && npx playwright test tests/site.spec.mjs -g "persists quiz status" --project=desktop-1280`

Expected: 在 Task 3 尚未完整接入状态或原文操作时 FAIL；测试始终按页面实际题目 ID 验证，不依赖随机题序。

- [ ] **Step 3: 确认 Task 3 的状态与原文处理满足测试**

无需增加第二套状态。`renderStatusControl(point)`、`setPointStatus` 和 `quiz-original` 必须继续复用现有 `interview-learning-progress-v1` 与 `pointRoute(point)`。

- [ ] **Step 4: 运行状态与原文测试并确认通过**

Run: `npm run build && npx playwright test tests/site.spec.mjs -g "persists quiz status" --project=desktop-1280`

Expected: PASS；练习页标记出现在复习清单中，“查看原文”进入当前题对应阅读页。

- [ ] **Step 5: 提交状态联动测试**

```bash
git add tests/site.spec.mjs
git commit -m "test: cover quiz progress integration"
```

### Task 5: 响应式视觉与可访问性

**Files:**
- Modify: `src/site.css:88-98,125-157,171-205`
- Modify: `tests/site.spec.mjs`

- [ ] **Step 1: 扩展导航和溢出测试**

在现有 viewport 测试中增加：

```js
await page.getByRole('button', { name: '练习' }).first().click();
await expect(page.locator('.quiz-workspace')).toBeVisible();
const quizOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
expect(quizOverflow).toBe(false);
if (!isDesktop) {
  const columns = await page.locator('.mobile-nav').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(4);
}
```

在主流程测试的答案展开后增加：

```js
await expect(page.locator('[data-quiz-answer]')).toBeFocused();
```

- [ ] **Step 2: 运行四视口测试并确认样式失败点**

Run: `npm run build && npx playwright test tests/site.spec.mjs -g "viewport|reveals one quiz"`

Expected: 焦点断言通过；移动端四列断言 FAIL，因为现有规则仍是 `repeat(3, 1fr)`。

- [ ] **Step 3: 增加练习页样式并改为四栏导航**

在 `src/site.css` 增加：

```css
.quiz-page { max-width: 900px; margin: 0 auto; }
.quiz-workspace { min-width: 0; padding: 22px 0 40px; border-top: 1px solid var(--line); }
.quiz-progress, .quiz-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.quiz-progress { color: var(--muted); font-size: 13px; font-weight: 700; }
.quiz-source { margin: 34px 0 10px; color: var(--primary); font-size: 13px; font-weight: 800; }
.quiz-workspace > h2 { max-width: 28ch; margin: 0; font-size: 28px; line-height: 1.4; overflow-wrap: anywhere; }
.quiz-reveal { margin-top: 30px; }
.quiz-answer { margin-top: 34px; padding-top: 24px; border-top: 1px solid var(--line); outline: none; }
.quiz-answer > h3:first-child { margin-top: 0; }
.quiz-workspace .reader-status { position: static; margin-top: 24px; box-shadow: none; }
.quiz-actions { margin-top: 18px; justify-content: flex-end; flex-wrap: wrap; }
.mobile-nav { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.mobile-nav button { min-width: 0; flex-direction: column; gap: 2px; font-size: 12px; }

@media (min-width: 700px) {
  .quiz-workspace { padding-top: 30px; }
  .quiz-workspace > h2 { font-size: 34px; }
}
```

- [ ] **Step 4: 验证四个视口和无障碍焦点**

Run: `npm run build && npx playwright test tests/site.spec.mjs -g "viewport|reveals one quiz"`

Expected: mobile-375、tablet-768、desktop-1280、desktop-1440 全部 PASS，无水平溢出。

- [ ] **Step 5: 提交视觉样式**

```bash
git add src/site.css tests/site.spec.mjs
git commit -m "style: polish responsive quiz page"
```

### Task 6: 全量验证与发布准备

**Files:**
- Verify only: `site/index.html`
- Verify only: `.github/workflows/interview-site.yml`

- [ ] **Step 1: 运行完整检查**

Run: `npm run check`

Expected: Node 测试、构建和全部 Playwright 项目 PASS。

- [ ] **Step 2: 验证唯一静态产物与大小**

Run: `test "$(find site -type f | wc -l | tr -d ' ')" = "1" && test -f site/index.html && wc -c site/index.html`

Expected: `site` 下只有 `site/index.html`，文件小于 GitHub workflow 的 15 MB 上限。

- [ ] **Step 3: 检查发布产物不包含敏感内容**

Run: `! rg -n '/Users/zbj|Java后端项目经验梳理|BEGIN (RSA|OPENSSH) PRIVATE KEY|sk-[0-9A-Za-z_-]{20,}' site/index.html`

Expected: 无输出，退出码为 0。

- [ ] **Step 4: 用 Playwright 截图进行桌面和手机视觉检查**

Run: `npx playwright test tests/site.spec.mjs -g "reveals one quiz|viewport"`

Expected: 四个视口全部 PASS；失败时保留截图和 trace，检查题目、答案、底部导航是否重叠。

- [ ] **Step 5: 检查提交边界**

Run: `git status --short && git diff --cached --name-only`

Expected: 不暂存 `学习/AI Agent岗位面试准备/第一周-大模型基础/java-demo/src/main/resources/application.yml`，也不暂存本地生成的 `site/index.html` 或其他用户改动。

- [ ] **Step 6: 推送并观察 GitHub Pages 发布**

Run: `git push origin main`

Expected: `.github/workflows/interview-site.yml` 在远端执行 `npm run check`，从源码生成并部署新的单 HTML 页面。
