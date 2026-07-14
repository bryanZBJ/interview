import assert from 'node:assert/strict';
import test from 'node:test';

import config from '../site.config.mjs';

test('publication allowlist contains only unique interview Markdown documents', () => {
  assert.ok(config.documents.length >= 10);
  assert.equal(new Set(config.documents.map((item) => item.slug)).size, config.documents.length);
  assert.ok(config.documents.every((item) => item.file.endsWith('.md')));
});

test('publication allowlist excludes personal and maintenance documents', () => {
  const publishedFiles = config.documents.map((item) => item.file).join('\n');

  assert.doesNotMatch(publishedFiles, /简历|项目经验|项目大厂|项目技术栈|总目录|扫描|AGENTS/);
});
