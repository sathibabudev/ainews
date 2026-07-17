// scripts/prune.mjs
//
// Deletes docs/news/<date>.html files older than 90 days and regenerates
// docs/archive.html to list whatever remains, newest first. (docs/index.html
// is the homepage and is written separately by generate.mjs.)
//
// Run locally with:
//   node scripts/prune.mjs

import { readdir, unlink, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const RETENTION_DAYS = 90;

const ROOT = path.resolve(import.meta.dirname, "..");
const DOCS_DIR = path.join(ROOT, "docs");
const NEWS_DIR = path.join(DOCS_DIR, "news");

const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.html$/;

function daysBetween(a, b) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((a - b) / msPerDay);
}

async function listDatedFiles() {
  await mkdir(NEWS_DIR, { recursive: true });
  const entries = await readdir(NEWS_DIR);
  return entries
    .map((name) => {
      const match = name.match(DATE_FILE_RE);
      return match ? { name, date: match[1] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
}

async function pruneOldFiles(files) {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const kept = [];

  for (const file of files) {
    const fileDate = new Date(`${file.date}T00:00:00Z`);
    const age = daysBetween(today, fileDate);
    if (age > RETENTION_DAYS) {
      await unlink(path.join(NEWS_DIR, file.name));
      console.log(`Pruned ${file.name} (${age} days old)`);
    } else {
      kept.push(file);
    }
  }

  return kept;
}

function renderArchive(files) {
  const items = files
    .map(
      (f) => `      <li><a href="news/${f.name}">${f.date}</a></li>`
    )
    .join("\n");

  const listHtml = files.length
    ? `<ul>\n${items}\n    </ul>`
    : `<p>No entries yet — check back after the next scheduled run.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI News Archive</title>
<style>
  :root {
    color-scheme: light dark;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    max-width: 700px;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 4rem;
    line-height: 1.6;
    color: #1a1a1a;
    background: #fff;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #e6e6e6; background: #111; }
    a { color: #6db3f2; }
  }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .subtitle { color: #666; font-size: 0.95rem; margin-bottom: 2rem; }
  ul { list-style: none; padding: 0; }
  li { margin-bottom: 0.6rem; }
  a {
    color: #0969da;
    text-decoration: none;
    display: inline-block;
    padding: 0.5rem 0.75rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    width: 100%;
    box-sizing: border-box;
  }
  a:hover { background: #f6f8fa; }
  @media (prefers-color-scheme: dark) {
    a { border-color: #333; }
    a:hover { background: #1c1c1c; }
  }
</style>
</head>
<body>
  <h1>AI News Archive</h1>
  <div class="subtitle">Last ${RETENTION_DAYS} days</div>
  <a href="index.html" style="display:inline-block;margin-bottom:1.5rem;">&larr; Back to today</a>
  ${listHtml}
</body>
</html>
`;
}

async function main() {
  const allFiles = await listDatedFiles();
  const keptFiles = await pruneOldFiles(allFiles);

  const archiveHtml = renderArchive(keptFiles);
  await mkdir(DOCS_DIR, { recursive: true });
  await writeFile(path.join(DOCS_DIR, "archive.html"), archiveHtml, "utf8");

  console.log(`Rebuilt docs/archive.html with ${keptFiles.length} entr${keptFiles.length === 1 ? "y" : "ies"}.`);
}

main().catch((err) => {
  console.error("prune.mjs failed:", err.message);
  process.exit(1);
});
