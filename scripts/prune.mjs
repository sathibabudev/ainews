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
import { escapeHtml, renderShell } from "./theme.mjs";

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
    .map((f) => `        <li><a href="news/${f.name}">${escapeHtml(f.date)}</a></li>`)
    .join("\n");

  const listHtml = files.length
    ? `<ul class="archive-list">\n${items}\n      </ul>`
    : `<div class="empty">No entries yet — check back after the next scheduled run.</div>`;

  return renderShell({
    title: "AI News Archive",
    eyebrow: `Last ${RETENTION_DAYS} days`,
    heading: "AI News Archive",
    subtitle: `${files.length} past dashboard${files.length === 1 ? "" : "s"}.`,
    navHtml: `<a class="nav-link" href="index.html">&larr; Back to today</a>`,
    bodyHtml: `<section class="group">${listHtml}</section>`,
  });
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
