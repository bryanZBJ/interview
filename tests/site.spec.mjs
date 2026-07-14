import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('renders the responsive learning dashboard without horizontal overflow', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '学习驾驶舱' })).toBeVisible();
  await expect(page.getByText('732', { exact: true })).toBeVisible();

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
