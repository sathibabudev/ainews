// scripts/generate.mjs
//
// Reads prompt.md, sends it to the OpenAI API (with web search enabled) and
// asks for a structured JSON response (not free-form HTML/markdown). We then
// render that JSON into HTML ourselves, so every link the model finds ends
// up as a real <a href="..."> — never markdown-style "([text](url))" text
// that shows up unclickable on the page. Writes to:
//   - docs/index.html            (homepage — always today's dashboard)
//   - docs/news/<YYYY-MM-DD>.html (dated archive copy, UTC date)
//
// Run locally with:
//   OPENAI_API_KEY=sk-... node scripts/generate.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { escapeHtml, safeUrl, renderShell } from "./theme.mjs";

// Change this constant when a newer default model alias becomes available.
const MODEL = "gpt-4o";

const SYSTEM_INSTRUCTIONS =
  "You are a research assistant that returns structured data, not prose. " +
  "Use web search to find current, real sources, then fill in the JSON " +
  "schema you are given. Every url must be a real link you found via " +
  "search. Every text field must be plain text with no markdown syntax.";

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    generated_label: {
      type: "string",
      description: "Human-readable generation date, e.g. 'July 17, 2026'.",
    },
    window_days: { type: "integer", enum: [10, 15, 30] },
    window_label: {
      type: "string",
      description: "Human readable date range, e.g. 'June 17 - July 17, 2026'.",
    },
    takeaways: { type: "array", items: { type: "string" } },
    news: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          source: { type: "string" },
          publish_date: { type: "string" },
          url: { type: "string" },
        },
        required: ["title", "summary", "source", "publish_date", "url"],
      },
    },
    agents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          why_trending: { type: "string" },
          url: { type: "string" },
        },
        required: ["name", "description", "why_trending", "url"],
      },
    },
    repos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          stars: { type: "string", description: "approx star count or growth, e.g. '~120k (+1.8k today)'" },
          language: { type: "string" },
          url: { type: "string" },
        },
        required: ["name", "description", "stars", "language", "url"],
      },
    },
  },
  required: ["generated_label", "window_days", "window_label", "takeaways", "news", "agents", "repos"],
};

const ROOT = path.resolve(import.meta.dirname, "..");
const PROMPT_PATH = path.join(ROOT, "prompt.md");
const DOCS_DIR = path.join(ROOT, "docs");
const NEWS_DIR = path.join(DOCS_DIR, "news");

// UTC date so the workflow's scheduled run always lands on a consistent day
// regardless of the runner's local timezone.
function todayUtc() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function renderCard({ href, title, description, meta }) {
  return `<a class="card" href="${safeUrl(href)}" target="_blank" rel="noopener noreferrer">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
        <div class="meta">${meta}</div>
      </a>`;
}

function renderGroup({ id, icon, label, items, empty, renderItem }) {
  const body = items.length
    ? `<div class="grid">${items.map(renderItem).join("\n")}</div>`
    : `<div class="empty">${escapeHtml(empty)}</div>`;
  return `<section class="group" id="${id}">
      <div class="group-header">
        <h2>${icon} ${escapeHtml(label)}</h2>
        <span class="group-count">${items.length} item${items.length === 1 ? "" : "s"}</span>
      </div>
      ${body}
    </section>`;
}

export function renderDashboard(data, navHtml) {
  const takeaways = (data.takeaways ?? []).map((t) => `<li>${escapeHtml(t)}</li>`).join("\n");

  const newsGroup = renderGroup({
    id: "news",
    icon: "📰",
    label: "Latest AI News",
    items: data.news ?? [],
    empty: "No news items found for this window.",
    renderItem: (item) =>
      renderCard({
        href: item.url,
        title: item.title,
        description: item.summary,
        meta: `<span class="pill">${escapeHtml(item.source)}</span><span class="pill">${escapeHtml(item.publish_date)}</span>`,
      }),
  });

  const agentsGroup = renderGroup({
    id: "agents",
    icon: "🤖",
    label: "Trending AI Agents",
    items: data.agents ?? [],
    empty: "No trending agents found for this window.",
    renderItem: (item) =>
      renderCard({
        href: item.url,
        title: item.name,
        description: `${item.description} ${item.why_trending}`.trim(),
        meta: `<span class="pill">Trending</span>`,
      }),
  });

  const reposGroup = renderGroup({
    id: "repos",
    icon: "⭐",
    label: "Trending AI GitHub Repos",
    items: data.repos ?? [],
    empty: "No trending repos found for this window.",
    renderItem: (item) =>
      renderCard({
        href: item.url,
        title: item.name,
        description: item.description,
        meta: `<span class="pill">${escapeHtml(item.stars)}</span><span class="pill lang">${escapeHtml(item.language)}</span>`,
      }),
  });

  const bodyHtml = `
    ${takeaways ? `<div class="takeaways"><h2>Top Takeaways</h2><ul>${takeaways}</ul></div>` : ""}
    ${newsGroup}
    ${agentsGroup}
    ${reposGroup}
  `;

  return renderShell({
    title: "AI News",
    eyebrow: `Last ${escapeHtml(data.window_days)} days · ${escapeHtml(data.window_label)}`,
    heading: "AI News",
    subtitle: `Headlines, trending agents, and trending repos — generated ${escapeHtml(data.generated_label)}.`,
    bodyHtml,
    navHtml,
  });
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set.");
  }

  const prompt = await readFile(PROMPT_PATH, "utf8");
  if (!prompt.trim() || prompt.includes("<!-- PASTE YOUR AI NEWS PROMPT HERE -->")) {
    throw new Error(
      "prompt.md still contains the placeholder — add your own prompt before running generate.mjs."
    );
  }

  const client = new OpenAI({ apiKey });

  const response = await client.responses.create({
    model: MODEL,
    instructions: SYSTEM_INSTRUCTIONS,
    tools: [{ type: "web_search" }],
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "ai_news_dashboard",
        schema: RESPONSE_SCHEMA,
        strict: true,
      },
    },
  });

  const text = (response.output_text ?? "").trim();
  if (!text) {
    throw new Error("OpenAI API returned an empty response — refusing to publish an empty page.");
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`OpenAI API did not return valid JSON — refusing to publish a broken page. (${err.message})`);
  }

  const dateStr = todayUtc();

  await mkdir(NEWS_DIR, { recursive: true });

  const homeNav = `<a class="nav-link" href="archive.html">&larr; View archive</a>`;
  const homePath = path.join(DOCS_DIR, "index.html");
  await writeFile(homePath, renderDashboard(data, homeNav), "utf8");
  console.log(`Wrote ${path.relative(ROOT, homePath)}`);

  const datedNav = `<a class="nav-link" href="../archive.html">&larr; Back to archive</a>`;
  const datedPath = path.join(NEWS_DIR, `${dateStr}.html`);
  await writeFile(datedPath, renderDashboard(data, datedNav), "utf8");
  console.log(`Wrote ${path.relative(ROOT, datedPath)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("generate.mjs failed:", err.message);
    process.exit(1);
  });
}
