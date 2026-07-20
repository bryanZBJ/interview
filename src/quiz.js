((root) => {
  'use strict';

  const STRUCTURAL_TITLE_FRAGMENT = /使用说明|阅读说明|学习目标|必须理解|核心结论|生产建议|面试口述|今日产出|完成打卡|参考|参考资料|延伸阅读|实验原文|跟着做|阅读项目代码|修改实验|记录表|预期观察|快速验收|不看答案自测|自测|总结/;
  const GENERIC_STRUCTURAL_TITLE = new Set([
    '目标',
    '准备',
    '逐步操作',
    '结论',
    '常见问法',
    '核心对比',
    '应用场景',
    '操作步骤',
    '实验步骤',
    '前置准备'
  ]);
  const CHAPTER_NUMBER_PREFIX = /^(?:(?:第\s*)?(?:\d+(?:\.\d+)*|[一二三四五六七八九十百]+)(?:\s*[章节部分步])?|\((?:\d+(?:\.\d+)*|[一二三四五六七八九十百]+)\))\s*[.、:：)\]】\-—]*\s*/;
  const TITLE_SPACING_AND_PUNCTUATION = /[\s:：。.!！?？、;；,，()（）【】\[\]{}《》<>“”"'‘’_\-—]/g;

  function normalizeGenericStructuralTitle(title) {
    return String(title || '')
      .normalize('NFKC')
      .trim()
      .replace(CHAPTER_NUMBER_PREFIX, '')
      .replace(TITLE_SPACING_AND_PUNCTUATION, '');
  }

  function isQuizEligible(point) {
    return Boolean(
      point
      && String(point.title || '').trim()
      && String(point.excerpt || '').trim()
      && String(point.documentSlug || '').trim()
      && String(point.headingId || '').trim()
      && !STRUCTURAL_TITLE_FRAGMENT.test(point.title)
      && !GENERIC_STRUCTURAL_TITLE.has(normalizeGenericStructuralTitle(point.title))
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
