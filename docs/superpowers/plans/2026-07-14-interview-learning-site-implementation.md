# Interview Learning Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a private, mobile-first interview knowledge site generated from the repository Markdown files, with searchable content and cross-device learning progress.

**Architecture:** A Vinext application renders the `Knowledge Studio` UI and is deployed as a Cloudflare Worker. A build-time content pipeline parses an explicit Markdown allowlist into generated JSON documents and a MiniSearch index. Worker middleware protects every route with a rotatable secret-link session, while D1 stores the single-user progress state and browser storage only queues temporarily unsynced changes.

**Tech Stack:** TypeScript, React 19, Vinext/Next App Router, Vite, Cloudflare Worker, D1, Drizzle ORM, unified/remark/rehype, MiniSearch, Lucide React, Vitest, Testing Library, Playwright, GitHub Actions.

---

## File Structure

Create the site in `learning-site/` so the root remains the Markdown vault.

```text
learning-site/
├── .openai/hosting.json                 # Sites project and DB binding declaration
├── app/
│   ├── api/progress/route.ts            # Authorized D1 progress API
│   ├── knowledge/page.tsx               # Topic library and search
│   ├── notes/[documentSlug]/page.tsx    # Markdown document reader
│   ├── review/page.tsx                  # Review queue
│   ├── globals.css                      # Knowledge Studio tokens and responsive rules
│   ├── layout.tsx                       # Metadata, theme bootstrapping, shell
│   └── page.tsx                         # Learning dashboard
├── components/
│   ├── AppShell.tsx                     # Desktop sidebar and mobile bottom navigation
│   ├── Dashboard.tsx                    # Summary, continuation, topic progress
│   ├── DocumentReader.tsx               # TOC, content, previous/next navigation
│   ├── KnowledgeLibrary.tsx             # Topic list, filters, search results
│   ├── ProgressProvider.tsx             # D1 sync and temporary offline queue
│   ├── ProgressSegment.tsx              # Three-state accessible control
│   ├── ReviewQueue.tsx                  # Review-only knowledge point list
│   ├── SearchDialog.tsx                 # Command+K/Ctrl+K search
│   └── ThemeToggle.tsx                  # Light/dark/system preference
├── content/
│   ├── content.config.ts                # Explicit publication allowlist
│   └── knowledge-point-registry.json    # Stable committed UUID registry
├── db/
│   ├── index.ts                         # D1 Drizzle accessor
│   └── schema.ts                        # learning_progress table
├── drizzle/                             # Generated and reviewed D1 migrations
├── lib/
│   ├── content/types.ts                 # Generated-content contracts
│   ├── content/client.ts                # Browser catalog/document/search loader
│   ├── progress/contracts.ts            # API and status contracts
│   ├── progress/offlineQueue.ts         # Temporary local retry queue
│   ├── server/access.ts                 # Secret-link and Cookie functions
│   └── server/progressService.ts        # Validation and D1 upsert behavior
├── public/generated/                    # Build output; not committed
│   ├── catalog.json
│   ├── search-index.json
│   └── documents/*.json
├── scripts/content/
│   ├── build-content.ts                 # Pipeline coordinator
│   ├── links.ts                         # Obsidian link conversion and validation
│   ├── parser.ts                        # Markdown to structured HTML
│   ├── registry.ts                      # Stable knowledge-point matching
│   └── search.ts                        # MiniSearch serialization
├── tests/
│   ├── fixtures/                        # Small Chinese Markdown fixtures
│   ├── content/*.test.ts                # Parser, links, registry, search
│   ├── progress/*.test.ts               # Validation and offline queue
│   ├── server/access.test.ts             # Secret-link middleware helpers
│   └── ui/*.test.tsx                    # Dashboard, reader, state controls
├── worker/index.ts                      # Auth gate then Vinext handler
├── playwright.config.ts
├── vite.config.ts
└── package.json
.github/workflows/learning-site.yml       # Test, build and Cloudflare deploy
.gitignore                               # Secrets, preview and build output
```

## Task 1: Scaffold the Site and Lock the Toolchain

**Files:**
- Create: `learning-site/` from the Sites Vinext starter
- Modify: `learning-site/package.json`
- Modify: `learning-site/.openai/hosting.json`
- Modify: `.gitignore`
- Delete after replacement: `learning-site/app/_sites-preview/`

- [ ] **Step 1: Create the isolated site project**

Run:

```bash
/Users/zbj/.codex/plugins/cache/openai-bundled/sites/0.1.27/scripts/init-site.sh "$PWD/learning-site"
```

Expected: the starter installs successfully and `learning-site/app/page.tsx`, `learning-site/worker/index.ts`, and `learning-site/.openai/hosting.json` exist.

- [ ] **Step 2: Install the content, search, icon, and test dependencies**

Run:

```bash
cd learning-site
npm install gray-matter unified remark-parse remark-gfm remark-rehype rehype-stringify rehype-sanitize github-slugger mdast-util-to-string hast-util-to-text unist-util-visit minisearch lucide-react
npm install -D tsx vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

Expected: `package-lock.json` updates without audit or resolution failures.

- [ ] **Step 3: Add deterministic scripts to `learning-site/package.json`**

Set the scripts object to include:

```json
{
  "content:build": "tsx scripts/content/build-content.ts",
  "predev": "npm run content:build",
  "dev": "WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext dev",
  "prebuild": "npm run content:build",
  "build": "WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext build",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "lint": "eslint . --ignore-pattern dist --ignore-pattern .next --ignore-pattern public/generated",
  "db:generate": "drizzle-kit generate"
}
```

- [ ] **Step 4: Declare D1 and ignore generated/private files**

Set `learning-site/.openai/hosting.json` to:

```json
{
  "d1": "DB",
  "r2": null
}
```

Create or extend root `.gitignore` with:

```gitignore
.DS_Store
.superpowers/
**/node_modules/
**/.next/
**/dist/
**/.wrangler/
**/.env*
!**/.env.example
learning-site/public/generated/
learning-site/playwright-report/
learning-site/test-results/
jianli/
*.doc
*.docx
*.pdf
```

- [ ] **Step 5: Verify the untouched starter before product changes**

Run:

```bash
cd learning-site
npm run build
```

Expected: exit code 0 and `dist/server/index.js` exists.

- [ ] **Step 6: Commit the scaffold**

```bash
git add .gitignore learning-site
git commit -m "chore: scaffold interview learning site"
```

## Task 2: Define the Publication Allowlist and Content Contracts

**Files:**
- Create: `learning-site/content/content.config.ts`
- Create: `learning-site/lib/content/types.ts`
- Create: `learning-site/tests/content/content-config.test.ts`
- Create: `learning-site/vitest.config.ts`

- [ ] **Step 1: Write the failing allowlist test**

Create `learning-site/tests/content/content-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { publishedDocuments } from "../../content/content.config";

