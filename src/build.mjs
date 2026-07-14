import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import MarkdownIt from 'markdown-it';

import config from '../site.config.mjs';

function slugify(value) {
  const slug = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[`'"“”‘’：:，,。！？!?、（）()【】\[\]{}<>]/g, ' ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'section';
}

function uniqueSlug(value, counts) {
  const base = slugify(value);
  const count = (counts.get(base) || 0) + 1;
  counts.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

function escapeMarkdownLabel(value) {
  return value.replace(/[\[\]]/g, '\\$&');
}

function convertWikiLinks(source, catalog) {
  return source.replace(/\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g, (_match, target, heading, alias) => {
    const normalizedTarget = target.trim().replace(/\.md$/i, '');
    const linked = catalog.get(normalizedTarget);
    const label = (alias || heading || normalizedTarget).trim();

    if (!linked) {
      return escapeMarkdownLabel(label);
    }

    const anchor = heading ? `/${slugify(heading)}` : '';
    return `[${escapeMarkdownLabel(label)}](#/read/${linked.slug}${anchor})`;
  });
}

function tokenText(tokens, start, end) {
  return tokens
    .slice(start, end)
    .filter((token) => token.type === 'inline' || token.type === 'fence' || token.type === 'code_block')
    .map((token) => token.content)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createMarkdownRenderer() {
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false
  });

  markdown.renderer.rules.table_open = () => '<div class="table-scroll"><table>\n';
  markdown.renderer.rules.table_close = () => '</table></div>\n';
  return markdown;
}

export function buildDocument(source, entry, catalog) {
  const markdown = createMarkdownRenderer();
  const converted = convertWikiLinks(source, catalog);
  const tokens = markdown.parse(converted, {});
  const headingCounts = new Map();
  const pointCounts = new Map();
  const hierarchy = [];
  const headings = [];
  let title = entry.file.replace(/\.md$/i, '');

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'heading_open') continue;

    const level = Number(token.tag.slice(1));
    const headingTitle = tokens[index + 1]?.content?.trim() || '未命名章节';
    const headingId = uniqueSlug(headingTitle, headingCounts);
    token.attrSet('id', headingId);

    if (level === 1) title = headingTitle;
    hierarchy[level] = headingTitle;
    hierarchy.length = level + 1;

    const nextHeadingIndex = tokens.findIndex((candidate, candidateIndex) => (
      candidateIndex > index
      && candidate.type === 'heading_open'
      && Number(candidate.tag.slice(1)) <= level
    ));
    const bodyEnd = nextHeadingIndex === -1 ? tokens.length : nextHeadingIndex;
    const bodyText = tokenText(tokens, index + 2, bodyEnd);

    if ((level === 2 || level === 3) && bodyText) {
      const pathTitles = hierarchy.slice(2, level + 1).filter(Boolean);
      const pathSlug = pathTitles.map(slugify).join('::');
      const basePointId = `${entry.slug}::${pathSlug}`;
      const duplicateCount = (pointCounts.get(basePointId) || 0) + 1;
      pointCounts.set(basePointId, duplicateCount);
      const pointId = duplicateCount === 1 ? basePointId : `${basePointId}::${duplicateCount}`;

      headings.push({
        id: pointId,
        headingId,
        title: headingTitle,
        level,
        documentSlug: entry.slug,
        topic: entry.topic,
        excerpt: bodyText.slice(0, 180)
      });
    }
  }

  const html = markdown.renderer.render(tokens, markdown.options, {});
  const searchText = tokens
    .filter((token) => token.type === 'inline' || token.type === 'fence' || token.type === 'code_block')
    .map((token) => token.content)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    slug: entry.slug,
    topic: entry.topic,
    title,
    html,
    searchText,
    points: headings
  };
}

export function buildSiteData(siteConfig, rootDir) {
  const slugSet = new Set();
  const catalog = new Map();

  for (const entry of siteConfig.documents) {
    if (slugSet.has(entry.slug)) throw new Error(`重复文档 slug: ${entry.slug}`);
    slugSet.add(entry.slug);
    catalog.set(entry.file.replace(/\.md$/i, ''), entry);
  }

  const documents = siteConfig.documents.map((entry) => {
    const filePath = path.join(rootDir, entry.file);
    if (!fs.existsSync(filePath)) throw new Error(`允许列表文件不存在: ${entry.file}`);
    return buildDocument(fs.readFileSync(filePath, 'utf8'), entry, catalog);
  });
  const points = documents.flatMap((document) => document.points);
  const pointIds = new Set();

  for (const point of points) {
    if (pointIds.has(point.id)) throw new Error(`重复知识点 ID: ${point.id}`);
    pointIds.add(point.id);
  }

  return {
    title: siteConfig.title,
    generatedAt: new Date().toISOString(),
    documents,
    points
  };
}

export async function writeSite({ rootDir = process.cwd(), outputFile = 'site/index.html' } = {}) {
  const { renderPage } = await import('./template.mjs');
  const data = buildSiteData(config, rootDir);
  const html = renderPage(data, rootDir);
  const absoluteOutput = path.resolve(rootDir, outputFile);
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, html);
  return { data, html, outputFile: absoluteOutput };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const result = await writeSite();
  const size = Buffer.byteLength(result.html);
  process.stdout.write(`生成 ${path.relative(process.cwd(), result.outputFile)}，${result.data.documents.length} 份文档，${result.data.points.length} 个知识点，${(size / 1024 / 1024).toFixed(2)} MB\n`);
}
