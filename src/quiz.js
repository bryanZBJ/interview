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
