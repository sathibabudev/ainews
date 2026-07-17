// scripts/generate.mjs
//
// Reads prompt.md, sends it to the OpenAI API (with web search enabled), and
// writes the returned self-contained HTML dashboard to:
//   - docs/index.html            (homepage — always today's dashboard)
//   - docs/news/<YYYY-MM-DD>.html (dated archive copy, UTC date)
//
// Run locally with:
//   OPENAI_API_KEY=sk-... node scripts/generate.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

// Change this constant when a newer default model alias becomes available.
const MODEL = "gpt-4o";

// Forces raw-markup-only output — without this the model tends to narrate
// ("Here's your dashboard...") instead of returning an actual HTML document.
const SYSTEM_INSTRUCTIONS =
  "You are a code generator, not a conversational assistant. Respond with " +
  "nothing but a single valid, self-contained HTML document satisfying the " +
  "user's request. Do not include commentary, explanations, questions, or " +
  "markdown code fences. Your response must start with '<!doctype html>' " +
  "and end with '</html>' and nothing else.";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROMPT_PATH = path.join(ROOT, "prompt.md");
const DOCS_DIR = path.join(ROOT, "docs");
const NEWS_DIR = path.join(DOCS_DIR, "news");

// UTC date so the workflow's scheduled run always lands on a consistent day
// regardless of the runner's local timezone.
function todayUtc() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// The model is asked for a full HTML document but sometimes wraps it in a
// ```html ... ``` fence, or adds stray commentary before/after — strip both.
// Throws if the response doesn't actually contain an HTML document, so a
// conversational non-HTML reply fails the build instead of publishing as-is.
function extractHtml(text) {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();

  const start = candidate.search(/<!doctype html/i);
  const end = candidate.search(/<\/html\s*>/i);
  if (start === -1 || end === -1) {
    throw new Error(
      "OpenAI response did not contain a full HTML document (found no <!doctype html>...</html>) " +
        "— refusing to publish a broken page."
    );
  }

  return candidate.slice(start, end + "</html>".length);
}

// Add a nav link so every generated page can reach the archive/homepage,
// even though the dashboard markup itself comes entirely from the model.
function withNavLink(html, href, label) {
  const link = `<a href="${href}" style="display:inline-block;margin:2rem 0;">${label}</a>`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${link}\n</body>`);
  }
  return `${html}\n${link}`;
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
  });

  const text = (response.output_text ?? "").trim();

  if (!text) {
    throw new Error("OpenAI API returned an empty response — refusing to publish an empty page.");
  }

  const dateStr = todayUtc();
  const rawHtml = extractHtml(text);

  await mkdir(NEWS_DIR, { recursive: true });

  const homePath = path.join(DOCS_DIR, "index.html");
  await writeFile(homePath, withNavLink(rawHtml, "archive.html", "&larr; View archive"), "utf8");
  console.log(`Wrote ${path.relative(ROOT, homePath)}`);

  const datedPath = path.join(NEWS_DIR, `${dateStr}.html`);
  await writeFile(datedPath, withNavLink(rawHtml, "../archive.html", "&larr; Back to archive"), "utf8");
  console.log(`Wrote ${path.relative(ROOT, datedPath)}`);
}

main().catch((err) => {
  console.error("generate.mjs failed:", err.message);
  process.exit(1);
});
