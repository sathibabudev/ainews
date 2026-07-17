# Daily AI News

A static site that generates a fresh AI-news dashboard every day using the OpenAI API with
web search enabled, publishes it via GitHub Pages, and automatically prunes anything older
than 90 days.

- `prompt.md` — the prompt sent to the model each day. It asks for a self-contained HTML
  dashboard back, so `generate.mjs` writes the model's output directly rather than converting
  markdown. Edit this with your own content, keeping the "output a full HTML page" instruction
  if you want the same behavior.
- `scripts/generate.mjs` — calls the OpenAI Responses API (with the `web_search` tool) and
  writes `docs/news/<YYYY-MM-DD>.html`.
- `scripts/prune.mjs` — deletes pages older than 90 days and rebuilds `docs/index.html`.
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

Open `prompt.md` and replace its contents with whatever prompt you want sent each day. If your
prompt asks for a full HTML page back (as the default one does), `generate.mjs` writes that
output as-is; if you'd rather write a plain-text/markdown prompt, you'll need to add a markdown
renderer back into `generate.mjs` since it no longer includes one.

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
3. Once it finishes, check that `docs/news/<today>.html` and `docs/index.html` were committed,
   and that your Pages site shows the new entry.

## Local testing

```bash
npm install
OPENAI_API_KEY=sk-... npm run generate
```

This runs `generate.mjs` followed by `prune.mjs`, exactly like the workflow does. Check the
output in `docs/news/` and `docs/index.html` before pushing.

## Notes

- The model used is set as a constant (`MODEL`) at the top of `scripts/generate.mjs` — change
  it there if a newer model alias becomes available.
- If the OpenAI API call fails or returns an empty response, `generate.mjs` exits non-zero
  and the workflow fails loudly instead of publishing an empty page.
- Re-running `generate.mjs` on the same day overwrites that day's page (idempotent).
