# Codex Token Dashboard

A local static website for exploring Codex token usage history. It reads aggregate `token_count` events from local Codex session JSONL files and renders daily trends, token composition, rate-limit pressure, busiest threads, an hourly heatmap, and computed insights.

This is not an official billing, pricing, or quota tool. It only shows what is available in local Codex logs.

## What It Reads

By default the generator scans:

- `$CODEX_HOME/sessions/**/*.jsonl`, or `~/.codex/sessions/**/*.jsonl`
- `$CODEX_HOME/archived_sessions/**/*.jsonl`, or `~/.codex/archived_sessions/**/*.jsonl`
- `$CODEX_HOME/session_index.jsonl` for thread titles, when present

The generated dashboard data includes aggregate token counts, dates, local hour buckets, thread IDs, thread titles, workspace basenames, and rate-limit percentages when present. It does not embed raw prompts, responses, tool arguments, or transcript text.

## Run Locally

```bash
cd projects/codex-token-dashboard
npm run generate
npm run dev
```

Then open the printed local URL, usually `http://localhost:4173`.

The page can also be opened directly from `index.html` after `npm run generate`.

## Privacy Options

Generated local data is written to `src/generatedUsage.js`, which is ignored by git.

To omit thread titles from generated data:

```bash
node scripts/generate-usage.js --no-titles
```

To scan a different Codex home directory:

```bash
node scripts/generate-usage.js --codex-home /path/to/codex-home
```

## Fresh Clone Behavior

A fresh clone works as a static sample dashboard because `src/sampleUsage.js` is committed. Real usage history will not appear until `npm run generate` is run on a machine with Codex session logs.

## Verification

```bash
npm test
```

The test uses fixture JSONL logs under `fixtures/codex-home` and checks that the generated aggregate dataset has the expected shape.

## Known Limits

- Token totals are derived from local `token_count` events. Missing, old, or moved logs will make the dashboard incomplete.
- Cached input is a subset of input tokens, so the composition chart separates uncached input, cached input, output, and reasoning output instead of treating cached input as an extra independent total.
- Rate-limit data only appears when Codex logged it for a token event.
- This project does not estimate dollar cost because model pricing and plan behavior are not encoded in local session logs.
