// scripts/generate.mjs
//
// Reads prompt.md, sends it to the OpenAI API (with web search enabled), and
// writes the returned self-contained HTML dashboard to
// docs/news/<YYYY-MM-DD>.html (UTC date).
//
// Run locally with:
//   OPENAI_API_KEY=sk-... node scripts/generate.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

// Change this constant when a newer default model alias becomes available.
const MODEL = "gpt-4o";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROMPT_PATH = path.join(ROOT, "prompt.md");
const NEWS_DIR = path.join(ROOT, "docs", "news");

const BACK_LINK = '<a href="../index.html" style="display:inline-block;margin:2rem 0;">&larr; Back to archive</a>';

// UTC date so the workflow's scheduled run always lands on a consistent day
// regardless of the runner's local timezone.
function todayUtc() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// The model is asked for a full HTML document but sometimes wraps it in a
// ```html ... ``` fence anyway — strip that if present.
function extractHtml(text) {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

// Add an archive back-link so every generated page can navigate home, even
// though the dashboard markup itself comes entirely from the model.
function withBackLink(html) {
  if (html.includes("</body>")) {
    return html.replace("</body>", `${BACK_LINK}\n</body>`);
  }
  return `${html}\n${BACK_LINK}`;
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
    tools: [{ type: "web_search" }],
    input: prompt,
  });

  const text = (response.output_text ?? "").trim();

  if (!text) {
    throw new Error("OpenAI API returned an empty response — refusing to publish an empty page.");
  }

  const dateStr = todayUtc();
  const page = withBackLink(extractHtml(text));

  await mkdir(NEWS_DIR, { recursive: true });
  const outPath = path.join(NEWS_DIR, `${dateStr}.html`);
  await writeFile(outPath, page, "utf8");

  console.log(`Wrote ${path.relative(ROOT, outPath)}`);
}

main().catch((err) => {
  console.error("generate.mjs failed:", err.message);
  process.exit(1);
});