describe("publication allowlist", () => {
  it("contains only explicit root Markdown files", () => {
    expect(publishedDocuments.length).toBeGreaterThan(10);
    expect(publishedDocuments.every((item) => item.source.endsWith(".md"))).toBe(true);
    expect(publishedDocuments.some((item) => item.source.includes("jianli"))).toBe(false);
    expect(publishedDocuments.some((item) => item.source.includes("简历"))).toBe(false);
    expect(new Set(publishedDocuments.map((item) => item.slug)).size).toBe(publishedDocuments.length);
  });
});
```

Create `learning-site/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
```

Create `learning-site/tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run:

```bash
cd learning-site
npx vitest run tests/content/content-config.test.ts
```

Expected: FAIL because `content/content.config.ts` does not exist.

- [ ] **Step 3: Create the explicit allowlist**

Create `learning-site/content/content.config.ts` with this exact shape and list:

```ts
export interface PublishedDocumentConfig {
  source: string;
  slug: string;
  topic: string;
  order: number;
}

export const publishedDocuments: PublishedDocumentConfig[] = [
  { source: "Java核心基础面试指南.md", slug: "java-core", topic: "Java", order: 10 },
  { source: "Java JVM高频面试题与线上排障指南.md", slug: "jvm", topic: "Java", order: 20 },
  { source: "Java并发编程面试指南.md", slug: "java-concurrency", topic: "Java", order: 30 },
  { source: "Java IO面试指南.md", slug: "java-io", topic: "Java", order: 40 },
  { source: "Spring核心原理面试指南.md", slug: "spring", topic: "Spring与微服务", order: 50 },
  { source: "微服务治理面试指南.md", slug: "microservices", topic: "Spring与微服务", order: 60 },
  { source: "分布式组件面试指南.md", slug: "distributed", topic: "分布式", order: 70 },
  { source: "MySQL数据库面试指南.md", slug: "mysql", topic: "数据与搜索", order: 80 },
  { source: "Elasticsearch-OpenSearch面试指南.md", slug: "search", topic: "数据与搜索", order: 90 },
  { source: "Kafka面试指南.md", slug: "kafka", topic: "消息队列", order: 100 },
  { source: "RocketMQ高频面试题.md", slug: "rocketmq", topic: "消息队列", order: 110 },
  { source: "Docker-K8s基础面试指南.md", slug: "docker-k8s", topic: "工程化", order: 120 },
  { source: "可观测性面试指南.md", slug: "observability", topic: "工程化", order: 130 },
  { source: "安全认证面试指南.md", slug: "security", topic: "工程化", order: 140 },
  { source: "Java互联网业务场景面试题.md", slug: "business-scenarios", topic: "综合面试", order: 150 },
  { source: "Java高级开发查缺补漏.md", slug: "java-gap-review", topic: "综合面试", order: 160 },
  { source: "面试题复盘.md", slug: "interview-review", topic: "综合面试", order: 170 },
  { source: "AI应用开发面试指南.md", slug: "ai-app", topic: "AI应用", order: 180 },
  { source: "AI Agent岗位面试准备计划.md", slug: "ai-agent", topic: "AI应用", order: 190 }
];
```

- [ ] **Step 4: Add generated-content contracts**

Create `learning-site/lib/content/types.ts`:

```ts
export type LearningStatus = "unlearned" | "review" | "mastered";

export interface KnowledgePoint {
  id: string;
  heading: string;
  headingPath: string[];
  anchor: string;
  level: number;
  html: string;
  plainText: string;
  previousId: string | null;
  nextId: string | null;
}

export interface GeneratedDocument {
  slug: string;
  source: string;
  topic: string;
  title: string;
  updatedAt: string;
  html: string;
  points: KnowledgePoint[];
}

export interface CatalogEntry {
  slug: string;
  topic: string;
  title: string;
  pointCount: number;
  updatedAt: string;
}

export interface GeneratedCatalog {
  generatedAt: string;
  documents: CatalogEntry[];
}
```

- [ ] **Step 5: Run the test and commit**

Run:

```bash
cd learning-site
npx vitest run tests/content/content-config.test.ts
```

Expected: PASS.

```bash
git add learning-site/content learning-site/lib/content learning-site/tests learning-site/vitest.config.ts
git commit -m "feat: define published interview content"
```

## Task 3: Parse Markdown and Resolve Obsidian Links

**Files:**
- Create: `learning-site/scripts/content/parser.ts`
- Create: `learning-site/scripts/content/links.ts`
- Create: `learning-site/tests/fixtures/jvm-sample.md`
- Create: `learning-site/tests/content/parser.test.ts`
- Create: `learning-site/tests/content/links.test.ts`

- [ ] **Step 1: Add a Chinese fixture and failing parser tests**

Create `learning-site/tests/fixtures/jvm-sample.md`:

```markdown
# JVM 示例

## 1. 内存区域

### Q1：什么是 Java 内存模型？

JMM 解决可见性、有序性和原子性。

```java
private volatile boolean running = true;
```

| 概念 | 含义 |
|---|---|
| JMM | 并发内存访问规范 |
```

Create `learning-site/tests/content/parser.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../../scripts/content/parser";

describe("parseMarkdown", () => {
  it("preserves Chinese headings, code, and tables", async () => {
    const markdown = await readFile("tests/fixtures/jvm-sample.md", "utf8");
    const result = await parseMarkdown(markdown);

    expect(result.title).toBe("JVM 示例");
    expect(result.headings.map((item) => item.text)).toContain("Q1：什么是 Java 内存模型？");
    expect(result.html).toContain("<table>");
    expect(result.html).toContain("volatile boolean running");
  });
});
```

- [ ] **Step 2: Add a failing Obsidian link test**

Create `learning-site/tests/content/links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { convertObsidianLinks } from "../../scripts/content/links";

describe("convertObsidianLinks", () => {
  it("converts document and heading aliases", () => {
    const result = convertObsidianLinks(
      "参见 [[Java JVM高频面试题与线上排障指南#1. JVM 运行时内存区域|JVM 内存]]",
      new Map([["Java JVM高频面试题与线上排障指南", "jvm"]])
    );
    expect(result.markdown).toContain("[JVM 内存](/notes/jvm#1-jvm-运行时内存区域)");
    expect(result.unresolved).toEqual([]);
  });
});
```

- [ ] **Step 3: Run both tests and confirm missing implementation failures**

Run:

```bash
cd learning-site
npx vitest run tests/content/parser.test.ts tests/content/links.test.ts
```

Expected: FAIL because parser and link modules do not exist.

- [ ] **Step 4: Implement the Markdown parser**

Create `learning-site/scripts/content/parser.ts` with these exported contracts and behavior:

