# Daily AI News

A static site that generates a fresh AI-news dashboard every day using the OpenAI API with
web search enabled, publishes it via GitHub Pages, and automatically prunes anything older
than 90 days.

- `prompt.md` — the prompt sent to the model each day, asking it to research three sections
  (news, agents, repos) and return plain-text fields (no markdown). Edit this with your own
  content/topics.
- `scripts/generate.mjs` — calls the OpenAI Responses API (with the `web_search` tool),
  constrained to a strict JSON schema (`RESPONSE_SCHEMA`) so the model returns structured data
  — titles, summaries, and a real URL per item — instead of a full HTML/markdown document. The
  script then renders that JSON into HTML itself, so every link becomes a real `<a href>` that
  actually works, rather than markdown-style `([text](url))` text that shows up unclickable.
  Writes today's dashboard to both `docs/index.html` (the homepage) and
  `docs/news/<YYYY-MM-DD>.html` (the dated archive copy).
- `scripts/theme.mjs` — the shared HTML shell/CSS and `escapeHtml`/`safeUrl` helpers used by
  both `generate.mjs` and `prune.mjs`, so every page shares one look and untrusted model output
  is always escaped and URL-validated before being written into the page.
- `scripts/prune.mjs` — deletes dated pages older than 90 days and rebuilds `docs/archive.html`
  (the list of past dates, linked from the homepage).
- `.github/workflows/daily-news.yml` — runs both scripts once a day and commits the result.

## Setup

### 1. Add your OpenAI API key as a repo secret

1. Go to your repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret**.
3. Name: `OPENAI_API_KEY`. Value: your API key from the [OpenAI Platform](https://platform.openai.com/api-keys).
4. Save.

### 2. Enable GitHub Pages

1. Go to **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Set **Branch** to `main` and folder to `/docs`.
4. Save. Your site will be published at `https://<your-username>.github.io/<repo-name>/`.

### 3. Add your prompt

Open `prompt.md` and replace its contents with whatever research prompt you want sent each day.
Keep the instruction to write plain text (no markdown) in every field — `generate.mjs` renders
the model's JSON response into HTML itself, so markdown syntax in a field would show up as
literal text on the page instead of formatting.

### 4. Change the daily run time (optional)

Edit the `cron` line in `.github/workflows/daily-news.yml`:

```yaml
- cron: "0 12 * * *" # UTC time, minute hour day month weekday
```

For example, `0 6 * * *` runs at 06:00 UTC. [crontab.guru](https://crontab.guru/) is handy for
building these expressions.

### 5. Trigger a manual run to test

1. Go to the **Actions** tab → **Daily AI News** workflow.
2. Click **Run workflow** (this uses the `workflow_dispatch` trigger).
3. Once it finishes, check that `docs/index.html`, `docs/news/<today>.html`, and
   `docs/archive.html` were committed, and that your Pages site shows the new dashboard.

## Local testing

```bash
npm install
OPENAI_API_KEY=sk-... npm run generate
```

This runs `generate.mjs` followed by `prune.mjs`, exactly like the workflow does. Check the
output in `docs/index.html`, `docs/news/`, and `docs/archive.html` before pushing.

## Notes

- The model used is set as a constant (`MODEL`) at the top of `scripts/generate.mjs` — change
  it there if a newer model alias becomes available.
- If the OpenAI API call fails or returns an empty response, `generate.mjs` exits non-zero
  and the workflow fails loudly instead of publishing an empty page.
- Re-running `generate.mjs` on the same day overwrites that day's page (idempotent).
