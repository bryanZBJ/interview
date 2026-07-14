import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import config from '../site.config.mjs';
import { buildDocument, buildSiteData, writeSite } from '../src/build.mjs';

test('publication allowlist contains only unique interview Markdown documents', () => {
  assert.ok(config.documents.length >= 10);
  assert.equal(new Set(config.documents.map((item) => item.slug)).size, config.documents.length);
  assert.ok(config.documents.every((item) => item.file.endsWith('.md')));
});

test('publication allowlist excludes personal and maintenance documents', () => {
  const publishedFiles = config.documents.map((item) => item.file).join('\n');

  assert.doesNotMatch(publishedFiles, /简历|项目经验|项目大厂|项目技术栈|总目录|扫描|AGENTS/);
});

test('buildDocument extracts stable knowledge points and internal wiki links', () => {
  const catalog = new Map([
    ['测试文档', { slug: 'test-note' }],
    ['关联文档', { slug: 'linked-note' }]
  ]);
  const source = `# 测试文档

## 1. JVM 基础

### Q1：什么是 JVM？

第一版正文，继续看 [[关联文档#2. 内存区域|内存区域]]。
`;
  const changedBody = source.replace('第一版正文', '完全不同的第二版正文');
  const entry = { topic: '测试', slug: 'test-note', file: '测试文档.md' };

  const first = buildDocument(source, entry, catalog);
  const second = buildDocument(changedBody, entry, catalog);

  assert.equal(first.title, '测试文档');
  assert.equal(first.points.length, 2);
  assert.equal(first.points[1].id, second.points[1].id);
  assert.match(decodeURIComponent(first.html), /#\/read\/linked-note\/2-内存区域/);
  assert.doesNotMatch(first.searchText, /测试文档\.md/);
});

test('buildSiteData reads only allowlisted documents and produces unique IDs', () => {
  const result = buildSiteData(config, process.cwd());
  const ids = result.points.map((point) => point.id);
  const serialized = JSON.stringify(result);

  assert.equal(result.documents.length, config.documents.length);
  assert.ok(result.documents.every((document) => document.html && document.points.length > 0));
  assert.equal(new Set(ids).size, ids.length);
  assert.doesNotMatch(serialized, /\/Users\//);
  assert.doesNotMatch(serialized, /Java后端项目经验梳理/);
});

test('writeSite emits one self-contained and safe HTML page', async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-site-'));
  const outputFile = path.join(outputDirectory, 'index.html');

  const { html } = await writeSite({ rootDir: process.cwd(), outputFile });

  assert.ok(html.startsWith('<!doctype html>'));
  assert.match(html, /id="site-data"/);
  assert.match(html, /interview-learning-progress-v1/);
  assert.match(html, /未学习/);
  assert.match(html, /需复习/);
  assert.match(html, /已掌握/);
  assert.match(html, /rel="icon" href="data:,"/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=["'](?:https?:|\/\/)/i);
  assert.doesNotMatch(html, /<\/script><script>alert/i);
  assert.deepEqual(fs.readdirSync(outputDirectory), ['index.html']);
});

test('generated page contains the accessible responsive learning shell', async () => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-ui-'));
  const { html } = await writeSite({
    rootDir: process.cwd(),
    outputFile: path.join(outputDirectory, 'index.html')
  });

  for (const label of ['首页', '知识库', '复习', '搜索', '浅色', '深色', '跟随系统']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /prefers-color-scheme/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /safe-area-inset-bottom/);
  assert.match(html, /@media \(min-width: 900px\)/);
});