```ts
import GithubSlugger from "github-slugger";
import { toText } from "hast-util-to-text";
import { toString } from "mdast-util-to-string";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";

export interface ParsedHeading {
  level: number;
  text: string;
  anchor: string;
  plainText: string;
}

export interface ParsedMarkdown {
  title: string;
  html: string;
  plainText: string;
  headings: ParsedHeading[];
}

function rehypeHeadingIds() {
  const slugger = new GithubSlugger();
  return (tree: unknown) => {
    visit(tree as never, "element", (node: { tagName?: string; properties?: Record<string, unknown> }) => {
      if (!node.tagName || !/^h[1-6]$/.test(node.tagName)) return;
      node.properties ??= {};
      node.properties.id = slugger.slug(toText(node as never));
    });
  };
}

export async function parseMarkdown(markdown: string): Promise<ParsedMarkdown> {
  const slugger = new GithubSlugger();
  const headings: ParsedHeading[] = [];
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);

  visit(tree, "heading", (node: { depth: number; children: unknown[] }) => {
    const text = toString(node as never).trim();
    headings.push({ level: node.depth, text, anchor: slugger.slug(text), plainText: text });
  });

  const htmlTree = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeHeadingIds)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown);

  return {
    title: headings.find((heading) => heading.level === 1)?.text ?? "未命名文档",
    html: String(htmlTree),
    plainText: toString(tree).replace(/\s+/g, " ").trim(),
    headings,
  };
}
```

Extend the parser test with `expect(result.html).toContain('id="q1什么是-java-内存模型"')`; if the installed `github-slugger` emits a different deterministic anchor, assert the value returned in `result.headings[1].anchor` rather than hard-coding a second slug algorithm.

- [ ] **Step 5: Implement Obsidian link conversion and unresolved-link reporting**

Create `learning-site/scripts/content/links.ts`:

```ts
import GithubSlugger from "github-slugger";

export interface ConvertedLinks {
  markdown: string;
  unresolved: string[];
}

export function convertObsidianLinks(markdown: string, slugs: Map<string, string>): ConvertedLinks {
  const unresolved: string[] = [];
  const converted = markdown.replace(/\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g, (_, file, heading, alias) => {
    const normalizedFile = String(file).trim().replace(/\.md$/, "");
    const slug = slugs.get(normalizedFile);
    if (!slug) {
      unresolved.push(normalizedFile);
      return alias ? String(alias) : normalizedFile;
    }
    const anchor = heading ? `#${new GithubSlugger().slug(String(heading).trim())}` : "";
    const label = String(alias ?? heading ?? normalizedFile).trim();
    return `[${label}](/notes/${slug}${anchor})`;
  });
  return { markdown: converted, unresolved };
}
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
cd learning-site
npx vitest run tests/content/parser.test.ts tests/content/links.test.ts
```

Expected: PASS, including heading IDs after the rehype plugin is added.

```bash
git add learning-site/scripts/content learning-site/tests/content learning-site/tests/fixtures
git commit -m "feat: parse interview markdown content"
```

## Task 4: Generate Stable Knowledge Points and Search Artifacts

**Files:**
- Create: `learning-site/scripts/content/registry.ts`
- Create: `learning-site/scripts/content/search.ts`
- Create: `learning-site/scripts/content/build-content.ts`
- Create: `learning-site/content/knowledge-point-registry.json`
- Create: `learning-site/tests/content/registry.test.ts`
- Create: `learning-site/tests/content/build-content.test.ts`

- [ ] **Step 1: Write failing stable-ID tests**

Create `learning-site/tests/content/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reconcilePoints } from "../../scripts/content/registry";

