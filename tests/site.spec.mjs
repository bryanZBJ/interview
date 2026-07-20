import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('renders the responsive learning dashboard without horizontal overflow', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '学习驾驶舱' })).toBeVisible();
  const totalPoints = await page.locator('#site-data').evaluate((element) => JSON.parse(element.textContent).points.length);
  await expect(page.locator('.metric').filter({ hasText: '知识点' }).locator('strong')).toHaveText(String(totalPoints));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('opens a document and persists review status after reload', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.getByRole('button', { name: '知识库' }).first().click();
  await page.locator('.document-row').first().click();
  await expect(page.locator('.article')).toBeVisible();
  const readerOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(readerOverflow).toBe(false);
  await page.getByRole('button', { name: '需复习' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '需复习' })).toHaveAttribute('aria-pressed', 'true');

  expect(errors).toEqual([]);
});

test('searches Chinese content and opens a result', async ({ page }) => {
  await page.getByRole('button', { name: '搜索知识点' }).click();
  await page.getByRole('searchbox', { name: '搜索知识点' }).fill('Java 内存模型');
  await expect(page.locator('.search-result').first()).toBeVisible();
  await page.locator('.search-result').first().click();
  await expect(page.locator('.article')).toBeVisible();
});

test('practises a random question before revealing its answer', async ({ page }) => {
  await expect(page.locator('[data-route="quiz"]')).toHaveCount(2);
  await page.locator('[data-route="quiz"]:visible').click();

  await expect(page).toHaveURL(/#\/quiz$/);
  const question = page.locator('[data-quiz-question]');
  await expect(question).toBeVisible();
  await expect(question).toContainText('专题：');
  await expect(question).toContainText('来源文档：');
  const firstQuestion = await question.textContent();
  await expect(page.locator('[data-quiz-answer]')).toHaveCount(0);

  await page.getByRole('button', { name: '查看答案' }).click();
  const answer = page.locator('[data-quiz-answer]');
  await expect(answer).toBeVisible();
  await expect(answer.getByRole('heading', { name: '参考答案' })).toBeVisible();
  await expect(answer.locator('.article')).not.toBeEmpty();
  await expect(page.getByRole('group', { name: '学习状态' })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看原文' })).toBeVisible();
  await expect(page.getByRole('button', { name: '下一题' })).toBeVisible();

  await page.getByRole('button', { name: '需复习' }).click();
  await expect(question).toHaveText(firstQuestion);
  await expect(answer).toBeVisible();
  await expect(page.getByRole('button', { name: '需复习' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '下一题' }).click();
  await expect(question).not.toHaveText(firstQuestion);
  await expect(page.locator('[data-quiz-answer]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看答案' })).toBeVisible();
});

test('shows the correct primary navigation for the viewport', async ({ page }, testInfo) => {
  const isDesktop = testInfo.project.name.startsWith('desktop');
  if (isDesktop) {
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.mobile-nav')).toBeHidden();
  } else {
    await expect(page.locator('.mobile-nav')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeHidden();
  }
});
