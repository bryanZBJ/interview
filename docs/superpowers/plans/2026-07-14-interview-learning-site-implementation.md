# Single HTML Interview Learning Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved interview Markdown into one responsive `site/index.html` with reading, search, review states, and GitHub Pages publishing.

**Architecture:** A small Node.js build script reads an explicit Markdown allowlist, converts each document to safe HTML, extracts knowledge points, and injects the content, CSS, JavaScript, and selected Lucide icons into one file. The browser is a hash-routed static application; learning state is stored only in that browser's `localStorage`.

**Tech Stack:** Node.js 20, markdown-it, lucide-static, Node test runner, Playwright, HTML/CSS/vanilla JavaScript, GitHub Actions and GitHub Pages.

---

## File Structure

```text
package.json                         # Build and test commands
package-lock.json                    # Locked dependencies
site.config.mjs                      # Explicit document publication allowlist
src/build.mjs                        # Markdown parsing, validation and HTML generation
src/site.css                         # Knowledge Studio responsive visual system
src/site.js                          # Search, routing, reader and local progress behavior
src/template.mjs                     # Escaped data/CSS/JS injection into the HTML shell
tests/build.test.mjs                 # Content, privacy and single-file build tests
tests/site.spec.mjs                  # Desktop/mobile browser behavior tests
playwright.config.mjs                # Local static server and test viewports
.github/workflows/interview-site.yml # Test, build and GitHub Pages deployment
site/index.html                      # The only published artifact
```

## Task 1: Lock the Toolchain and Publication Allowlist

**Files:**
- Create: `package.json`
- Create: `site.config.mjs`
- Create: `tests/build.test.mjs`

- [ ] **Step 1: Write the failing allowlist tests**

Add Node tests that import `site.config.mjs` and assert:

```js
assert.ok(config.documents.length >= 10);
assert.equal(new Set(config.documents.map((item) => item.slug)).size, config.documents.length);
assert.ok(config.documents.every((item) => item.file.endsWith('.md')));
assert.ok(config.documents.every((item) => !/简历|项目经验|总目录|扫描/.test(item.file)));
```

- [ ] **Step 2: Add the project commands and dependencies**

Create `package.json` with Node 20 and these scripts:

```json
{
  "name": "interview-learning-notes",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "node src/build.mjs",
    "test": "node --test tests/build.test.mjs",
    "test:e2e": "playwright test",
    "check": "npm test && npm run build && npm run test:e2e"
  },
  "dependencies": {
    "lucide-static": "^0.468.0",
    "markdown-it": "^14.1.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.1"
  }
}
```

Run `npm install`. Expected: `package-lock.json` is created and install exits 0.

- [ ] **Step 3: Create the explicit allowlist**

Export this contract from `site.config.mjs`:

```js
export default {
  title: '张炳金的面试学习笔记',
  documents: [
    { topic: 'Java 基础', slug: 'java-core', file: 'Java核心基础面试指南.md' },
    { topic: 'Java 基础', slug: 'java-io', file: 'Java IO面试指南.md' },
    { topic: 'JVM 与并发', slug: 'jvm', file: 'Java JVM高频面试题与线上排障指南.md' },
    { topic: 'JVM 与并发', slug: 'concurrency', file: 'Java并发编程面试指南.md' },
    { topic: 'Spring', slug: 'spring', file: 'Spring核心原理面试指南.md' },
    { topic: '数据与搜索', slug: 'mysql', file: 'MySQL数据库面试指南.md' },
    { topic: '数据与搜索', slug: 'elasticsearch', file: 'Elasticsearch-OpenSearch面试指南.md' },
    { topic: '消息队列', slug: 'kafka', file: 'Kafka面试指南.md' },
    { topic: '消息队列', slug: 'rocketmq', file: 'RocketMQ高频面试题.md' },
    { topic: '分布式', slug: 'distributed', file: '分布式组件面试指南.md' },
    { topic: '微服务', slug: 'microservices', file: '微服务治理面试指南.md' },
    { topic: '工程实践', slug: 'observability', file: '可观测性面试指南.md' },
    { topic: '工程实践', slug: 'security', file: '安全认证面试指南.md' },
    { topic: '工程实践', slug: 'docker-k8s', file: 'Docker-K8s基础面试指南.md' },
    { topic: '业务场景', slug: 'business', file: 'Java互联网业务场景面试题.md' },
    { topic: '综合复习', slug: 'advanced-review', file: 'Java高级开发查缺补漏.md' },
    { topic: '综合复习', slug: 'interview-review', file: '面试题复盘.md' },
    { topic: 'AI 应用', slug: 'ai-app', file: 'AI应用开发面试指南.md' },
    { topic: 'AI 应用', slug: 'ai-agent', file: 'AI Agent岗位面试准备计划.md' }
  ]
};
```

