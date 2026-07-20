import assert from 'node:assert/strict';
import test from 'node:test';

import config from '../site.config.mjs';
import { buildSiteData } from '../src/build.mjs';

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

const EXPECTED_GENERIC_HEADINGS = [
  '目标',
  '准备',
  '逐步操作',
  '结论',
  '常见问法',
  '核心对比',
  '应用场景',
  '操作步骤',
  '实验步骤',
  '前置准备',
  '固定 Prompt / 样例',
  '可复制请求或调用方式',
  '参考',
  '参考资料',
  '延伸阅读',
  '实验原文',
  '总结'
];

function normalizeExpectedHeading(title) {
  return String(title || '')
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/^\((?:\p{N}+|[一二三四五六七八九十百]+)\)[\p{P}\p{Z}]*/u, '')
    .replace(/^(?:第\s*)?(?:\p{N}+(?:\.\p{N}+)*|[一二三四五六七八九十百]+)(?:\s*[章节部分步])?(?:[\p{P}\p{Z}]+|$)/u, '')
    .replace(/[\p{P}\p{Z}]/gu, '');
}

test('quiz filter excludes structural headings and keeps interview concepts', () => {
  assert.equal(isQuizEligible(point('使用说明')), false);
  assert.equal(isQuizEligible(point('今日产出与完成打卡')), false);
  assert.equal(isQuizEligible(point('参考')), false);
  assert.equal(isQuizEligible(point('什么是 Java 内存模型？')), true);
  assert.equal(isQuizEligible(point('ArrayList 和 LinkedList 的区别')), true);
  assert.equal(isQuizEligible(point('有效题目', { excerpt: '' })), false);
});

test('quiz filter excludes exact generic structural headings after normalization', () => {
  const genericTitles = [
    ...EXPECTED_GENERIC_HEADINGS,
    '1. 目标',
    '1.1 核心对比',
    '一、应用场景',
    '（二） 结论：',
    '第 3 章：逐步操作',
    '2. 固 定 pRoMpT / 样 例：',
    '（三） 可复制请求或调用方式',
    '27. 参考资料',
    '六、实验原文',
    '（四）总结'
  ];

  for (const title of genericTitles) {
    assert.equal(isQuizEligible(point(title)), false, `expected generic heading to be excluded: ${title}`);
  }

  assert.equal(isQuizEligible(point('业务目标拆解')), true);
  assert.equal(isQuizEligible(point('应用场景中的幂等设计')), true);
  assert.equal(isQuizEligible(point('核心对比分析：CMS 与 G1')), true);
  assert.equal(isQuizEligible(point('固定 Prompt / 样例：退款场景')), true);
  assert.equal(isQuizEligible(point('可复制请求或调用方式：SSE 流式聊天')), true);
  assert.equal(isQuizEligible(point('Q5：提供参考材料后为什么仍需要无依据拒答？')), true);
  assert.equal(isQuizEligible(point('Java 并发容器总结')), true);
});

test('real quiz corpus contains no normalized generic structural headings', () => {
  const data = buildSiteData(config, process.cwd());
  const expectedHeadings = new Set(EXPECTED_GENERIC_HEADINGS.map(normalizeExpectedHeading));
  const knownGenericPoints = data.points.filter((item) => expectedHeadings.has(normalizeExpectedHeading(item.title)));

  for (const item of knownGenericPoints) {
    assert.equal(isQuizEligible(item), false, `expected real quiz corpus to exclude: ${item.title}`);
  }
});

test('real quiz corpus preserves the reference-material refusal question', () => {
  const data = buildSiteData(config, process.cwd());
  const title = 'Q5：提供参考材料后为什么仍需要无依据拒答？';
  const item = data.points.find((candidate) => candidate.title === title);

  assert.ok(item, `expected real corpus to contain: ${title}`);
  assert.equal(isQuizEligible(item), true);
});

test('question title preserves questions and converts concept titles', () => {
  assert.equal(createQuestionTitle('Q1：什么是 Token？'), 'Q1：什么是 Token？');
  assert.equal(createQuestionTitle('Q：什么是 Token'), 'Q：什么是 Token');
  assert.equal(createQuestionTitle('追问：Token 如何续期'), '追问：Token 如何续期');
  assert.equal(createQuestionTitle('问题：Token 存在哪里'), '问题：Token 存在哪里');
  assert.equal(createQuestionTitle('什么是 BPMN？'), '什么是 BPMN？');
  assert.equal(createQuestionTitle('JVM 是什么？与 JRE 的关系'), 'JVM 是什么？与 JRE 的关系');
  assert.equal(createQuestionTitle('Queue 的并发语义'), '请解释：Queue 的并发语义');
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
  const queue = createQuizQueue(points, { lastId: 'id-B', random: () => 0 });

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

test('answer extraction stops before a higher-level heading', () => {
  class FakeDOMParser {
    parseFromString() {
      const after = { outerHTML: '<p>答案 A</p>', nextElementSibling: null, matches: () => false };
      const higherHeading = { outerHTML: '<h2>下一章节</h2>', nextElementSibling: null, matches: (selector) => selector.includes('h2') };
      after.nextElementSibling = higherHeading;
      const heading = { tagName: 'H3', nextElementSibling: after };
      return { getElementById: () => heading };
    }
  }

  assert.equal(extractAnswerHtml('<h3 id="a">问题 A</h3><p>答案 A</p><h2>下一章节</h2>', 'a', FakeDOMParser), '<p>答案 A</p>');
});
