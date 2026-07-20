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