Run `npm test`. Expected: allowlist tests pass; build-related tests fail until Task 2.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json site.config.mjs tests/build.test.mjs
git commit -m "build: add static site toolchain and content allowlist"
```

## Task 2: Build Safe Structured Content

**Files:**
- Create: `src/build.mjs`
- Modify: `tests/build.test.mjs`

- [ ] **Step 1: Add failing parser and privacy tests**

Tests must build into a temporary directory and verify:

```js
assert.equal(result.documents.length, config.documents.length);
assert.ok(result.documents.every((doc) => doc.html && doc.points.length > 0));
assert.equal(new Set(result.points.map((point) => point.id)).size, result.points.length);
assert.ok(!result.serialized.includes('/Users/'));
assert.ok(!result.serialized.includes('Java后端项目经验梳理'));
```

Also verify a knowledge-point ID remains unchanged when only its body text changes.

- [ ] **Step 2: Implement the content builder**

Export these functions from `src/build.mjs`:

```js
export function createMarkdownRenderer(resolveDocumentLink) {}
export function buildDocument(source, entry, catalog) {}
export function buildSiteData(config, rootDir) {}
export async function writeSite({ rootDir, outputFile }) {}
```

Implementation requirements:

- Configure markdown-it with `html: false`, `linkify: true`, `typographer: false`.
- Generate heading IDs with a deterministic Chinese-safe slugger and duplicate suffixes.
- Convert `[[文档]]` and `[[文档#章节]]` to internal hash links only when the allowlist contains the target.
- Treat level 2/3 headings containing body text, `Q数字`, or `追问` as knowledge points.
- Generate point IDs as `${documentSlug}::${headingPathSlug}`.
- Collect plain text for search without local paths or excluded document content.
- Throw descriptive errors for missing files, duplicate slugs, duplicate IDs and unresolved allowlisted links.

- [ ] **Step 3: Run parser tests**

Run `npm test`. Expected: all content and privacy tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/build.mjs tests/build.test.mjs
git commit -m "feat: build safe interview note content"
```

## Task 3: Generate the Self-Contained HTML Shell

**Files:**
- Create: `src/template.mjs`
- Create: `src/site.css`
- Create: `src/site.js`
- Create: `site/index.html`
- Modify: `src/build.mjs`
- Modify: `tests/build.test.mjs`

- [ ] **Step 1: Add failing single-file tests**

After running the build, assert:

```js
assert.ok(html.startsWith('<!doctype html>'));
assert.ok(html.includes('id="site-data"'));
assert.ok(html.includes('interview-learning-progress-v1'));
assert.ok(!/<script[^>]+src=|<link[^>]+href=/i.test(html));
assert.ok(!html.includes('</script><script>alert'));
assert.ok((await readdir('site')).every((name) => name === 'index.html'));
```

- [ ] **Step 2: Implement safe template generation**

`src/template.mjs` must:

- Replace `<`, `>`, `&`, U+2028 and U+2029 before embedding JSON.
- Read and inline `src/site.css` and `src/site.js`.
- Read only the selected Lucide SVG files for search, home, library, rotate-ccw, check, sun, moon and menu.
- Emit one semantic HTML shell with skip link, desktop sidebar, top search, main region, mobile bottom navigation and toast live region.
- Include no external font, script, stylesheet or API reference.

- [ ] **Step 3: Implement the browser data and state layer**

In `src/site.js`, define the stable state contract:

```js
const STORAGE_KEY = 'interview-learning-progress-v1';
const STATUS = new Set(['unlearned', 'review', 'mastered']);
```

Implement validated load/save, corrupt-value backup, last-read tracking, progress aggregation, hash parsing, HTML escaping for search snippets, and a no-storage fallback that keeps reading/search usable.

- [ ] **Step 4: Build the first HTML**

Run `npm run build`. Expected: `site/index.html` is generated, contains all approved content, and no other file exists under `site/`.

- [ ] **Step 5: Run the unit tests and commit**

Run `npm test`. Expected: all tests pass.

```bash
git add src site/index.html tests/build.test.mjs
git commit -m "feat: generate self-contained interview learning page"
```

## Task 4: Implement the Knowledge Studio Experience

**Files:**
- Modify: `src/site.css`
- Modify: `src/site.js`
- Modify: `tests/build.test.mjs`

- [ ] **Step 1: Add failing static UI contract tests**

Assert the generated HTML contains accessible labels for `首页`, `知识库`, `复习`, `搜索`, `浅色`, `深色`, and all three learning statuses. Assert the CSS contains `prefers-color-scheme`, `prefers-reduced-motion`, safe-area spacing, and responsive breakpoints.

- [ ] **Step 2: Implement four internal views**

Implement hash routes:

```text
#/home
#/library?topic=...&status=...
#/read/<documentSlug>/<headingId>
#/review?topic=...
```

Required behavior:

- Home: overall progress, review count, topic progress, continue reading and recently updated documents.
- Library: topic/document navigation, topic/status filters and result counts.
- Reader: rendered Markdown, page TOC, previous/next point and a three-state segmented control.
- Review: only `review` points, topic filter, start-review action and an empty state.
- Search: 150ms debounce, title-first ranking, Chinese/English/code matching, safe snippets and `Command/Ctrl + K`.
- Theme: light/dark/system control persisted locally.
- Browser back/forward restores view and reading anchor.

- [ ] **Step 3: Implement responsive visual rules**

Use neutral gray/white surfaces, blue actions, green mastered state and amber review state. Keep cards at 8px radius or less, controls at least 44px, body text at least 16px on mobile, article width near 72 characters, horizontal scrolling inside code/table wrappers, visible focus, and no critical hover-only behavior.

- [ ] **Step 4: Rebuild and run tests**

Run `npm run build && npm test`. Expected: build and static UI contracts pass.

- [ ] **Step 5: Commit**

```bash
git add src site/index.html tests/build.test.mjs
git commit -m "feat: add responsive learning and review experience"
```

## Task 5: Verify macOS and Mobile Browsers

**Files:**
- Create: `playwright.config.mjs`
- Create: `tests/site.spec.mjs`

- [ ] **Step 1: Configure the static test server**

Use Playwright's `webServer` with:

```js
webServer: {
  command: 'python3 -m http.server 4173 --directory site',
  port: 4173,
  reuseExistingServer: true
}
```

Define Chromium projects at 375x812, 768x1024, 1280x800 and 1440x900. Use the desktop projects for Mac layout checks; perform a manual Safari check after automated Chromium verification.

- [ ] **Step 2: Write end-to-end tests**

Cover:

- Home/library/reader/review navigation.
- Chinese search returning and opening a result.
- Status selection, reload persistence and review-list inclusion.
- Corrupt localStorage recovery.
- Theme switching and `Command/Ctrl + K`.
- No page-level horizontal overflow at all four viewports.
- Mobile bottom navigation and desktop sidebar visibility.

- [ ] **Step 3: Run browser tests**

Run `npm run build && npm run test:e2e`. Expected: all Playwright tests pass with no overflow or console errors.

- [ ] **Step 4: Perform visual verification**

Capture desktop and mobile screenshots, inspect them for overlap, unreadable text, broken tables/code blocks, blank content and accidental card nesting. Open `site/index.html` through the local server in macOS Safari and confirm search, state persistence and back navigation.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.mjs tests/site.spec.mjs
git commit -m "test: cover desktop and mobile learning flows"
```

## Task 6: Publish the Single HTML with GitHub Pages

**Files:**
- Create: `.github/workflows/interview-site.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Add the Pages workflow**

Configure `push` on `main` and manual dispatch. Give only `contents: read`, `pages: write`, and `id-token: write`; run `npm ci`, `npm test`, `npm run build`, `npm run test:e2e`, then upload the `site/` directory with `actions/upload-pages-artifact` and deploy with `actions/deploy-pages`.

- [ ] **Step 2: Add deployment guards**

Before artifact upload, fail when `site/` contains anything except `index.html`, fail above 15 MB, warn from 8 MB, and scan for `/Users/zbj`, `jianli`, `.doc`, `.pdf`, common secret prefixes and excluded document titles.

- [ ] **Step 3: Run the full local gate**

Run `npm run check`. Expected: unit tests, build and browser tests all pass.

- [ ] **Step 4: Verify repository settings and publish**

Confirm a GitHub remote exists, push `main`, set Pages source to GitHub Actions, and verify the workflow URL. If no remote exists, stop after the locally verified page and ask the user for the intended private GitHub repository URL.

- [ ] **Step 5: Final acceptance**

Verify the public URL on macOS and phone, change one Markdown paragraph, rebuild/push, and confirm the page updates while each browser retains its own independent local state.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/interview-site.yml .gitignore
git commit -m "ci: publish interview notes to GitHub Pages"
```