describe("reconcilePoints", () => {
  it("keeps the same id when body text changes", () => {
    const oldRegistry = [{ id: "kp-jmm", source: "jvm.md", headingPath: ["JMM"], fingerprint: "old", ordinal: 2 }];
    const result = reconcilePoints(oldRegistry, [{ source: "jvm.md", headingPath: ["JMM"], fingerprint: "new", ordinal: 2 }]);
    expect(result.points[0].id).toBe("kp-jmm");
  });

  it("keeps the same id for a renamed heading with matching content and position", () => {
    const oldRegistry = [{ id: "kp-jmm", source: "jvm.md", headingPath: ["Java 内存模型"], fingerprint: "abc", ordinal: 2 }];
    const result = reconcilePoints(oldRegistry, [{ source: "jvm.md", headingPath: ["什么是 JMM"], fingerprint: "abc", ordinal: 2 }]);
    expect(result.points[0].id).toBe("kp-jmm");
    expect(result.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the registry test and verify failure**

Run:

```bash
cd learning-site
npx vitest run tests/content/registry.test.ts
```

Expected: FAIL because `reconcilePoints` is missing.

- [ ] **Step 3: Implement deterministic reconciliation**

Create `learning-site/scripts/content/registry.ts` with:

```ts
import { randomUUID } from "node:crypto";

export interface RegistryPoint {
  id: string;
  source: string;
  headingPath: string[];
  fingerprint: string;
  ordinal: number;
}

type Candidate = Omit<RegistryPoint, "id">;

export function reconcilePoints(existing: RegistryPoint[], candidates: Candidate[]) {
  const unused = new Set(existing.map((point) => point.id));
  const warnings: string[] = [];
  const points = candidates.map((candidate) => {
    const exact = existing.find((point) =>
      unused.has(point.id) &&
      point.source === candidate.source &&
      point.headingPath.join("\u0000") === candidate.headingPath.join("\u0000")
    );
    const renamed = existing.find((point) =>
      unused.has(point.id) &&
      point.source === candidate.source &&
      point.fingerprint === candidate.fingerprint &&
      Math.abs(point.ordinal - candidate.ordinal) <= 1
    );
    const match = exact ?? renamed;
    const id = match?.id ?? randomUUID();
    if (match) unused.delete(match.id);
    if (!match && existing.some((point) => point.source === candidate.source)) {
      warnings.push(`new knowledge point: ${candidate.source} :: ${candidate.headingPath.join(" > ")}`);
    }
    return { ...candidate, id };
  });
  return { points, warnings, retiredIds: [...unused] };
}
```

- [ ] **Step 4: Implement MiniSearch serialization**

Create `learning-site/scripts/content/search.ts`:

```ts
import MiniSearch from "minisearch";
import type { GeneratedDocument } from "../../lib/content/types";

export function buildSearchIndex(documents: GeneratedDocument[]) {
  const search = new MiniSearch({
    fields: ["heading", "plainText", "title", "topic"],
    storeFields: ["id", "heading", "documentSlug", "title", "topic", "anchor"],
    searchOptions: { boost: { heading: 3, title: 2 }, prefix: true, fuzzy: 0.2 },
  });
  search.addAll(documents.flatMap((document) => document.points.map((point) => ({
    id: point.id,
    heading: point.heading,
    plainText: point.plainText,
    documentSlug: document.slug,
    title: document.title,
    topic: document.topic,
    anchor: point.anchor,
  }))));
  return search.toJSON();
}
```

- [ ] **Step 5: Implement the build coordinator**

Create `learning-site/scripts/content/build-content.ts` to perform this exact sequence:

1. Resolve the vault root as `path.resolve(process.cwd(), "..")` when executed inside `learning-site`.
2. Build a filename-to-slug map from `publishedDocuments`.
3. Fail if any allowed source file is absent.
4. Convert Obsidian links, parse Markdown, and collect unresolved links.
5. Recognize knowledge points from level-2/3 headings that have body text, prioritizing headings matching `/^(Q\d+|.*追问|\d+(?:\.\d+)*[.、：])/`.
6. Compute a SHA-256 fingerprint from normalized point body text and store its source ordinal.
7. Reconcile with `content/knowledge-point-registry.json` and write the updated registry with stable key ordering.
8. Write `public/generated/catalog.json`, one `public/generated/documents/<slug>.json` per document, and `public/generated/search-index.json`.
9. Print all unresolved links and ID migration warnings; exit non-zero only for missing allowed documents, unsafe links, duplicate slugs/IDs, or an empty generated catalog.

Export `buildContent(options)` from the module so tests can run it against a temporary fixture directory without invoking the CLI branch.

- [ ] **Step 6: Add a build integration test**

Create `learning-site/tests/content/build-content.test.ts` that copies two fixture Markdown files into a temporary directory, calls `buildContent`, and asserts:

```ts
expect(result.catalog.documents).toHaveLength(2);
expect(result.catalog.documents[0].pointCount).toBeGreaterThan(0);
expect(result.duplicateIds).toEqual([]);
expect(await readFile(path.join(outputDir, "search-index.json"), "utf8")).toContain("Java 内存模型");
```

- [ ] **Step 7: Run content tests and generate the real catalog**

Run:

```bash
cd learning-site
npx vitest run tests/content
npm run content:build
```

Expected: all content tests PASS; the real build reports 19 documents and writes generated JSON without publishing excluded files.

- [ ] **Step 8: Commit the pipeline and registry, not generated output**

```bash
git add learning-site/scripts/content learning-site/content/knowledge-point-registry.json learning-site/tests/content learning-site/tests/fixtures
git commit -m "feat: generate stable searchable knowledge points"
```

## Task 5: Add D1 Progress Persistence and API Validation

**Files:**
- Modify: `learning-site/db/schema.ts`
- Keep/verify: `learning-site/db/index.ts`
- Create: `learning-site/lib/progress/contracts.ts`
- Create: `learning-site/lib/server/progressService.ts`
- Create: `learning-site/app/api/progress/route.ts`
- Create: `learning-site/tests/progress/progress-service.test.ts`
- Create: `learning-site/drizzle/*_learning_progress.sql`

- [ ] **Step 1: Write failing validation tests**

Create `learning-site/tests/progress/progress-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseProgressUpdates } from "../../lib/server/progressService";

describe("parseProgressUpdates", () => {
  it("accepts valid updates and rejects unknown statuses", () => {
    expect(parseProgressUpdates([{ knowledgePointId: "kp-1", status: "review", updatedAt: 10, clientRevision: 1 }])).toHaveLength(1);
    expect(() => parseProgressUpdates([{ knowledgePointId: "kp-1", status: "done", updatedAt: 10, clientRevision: 1 }])).toThrow("invalid status");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
cd learning-site
npx vitest run tests/progress/progress-service.test.ts
```

Expected: FAIL because `progressService` is missing.

- [ ] **Step 3: Define contracts and the Drizzle schema**

Create `learning-site/lib/progress/contracts.ts`:

```ts
export const learningStatuses = ["unlearned", "review", "mastered"] as const;
export type LearningStatus = (typeof learningStatuses)[number];

export interface ProgressUpdate {
  knowledgePointId: string;
  status: LearningStatus;
  lastReadAnchor?: string | null;
  lastReadAt?: number | null;
  updatedAt: number;
  clientRevision: number;
}
```

Replace `learning-site/db/schema.ts` with:

```ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const learningProgress = sqliteTable("learning_progress", {
  knowledgePointId: text("knowledge_point_id").primaryKey(),
  status: text("status", { enum: ["unlearned", "review", "mastered"] }).notNull(),
  lastReadAnchor: text("last_read_anchor"),
  lastReadAt: integer("last_read_at"),
  updatedAt: integer("updated_at").notNull(),
  clientRevision: integer("client_revision").notNull(),
});
```

- [ ] **Step 4: Implement payload validation and conflict rules**

Create `learning-site/lib/server/progressService.ts` with `parseProgressUpdates(input)` that:

- requires an array of at most 100 items;
- requires non-empty `knowledgePointId` no longer than 100 characters;
- accepts only the three declared statuses;
- requires finite positive integer timestamps and revisions;
- normalizes absent anchors/read times to `null`;
- throws an `Error` with `invalid status`, `invalid knowledgePointId`, or `invalid revision` as the applicable message.

Also export `shouldApplyUpdate(existing, incoming)` returning `true` when the incoming `updatedAt` is newer, or when timestamps tie and `clientRevision` is greater.

- [ ] **Step 5: Implement GET and PUT API routes**

Create `learning-site/app/api/progress/route.ts`:

```ts
import { sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { learningProgress } from "../../../db/schema";
import { parseProgressUpdates } from "../../../lib/server/progressService";

export async function GET() {
  const rows = await getDb().select().from(learningProgress);
  return Response.json({ progress: rows });
}

export async function PUT(request: Request) {
  try {
    const updates = parseProgressUpdates(await request.json());
    const db = getDb();
    for (const update of updates) {
      await db.insert(learningProgress).values(update).onConflictDoUpdate({
        target: learningProgress.knowledgePointId,
        set: update,
        setWhere: sql`${learningProgress.updatedAt} < ${update.updatedAt}
          OR (${learningProgress.updatedAt} = ${update.updatedAt}
          AND ${learningProgress.clientRevision} < ${update.clientRevision})`
      });
    }
    return Response.json({ accepted: updates.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid progress payload";
    return Response.json({ error: message }, { status: 400 });
  }
}
```

Add an API/repository test that seeds revision 2, submits revision 1 with an older timestamp, and asserts the stored row remains revision 2.

- [ ] **Step 6: Generate and inspect the migration**

Run:

```bash
cd learning-site
npm run db:generate
```

Expected: one migration creates `learning_progress`; edit the generated SQL to include:

```sql
CHECK (`status` IN ('unlearned', 'review', 'mastered'))
```

and confirm it contains exactly one `CREATE TABLE` statement plus generated indexes if any.

- [ ] **Step 7: Run tests and commit**

```bash
cd learning-site
npx vitest run tests/progress/progress-service.test.ts
npm run build
```

Expected: tests PASS and Vinext compiles the API route.

```bash
git add learning-site/db learning-site/drizzle learning-site/lib/progress learning-site/lib/server/progressService.ts learning-site/app/api/progress learning-site/tests/progress
git commit -m "feat: persist learning progress in d1"
```

## Task 6: Protect the Entire Worker with a Rotatable Secret Link

**Files:**
- Create: `learning-site/lib/server/access.ts`
- Modify: `learning-site/worker/index.ts`
- Create: `learning-site/tests/server/access.test.ts`
- Create: `learning-site/.env.example`

- [ ] **Step 1: Write failing access-helper tests**

Create `learning-site/tests/server/access.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSessionToken, hasValidSession, stripAccessKey } from "../../lib/server/access";

describe("private access", () => {
  it("accepts only a cookie derived from the current secret", async () => {
    const token = await createSessionToken("secret-a");
    expect(await hasValidSession(`interview_session=${token}`, "secret-a")).toBe(true);
    expect(await hasValidSession(`interview_session=${token}`, "secret-b")).toBe(false);
  });

  it("removes the secret from the redirect URL", () => {
    expect(stripAccessKey(new URL("https://notes.test/?access_key=abc&from=phone")).toString()).toBe("https://notes.test/?from=phone");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
cd learning-site
npx vitest run tests/server/access.test.ts
```

Expected: FAIL because access helpers do not exist.

- [ ] **Step 3: Implement access helpers**

Create `learning-site/lib/server/access.ts`:

```ts
const COOKIE_NAME = "interview_session";

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(secret: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`interview-notes:${secret}`)));
}

export async function hasValidSession(cookieHeader: string | null, secret: string) {
  const token = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  return Boolean(token && token === await createSessionToken(secret));
}

export function createSessionCookie(token: string) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`;
}

export function stripAccessKey(url: URL) {
  const clean = new URL(url);
  clean.searchParams.delete("access_key");
  return clean;
}
```

- [ ] **Step 4: Add the Worker gate before the Vinext handler**

Modify `learning-site/worker/index.ts` so `Env` includes `ACCESS_KEY: string`. At the beginning of `fetch`:

1. Return status 500 with a generic message if `ACCESS_KEY` is absent.
2. If `url.searchParams.get("access_key") === env.ACCESS_KEY`, generate a session token, set the secure Cookie, and return a 302 redirect to `stripAccessKey(url)`.
3. If the Cookie is invalid, return a minimal 401 HTML response with `Cache-Control: no-store`; do not call the Vinext handler or asset binding.
4. If valid, call the existing image path handling and then `handler.fetch`.
5. Apply `Cache-Control: private, no-store` to API responses and private HTML responses.

Create `learning-site/.env.example`:

```dotenv
ACCESS_KEY=generate-a-long-random-value-before-first-deploy
```

- [ ] **Step 5: Run tests and commit**

```bash
cd learning-site
npx vitest run tests/server/access.test.ts
npm run build
```

Expected: tests PASS and Worker build succeeds.

```bash
git add learning-site/lib/server/access.ts learning-site/worker/index.ts learning-site/tests/server learning-site/.env.example
git commit -m "feat: protect notes with private access link"
```

## Task 7: Build Cross-Device Progress State with Offline Retry

**Files:**
- Create: `learning-site/lib/progress/offlineQueue.ts`
- Create: `learning-site/components/ProgressProvider.tsx`
- Create: `learning-site/components/ProgressSegment.tsx`
- Create: `learning-site/tests/progress/offline-queue.test.ts`
- Create: `learning-site/tests/ui/progress-segment.test.tsx`

- [ ] **Step 1: Write failing queue and segmented-control tests**

Queue assertions:

```ts
queue.enqueue({ knowledgePointId: "kp-1", status: "review", updatedAt: 10, clientRevision: 1 });
queue.enqueue({ knowledgePointId: "kp-1", status: "mastered", updatedAt: 11, clientRevision: 2 });
expect(queue.read()).toEqual([{ knowledgePointId: "kp-1", status: "mastered", updatedAt: 11, clientRevision: 2 }]);
```

UI assertions:

```tsx
render(<ProgressSegment value="review" onChange={onChange} />);
expect(screen.getByRole("radio", { name: "需复习" })).toBeChecked();
await user.click(screen.getByRole("radio", { name: "已掌握" }));
expect(onChange).toHaveBeenCalledWith("mastered");
```

- [ ] **Step 2: Run tests and verify missing module failures**

Run:

```bash
cd learning-site
npx vitest run tests/progress/offline-queue.test.ts tests/ui/progress-segment.test.tsx
```

Expected: FAIL because queue and component modules do not exist.

- [ ] **Step 3: Implement a deduplicating local retry queue**

`offlineQueue.ts` must use one key, `interview-progress-pending-v1`, and expose `read`, `enqueue`, `remove`, and `clear`. `enqueue` replaces an older entry with the same `knowledgePointId`; malformed stored JSON resets to an empty array. This storage is temporary only and is never used as the authoritative progress database.

Use this implementation shape:

```ts
import type { ProgressUpdate } from "./contracts";

const KEY = "interview-progress-pending-v1";

export function createOfflineQueue(storage: Storage) {
  const read = (): ProgressUpdate[] => {
    try {
      const value = JSON.parse(storage.getItem(KEY) ?? "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      storage.removeItem(KEY);
      return [];
    }
  };
  const write = (items: ProgressUpdate[]) => storage.setItem(KEY, JSON.stringify(items));
  return {
    read,
    enqueue(update: ProgressUpdate) {
      write([...read().filter((item) => item.knowledgePointId !== update.knowledgePointId), update]);
    },
    remove(ids: string[]) {
      const accepted = new Set(ids);
      write(read().filter((item) => !accepted.has(item.knowledgePointId)));
    },
    clear() {
      storage.removeItem(KEY);
    },
  };
}
```

- [ ] **Step 4: Implement `ProgressProvider`**

The provider must:

- fetch `/api/progress` once after mount;
- expose `progressById`, `setStatus`, `setLastRead`, `syncState`, and `retryPending`;
- update React state immediately when the user changes status;
- enqueue before sending `PUT /api/progress`;
- remove accepted entries after a successful response;
- retry on `online` events and initial load;
- expose `syncState` as `synced`, `syncing`, `pending`, or `error`;
- use increasing `clientRevision` values per browser tab;
- never place the private access key in browser storage or API payloads.

- [ ] **Step 5: Implement the accessible three-state control**

`ProgressSegment.tsx` must render a labeled `radiogroup` with three radio buttons. Each target is at least 44px high, includes visible text, supports arrow-key selection through native radio behavior, and uses `aria-live="polite"` for sync feedback outside the group.

Use native radios rather than clickable `div` elements:

```tsx
"use client";
import type { LearningStatus } from "../lib/progress/contracts";

const options: Array<[LearningStatus, string]> = [
  ["unlearned", "未学习"],
  ["review", "需复习"],
  ["mastered", "已掌握"],
];

export function ProgressSegment({ value, onChange }: { value: LearningStatus; onChange: (value: LearningStatus) => void }) {
  return (
    <fieldset className="progress-segment">
      <legend>学习状态</legend>
      {options.map(([status, label]) => (
        <label key={status} data-status={status}>
          <input type="radio" name="learning-status" value={status} checked={value === status} onChange={() => onChange(status)} />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}
```

- [ ] **Step 6: Run tests and commit**

```bash
cd learning-site
npx vitest run tests/progress tests/ui/progress-segment.test.tsx
```

Expected: PASS, including last-write deduplication and keyboard-accessible state controls.

```bash
git add learning-site/lib/progress learning-site/components/ProgressProvider.tsx learning-site/components/ProgressSegment.tsx learning-site/tests/progress learning-site/tests/ui/progress-segment.test.tsx
git commit -m "feat: sync progress across devices"
```

## Task 8: Implement the Knowledge Studio Shell and Dashboard

**Files:**
- Modify: `learning-site/app/layout.tsx`
- Modify: `learning-site/app/page.tsx`
- Modify: `learning-site/app/globals.css`
- Create: `learning-site/components/AppShell.tsx`
- Create: `learning-site/components/Dashboard.tsx`
- Create: `learning-site/components/ThemeToggle.tsx`
- Create: `learning-site/lib/content/client.ts`
- Create: `learning-site/tests/ui/dashboard.test.tsx`
- Delete: `learning-site/app/_sites-preview/`

- [ ] **Step 1: Write the failing dashboard behavior test**

Render `Dashboard` with two documents and three progress rows. Assert:

```ts
expect(screen.getByText("今日需复习")).toBeVisible();
expect(screen.getByText("2")).toBeVisible();
expect(screen.getByText("总体掌握度")).toBeVisible();
expect(screen.getByRole("link", { name: "继续阅读" })).toHaveAttribute("href", "/notes/jvm#java-内存模型");
```

- [ ] **Step 2: Run the test and verify failure**

```bash
cd learning-site
npx vitest run tests/ui/dashboard.test.tsx
```

Expected: FAIL because dashboard components do not exist.

- [ ] **Step 3: Implement generated-content loaders**

`lib/content/client.ts` must export:

```ts
export async function loadCatalog(): Promise<GeneratedCatalog>;
export async function loadDocument(slug: string): Promise<GeneratedDocument>;
export async function loadSearchIndex(): Promise<string>;
```

Each fetch must use `cache: "no-store"`, check `response.ok`, and throw a Chinese recovery message such as `知识库加载失败，请刷新重试`.

- [ ] **Step 4: Implement the responsive application shell**

`AppShell.tsx` must use Lucide icons and exactly three top-level destinations: 首页 `/`, 知识库 `/knowledge`, 复习 `/review`.

- Desktop at 1024px and above: fixed-width left navigation plus content region.
- Mobile below 768px: bottom navigation with safe-area padding.
- Tablet: compact top bar plus bottom navigation.
- No navigation action depends only on hover.

- [ ] **Step 5: Apply the confirmed Knowledge Studio tokens**

In `globals.css`, define semantic variables for both themes:

```css
:root {
  --bg: #f8fafc;
  --surface: #ffffff;
  --text: #1e293b;
  --muted: #64748b;
  --border: #e2e8f0;
  --primary: #2563eb;
  --review: #925b07;
  --review-bg: #fff8e8;
  --mastered: #067052;
  --mastered-bg: #ecfdf5;
  --danger: #b91c1c;
}

[data-theme="dark"] {
  --bg: #171b20;
  --surface: #22282f;
  --text: #eef2f5;
  --muted: #aab5bf;
  --border: #39434d;
  --primary: #75a7ff;
  --review: #f5c861;
  --review-bg: #332b1b;
  --mastered: #75d6c7;
  --mastered-bg: #17332e;
  --danger: #ff8c8c;
}
```

Use Noto Sans SC when locally available, then PingFang SC and system sans-serif. Set body text to at least 16px on mobile, line height 1.65, card radius no more than 8px, visible focus rings, and `prefers-reduced-motion` overrides.

- [ ] **Step 6: Implement dashboard calculations and metadata**

Dashboard inputs are catalog, generated point summaries, and `progressById`. It must calculate review count, mastered percentage, topic percentages, and the most recent `lastReadAt`. `app/layout.tsx` sets title `面试学习笔记`, description `Java 与 AI 应用开发面试学习知识库`, viewport metadata, and theme bootstrap without external font requests.

- [ ] **Step 7: Remove starter preview code, run tests, and commit**

```bash
cd learning-site
npx vitest run tests/ui/dashboard.test.tsx
npm run build
```

Expected: test PASS, build succeeds, and no `_sites-preview` import remains.

```bash
git add learning-site/app learning-site/components learning-site/lib/content learning-site/tests/ui/dashboard.test.tsx learning-site/package.json learning-site/package-lock.json
git commit -m "feat: add learning dashboard shell"
```

## Task 9: Implement Knowledge Search and Document Reading

**Files:**
- Create: `learning-site/app/knowledge/page.tsx`
- Create: `learning-site/app/notes/[documentSlug]/page.tsx`
- Create: `learning-site/components/KnowledgeLibrary.tsx`
- Create: `learning-site/components/SearchDialog.tsx`
- Create: `learning-site/components/DocumentReader.tsx`
- Create: `learning-site/tests/ui/knowledge-library.test.tsx`
- Create: `learning-site/tests/ui/document-reader.test.tsx`

- [ ] **Step 1: Write failing search and reader tests**

Search test requirements:

```ts
await user.type(screen.getByRole("searchbox"), "JMM");
expect(await screen.findByText("什么是 Java 内存模型？")).toBeVisible();
expect(screen.getByText("JVM 与线上排障")).toBeVisible();
```

Reader test requirements:

```ts
expect(screen.getByRole("heading", { name: "什么是 Java 内存模型？" })).toBeVisible();
expect(screen.getByRole("navigation", { name: "本文目录" })).toBeVisible();
expect(screen.getByRole("radiogroup", { name: "学习状态" })).toBeVisible();
```

- [ ] **Step 2: Run tests and verify failure**

```bash
cd learning-site
npx vitest run tests/ui/knowledge-library.test.tsx tests/ui/document-reader.test.tsx
```

Expected: FAIL because reader/search components do not exist.

- [ ] **Step 3: Implement the library and MiniSearch client**

`KnowledgeLibrary.tsx` loads catalog and the serialized index, reconstructs MiniSearch with the same field/store configuration used by the build script, and provides:

- debounced search after 150ms;
- topic filter;
- status filter using progress state;
- search suggestions while typing;
- a useful empty state with clear-filter action;
- links to `/notes/<documentSlug>#<anchor>`.

`SearchDialog.tsx` opens on `Command + K` or `Ctrl + K`, traps focus while open, closes on Escape, restores focus to the trigger, and uses the same search results component.

- [ ] **Step 4: Implement the reader**

`DocumentReader.tsx` must:

- load `/generated/documents/<documentSlug>.json`;
- render trusted build-time sanitized HTML;
- show a sticky desktop TOC and a mobile TOC sheet;
- constrain prose to 72ch;
- allow code blocks to scroll horizontally without widening the page;
- update the active heading with IntersectionObserver;
- save the current anchor after 600ms of stable reading;
- place `ProgressSegment` with the active knowledge point;
- provide previous/next point links and preserve native browser history.

- [ ] **Step 5: Run tests and commit**

```bash
cd learning-site
npx vitest run tests/ui/knowledge-library.test.tsx tests/ui/document-reader.test.tsx
npm run build
```

Expected: tests PASS, dynamic document route builds, and generated content is available.

```bash
git add learning-site/app/knowledge learning-site/app/notes learning-site/components/KnowledgeLibrary.tsx learning-site/components/SearchDialog.tsx learning-site/components/DocumentReader.tsx learning-site/tests/ui
git commit -m "feat: add searchable knowledge reader"
```

## Task 10: Implement the Review Queue and Multi-Device UX States

**Files:**
- Create: `learning-site/app/review/page.tsx`
- Create: `learning-site/components/ReviewQueue.tsx`
- Create: `learning-site/tests/ui/review-queue.test.tsx`
- Modify: `learning-site/app/globals.css`

- [ ] **Step 1: Write the failing review-queue test**

```tsx
render(<ReviewQueue points={points} progressById={{ "kp-1": { status: "review" }, "kp-2": { status: "mastered" } }} />);
expect(screen.getByText("需复习 1 项")).toBeVisible();
expect(screen.getByText("运行时常量池")).toBeVisible();
expect(screen.queryByText("Tool Calling")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the test and verify failure**

```bash
cd learning-site
npx vitest run tests/ui/review-queue.test.tsx
```

Expected: FAIL because review queue does not exist.

- [ ] **Step 3: Implement review filtering and sequential navigation**

The review page must show only `review` points by default, allow topic filtering, sort by oldest `updatedAt` first, and provide one primary command `按顺序开始`. The command opens the first point; completing a point advances to the next still-marked review point. The empty state says `当前没有需要复习的知识点` and links to the knowledge library.

- [ ] **Step 4: Add visible synchronization and error recovery UI**

The shell must show:

- `正在同步` while a request is active;
- `待同步` when local queue is non-empty;
- `同步失败，点击重试` after repeated failure;
- `已同步` briefly after success using `aria-live="polite"`.

Do not use color alone; every state includes text and one consistent Lucide icon.

- [ ] **Step 5: Run unit tests and commit**

```bash
cd learning-site
npx vitest run tests/ui/review-queue.test.tsx tests/progress
```

Expected: PASS.

```bash
git add learning-site/app/review learning-site/components/ReviewQueue.tsx learning-site/app/globals.css learning-site/tests/ui/review-queue.test.tsx
git commit -m "feat: add focused review workflow"
```

## Task 11: Add Browser and macOS Compatibility Tests

**Files:**
- Create: `learning-site/playwright.config.ts`
- Create: `learning-site/tests/e2e/private-access.spec.ts`
- Create: `learning-site/tests/e2e/mobile-learning.spec.ts`
- Create: `learning-site/tests/e2e/macos-learning.spec.ts`
- Modify: `learning-site/package.json`

- [ ] **Step 1: Configure desktop Safari-equivalent and Chrome projects**

Create `playwright.config.ts` with `webServer.command = "npm run dev"`, `reuseExistingServer = true`, and these projects:

```ts
projects: [
  { name: "iphone-webkit", use: { ...devices["iPhone 13"], baseURL } },
  { name: "macos-webkit", use: { browserName: "webkit", viewport: { width: 1440, height: 1000 }, baseURL } },
  { name: "macos-chromium", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 }, baseURL } },
  { name: "android-chromium", use: { ...devices["Pixel 7"], baseURL } }
]
```

Set `baseURL` to `http://127.0.0.1:3000/?access_key=e2e-secret` and start dev with `ACCESS_KEY=e2e-secret` in the webServer environment.

- [ ] **Step 2: Test private access**

`private-access.spec.ts` must assert:

1. a request without a Cookie or access key receives the private-access page;
2. opening the secret link redirects to a URL without `access_key`;
3. a secure session Cookie exists;
4. subsequent `/knowledge` navigation succeeds without the key in the URL.

- [ ] **Step 3: Test mobile learning flow**

`mobile-learning.spec.ts` must open the dashboard, use bottom navigation, search `JMM`, open the reader, mark `需复习`, navigate to review, and verify the point appears. Assert no horizontal overflow at 375px and that every bottom-nav/state target has a bounding-box height of at least 44px.

- [ ] **Step 4: Test macOS learning flow**

`macos-learning.spec.ts` must:

- verify the desktop sidebar and 72ch reader region;
- press `Meta+K` and search for `运行时常量池`;
- navigate using keyboard only to the status control;
- switch to dark mode;
- navigate back and confirm scroll restoration;
- run in both WebKit and Chromium projects.

- [ ] **Step 5: Run browser tests and commit**

Run:

```bash
cd learning-site
npx playwright install chromium webkit
npm run test:e2e
```

Expected: all four projects PASS. On the physical Mac, manually repeat the macOS scenario once in installed Safari and Chrome before release.

```bash
git add learning-site/playwright.config.ts learning-site/tests/e2e learning-site/package.json learning-site/package-lock.json
git commit -m "test: cover mobile and macos learning flows"
```

## Task 12: Add GitHub Validation and Push-to-Deploy Automation

**Files:**
- Create: `.github/workflows/learning-site.yml`
- Create: `learning-site/scripts/deployment/write-wrangler-config.ts`
- Modify: `.gitignore`
- Modify: `learning-site/package.json`

- [ ] **Step 1: Generate a deploy-only Wrangler config from environment secrets**

Create `learning-site/scripts/deployment/write-wrangler-config.ts` that requires `CLOUDFLARE_D1_DATABASE_ID` and writes `.wrangler/deploy.json`:

```ts
import { mkdir, writeFile } from "node:fs/promises";

const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
if (!databaseId) throw new Error("CLOUDFLARE_D1_DATABASE_ID is required");

const config = {
  $schema: "node_modules/wrangler/config-schema.json",
  name: "interview-learning-notes",
  main: "dist/server/index.js",
  compatibility_date: "2026-07-14",
  compatibility_flags: ["nodejs_compat"],
  assets: { directory: "dist/client", binding: "ASSETS" },
  d1_databases: [{ binding: "DB", database_name: "interview-learning-notes", database_id: databaseId }],
};

await mkdir(".wrangler", { recursive: true });
await writeFile(".wrangler/deploy.json", `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
```

The script must never print the database ID and `.wrangler/` remains ignored.

Add package script:

```json
"deploy:config": "tsx scripts/deployment/write-wrangler-config.ts"
```

- [ ] **Step 2: Create the GitHub Actions workflow**

Create `.github/workflows/learning-site.yml`:

```yaml
name: Learning site

on:
  push:
    branches: [main]
    paths:
      - "*.md"
      - "learning-site/**"
      - ".github/workflows/learning-site.yml"
  workflow_dispatch:

jobs:
  test-build-deploy:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: learning-site
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: learning-site/package-lock.json
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm run deploy:config
        env:
          CLOUDFLARE_D1_DATABASE_ID: ${{ secrets.CLOUDFLARE_D1_DATABASE_ID }}
      - run: npx wrangler deploy --config .wrangler/deploy.json
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

The workflow intentionally excludes browser installation on each content push; unit tests and production build are the deployment gate. Playwright remains a required local release check for UI changes.

- [ ] **Step 3: Create the private GitHub repository and add only intended source**

Run:

```bash
gh auth status
gh repo create interview-learning-notes --private --source=. --remote=origin
```

Expected: authenticated GitHub account confirmed and private repository created. Do not push until `git status --short` has been reviewed for resume, binary, `.env`, and preview files.

Add the top-level allowlisted Markdown files explicitly, plus `AGENTS.md`, design/plan docs, `learning-site/`, workflow, and `.gitignore`. Do not use an unreviewed `git add .`.

- [ ] **Step 4: Create Cloudflare resources and repository secrets**

From `learning-site/`, run:

```bash
npx wrangler login
npx wrangler d1 create interview-learning-notes
```

Record the returned database ID directly into the GitHub secret prompt:

```bash
gh secret set CLOUDFLARE_D1_DATABASE_ID
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set CLOUDFLARE_API_TOKEN
```

Create a 32-byte random access key without printing it into shell history, store it as the Cloudflare Worker secret, and copy it to the macOS clipboard for immediate password-manager storage:

```bash
umask 077
openssl rand -hex 32 > /tmp/interview-learning-access-key
npx wrangler secret put ACCESS_KEY --name interview-learning-notes < /tmp/interview-learning-access-key
pbcopy < /tmp/interview-learning-access-key
rm -f /tmp/interview-learning-access-key
```

The access key must not be placed in GitHub logs, committed files, shell arguments, or Markdown docs.

- [ ] **Step 5: Apply the D1 migration and commit CI**

Run the generated migration against the named remote database with Wrangler, then query the schema to confirm `learning_progress` exists before deployment.

```bash
git add .github/workflows/learning-site.yml learning-site/scripts/deployment learning-site/package.json learning-site/package-lock.json .gitignore
git commit -m "ci: publish learning site from markdown"
```

- [ ] **Step 6: Push and verify automatic deployment**

```bash
git push -u origin main
gh run watch
```

Expected: checkout, tests, content build, production build, and Wrangler deployment all succeed. A second Markdown-only commit must trigger the same workflow and update the generated site without changing progress rows.

## Task 13: Sites Deployment, Final QA, and Handoff

**Files:**
- Modify after site creation: `learning-site/.openai/hosting.json` with the opaque Sites `project_id`
- Create during Sites packaging: deployment archive outside source
- Modify: `learning-site/README.md`

- [ ] **Step 1: Run the complete local verification suite**

Run:

```bash
cd learning-site
npm test
npm run build
npm run test:e2e
```

Expected: unit tests, build, and all configured browser projects PASS; `dist/server/index.js` exists.

- [ ] **Step 2: Perform the UI/UX quality pass**

Verify at 375px, 768px, 1280px, and 1440px:

- no horizontal page overflow;
- body text at least 16px on phone and line height at least 1.5;
- touch targets at least 44px;
- visible focus rings and keyboard operation;
- state text accompanies color;
- light and dark contrast remains readable;
- reduced-motion mode removes nonessential transitions;
- tables and code blocks scroll inside their own container;
- macOS Safari and Chrome both preserve history and reader scroll position.

- [ ] **Step 3: Publish the validated source through Sites**

Use the Sites connector exactly once to create the site, persist its returned `project_id` in `learning-site/.openai/hosting.json`, push the exact validated source state, package `dist/` and migrations with the Sites helper, save one version, and deploy it. Because application-level secret access is already enforced, use the access mode approved during design and verify anonymous requests still receive no Markdown content.

- [ ] **Step 4: Verify production behavior on phone and Mac**

Using the deployed URL:

1. Open the private access link on iPhone and macOS Safari.
2. Confirm the redirect removes `access_key` from the address.
3. Mark one point `需复习` on phone.
4. Refresh macOS and confirm the same state.
5. Mark it `已掌握` on macOS and confirm phone receives the update.
6. Push a harmless Markdown correction and confirm GitHub auto-deploy updates content while preserving the progress.
7. Open the URL without a Cookie or key and confirm no title, catalog, generated JSON, or search result leaks.

- [ ] **Step 5: Write the maintenance guide**

Create `learning-site/README.md` with these exact operator workflows:

```text
Local preview: npm run dev
Validate content: npm run content:build
Unit tests: npm test
Production build: npm run build
Browser tests: npm run test:e2e
Publish content: edit Markdown, commit, push main
Add a topic: add it to content/content.config.ts, test, commit, push
Rotate access: replace the Worker ACCESS_KEY secret and reopen the new private link on each device
Recover pending sync: reconnect, open the site, press the visible retry control
```

Document the allowlist boundary and explicitly state that webpage edits are unsupported; Markdown remains the source of truth.

- [ ] **Step 6: Commit final documentation**

```bash
git add learning-site/.openai/hosting.json learning-site/README.md
git commit -m "docs: add learning site operations guide"
git push
```

## Final Verification Checklist

- [ ] Publication allowlist contains only approved interview topics.
- [ ] Resume, personal project, rule, audit, binary, environment, and preview files are absent from published content.
- [ ] Markdown build generates unique stable knowledge-point IDs and valid search artifacts.
- [ ] Worker rejects requests without a valid session before serving assets or API responses.
- [ ] D1 remains the authoritative progress store; browser storage is only a retry queue.
- [ ] `未学习 / 需复习 / 已掌握` work with mouse, touch, and keyboard.
- [ ] Phone and macOS Safari/Chrome show the same state.
- [ ] `Command + K` and `Ctrl + K` open search.
- [ ] Failed content builds do not deploy.
- [ ] A Markdown-only push updates the site and preserves progress.
- [ ] Production URL has been tested both with and without the private access link.
