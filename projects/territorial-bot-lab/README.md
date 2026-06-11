# Territorial Bot Lab

Local-first browser instrumentation and bot-control experiments for Territorial.io.

This is a prototype harness, not a finished strong bot. It launches the real Territorial.io browser client, injects local canvas/input instrumentation before the page script runs, and writes artifacts that make strategy development repeatable.

## Boundaries

This project intentionally does not reverse-engineer or send Territorial.io gameplay WebSocket messages. It does not provide a cheat client for public multiplayer. The current implementation controls only the browser UI through Playwright mouse/keyboard actions and is intended for local/private experimentation.

For a bot that friends can play against, the intended path is:

1. Use this harness to observe the real client and collect UI/state artifacts.
2. Build strategies that act through the real UI.
3. Keep play to offline mode, private rooms, or an explicitly authorized private environment.

## What Works

- `probe` opens the real game, instruments canvas drawing calls, and saves:
  - `instrumentation.json`
  - `telemetry.json`
  - `page.png`
  - `canvas.png`
- `record` passively samples the real client into local dataset artifacts:
  - `observations.ndjson`
  - `observation-summary.json`
  - `final-page.png`
  - `final-canvas.png`
  With `--label-actions`, those observations also include local UI click/pointer/key labels for imitation-learning datasets.
- `bot` runs a conservative custom-scenario opener/expander and saves logs, telemetry, screenshots, and a sampled canvas grid.
- `custom-adaptive` mode samples the live canvas, estimates the player-owned component, picks nearby frontier land, and avoids recently used targets.
- When the real client draws the bot's map label, telemetry extracts an `ownCenter` anchor and the visual decoder uses it instead of assuming the player territory is exactly screen-centered.
- After the opening click budget is spent, `custom-adaptive` switches to a simple neighbor-region target picker (`phase=midgame-region`) so it can keep expanding from real canvas state instead of only replaying a fixed pattern.
- `custom-adaptive` uses drawn telemetry to hold expansion when interest is low, when the opening click budget is spent before the midgame start time, or until interest recovers above the configured resume threshold.
- With `--probe-targets`, post-opening decisions hover over candidate targets first and read the real client's selected attack label when available. Labels such as `473 (31%)` are treated as the troops/percentage currently selected to send, not as proven enemy strength.
- Visible non-own map labels can be promoted into post-opening probe candidates, so the bot can target drawn neutral/opponent/unknown labels instead of relying only on sampled frontier pixels. Leaderboard names and non-own `Player N` labels are treated as opponents. When those labels include troop counts, the bot can prefer weak labeled targets and avoid neutral or opponent/unknown labels above their configured target/own troop-ratio caps.
- With `--adaptive-attack-sizing`, the bot can adjust the real attack slider before a post-opening click based on interest, visual region features, and the selected attack label.
- Hover-probed targets can be rejected when the real selected attack label would spend too much of the bot's current visible troops. When all probed targets are over that cap, the bot can lower the real attack slider and reprobe once before holding, then restore the normal probe slider after sampled territory growth.
- Post-opening decisions track sampled owned-cell growth from the real canvas, can back off after repeated no-growth ticks, and can temporarily avoid target areas that did not convert into sampled territory growth.
- Telemetry extracts current leaderboard rows, own visible troops, interest/income/time, selected attack labels, and visible map labels with paired troop counts when the real client draws them.
- When `--player-name` is set and the real client draws that name, telemetry treats it as the own player label, which improves `ownCenter`, own troop extraction, and visual decoding for named bot/friend sessions.
- `evaluate` runs repeated local custom-scenario games and writes a `summary.json` with final telemetry, rank, placement percentile, top-rate flags, visible troops, and score.
- `tune` runs small real-client parameter sweeps over spawn points, opening, pacing thresholds, expansion, probe count, selected-attack ratio caps, opponent troop caps, low attack slider, and low-slider reprobe behavior. It can rank configs by heuristic score, placement percentile, or mean rank.
- `tune --write-best-config <file>` can write the top ranked configuration as a reusable local JSON profile; `bot`, `evaluate`, and `tune` can load profiles with `--config <file>`.
- `analyze` scans existing run artifacts and aggregates scores, placement metrics, actions, phases, wait reasons, target probes, selected attack labels, and visible map labels.
- `train-policy` fits a small local linear target-ranker from `decision-samples.ndjson`; `bot --policy <file>` can use it for post-opening target choice.
- `train-outcome-policy` fits the same ranker format from bot decisions that were followed by sampled owned-cell growth, so failed/no-growth clicks are filtered out of the positive training set.
- `train-action-policy` fits the same target-ranker format from action-labeled `observations.ndjson` recordings, matching local canvas clicks to visual/map-label target candidates.
- `evaluate-outcome-policy` scores a trained ranker against held-out outcome-positive bot decisions before spending time on real-client policy runs.
- `evaluate-action-policy` scores a trained target-ranker against action-labeled observation recordings with top-1/top-3, mean rank, MRR, and candidate-count metrics.
- `lobby-probe` captures real-client menu/lobby routes with canvas, DOM, screenshot, passive network lifecycle artifacts, and a route assessment. It can set a recognizable player name and record dry-run `Ready`/`Close` button targets, but it does not click `Ready` or control public gameplay.
- `lobby-watch` enters a real-client lobby route, watches for expected visible player names and/or a minimum player count, and writes a dry-run readiness plan. It does not click `Ready` or automate public-lobby gameplay.
- Every bot/evaluation run writes `run-summary.json` with action counts, wait reasons, strategy phases, score, placement metrics, and final telemetry.
- Every bot/evaluation run also writes `decision-samples.ndjson`, a compact per-tick rollout dataset with telemetry, top visual candidates, chosen actions, and wait reasons for training/tuning.
- The strategy layer is separated from the browser harness so stronger bots can be added.

## What Is Not Built Yet

- A high-strength Territorial.io strategy.
- Full game-state reconstruction from the canvas.
- Robust enemy strength parsing, safe attack sizing, midgame/endgame diplomacy, boat handling, and win-rate optimization.
- Private-room joining.
- Multiplayer automation.
- Any protocol-level game client.

## Setup

```sh
npm install
```

If Playwright needs browser binaries:

```sh
npx playwright install chromium
```

## Commands

```sh
npm run probe -- --duration-ms 10000
```

Record passive real-client observations for local analysis or training data:

```sh
npm run record -- --duration-ms 10000 --tick-ms 1000
```

Record a larger local dataset with raw sampled canvas grids included:

```sh
npm run record -- --duration-ms 30000 --tick-ms 500 --visual-cols 96 --visual-rows 60 --include-grid
```

Record human UI actions alongside observations for local imitation-learning experiments:

```sh
npm run record -- --duration-ms 60000 --tick-ms 250 --label-actions --player-name TTBotLab
```

Pointer movement labels are intentionally excluded by default because they are noisy and large. Add `--include-pointer-moves` only when you specifically need cursor trajectory data.

Run the local adaptive custom-scenario bot loop:

```sh
npm run bot -- --duration-ms 30000
```

Run the older fixed-pattern custom-scenario opener:

```sh
npm run bot -- --mode custom-scenario --duration-ms 30000
```

Run the passive scout loop:

```sh
npm run bot -- --mode scout --duration-ms 30000
```

Tune the spawn and opening attack-percentage click target:

```sh
npm run bot -- --spawn-x 0.63 --spawn-y 0.78 --opening-percent 0.415 --duration-ms 30000
```

Tune pacing knobs:

```sh
npm run bot -- --opening-percent 0.39 --max-expansion-clicks 5 --min-interest 0.05 --duration-ms 30000
```

Exercise the current post-opening neighbor-region targeting path:

```sh
npm run bot -- --opening-percent 0.39 --max-expansion-clicks 3 --midgame-start-seconds 5 --resume-interest 0.066 --duration-ms 14000
```

Try a more conservative post-opening attack guard:

```sh
npm run bot -- --opening-percent 0.39 --max-expansion-clicks 3 --midgame-start-seconds 5 --resume-interest 0.066 --min-attack-troops 1200 --midgame-percent 0.455 --duration-ms 14000
```

Probe candidate targets and adapt the attack slider before post-opening attacks:

```sh
npm run bot -- --opening-percent 0.39 --max-expansion-clicks 3 --midgame-start-seconds 5 --resume-interest 0 --min-interest 0 --hard-min-interest 0 --midgame-percent 0.455 --probe-targets --adaptive-attack-sizing --target-probe-count 3 --max-selected-attack-percent 0.34 --max-selected-attack-ratio 0.34 --reprobe-low-attack-on-unsafe-cost true --recover-attack-slider-after-progress true --max-target-troop-ratio 0.85 --max-opponent-troop-ratio 0.65 --weak-target-troop-ratio 0.45 --stall-backoff true --max-stall-streak 3 --min-owned-cell-growth 1 --failed-target-cooldown 5 --failed-target-distance 0.09 --duration-ms 14000
```

Run a repeated local evaluation:

```sh
npm run evaluate -- --games 3 --duration-ms 15000 --tick-ms 600
```

Run a small parameter sweep:

```sh
npm run tune -- --games 1 --duration-ms 9000 --spawn-list 0.63:0.78,0.54:0.74 --opening-percent-list 0.39,0.415 --expansion-clicks-list 5,8
```

Tune post-opening pacing thresholds:

```sh
npm run tune -- --games 1 --duration-ms 12000 --opening-percent-list 0.39 --expansion-clicks-list 3 --min-interest-list 0,0.045 --resume-interest-list 0.061,0.066 --midgame-start-seconds-list 0,8 --tune-objective placement
```

Tune the newer post-opening attack-cost/reprobe knobs:

```sh
npm run tune -- --games 1 --duration-ms 12000 --opening-percent-list 0.39 --expansion-clicks-list 3 --probe-targets --adaptive-attack-sizing --max-selected-attack-ratio-list 0.13,0.2 --max-opponent-troop-ratio-list 0.55,0.65 --low-attack-slider-list 0.35,0.415 --target-probe-count-list 3,4 --reprobe-low-attack-on-unsafe-cost-list true,false --tune-objective placement --write-best-config artifacts/profiles/best-attack-cost.json
```

Run with a saved local profile:

```sh
npm run bot -- --config artifacts/profiles/best-attack-cost.json --duration-ms 30000
npm run evaluate -- --config artifacts/profiles/best-attack-cost.json --games 3 --duration-ms 15000
```

Analyze existing run artifacts:

```sh
npm run analyze -- --input artifacts --output artifacts/analysis-summary.json
```

Train a local target-ranking policy from recorded decisions:

```sh
npm run train-policy -- --input artifacts --output artifacts/policies/local-target-ranker.json
```

Train an outcome-filtered target-ranking policy from successful bot decisions:

```sh
npm run train-outcome-policy -- --input artifacts --outcome-horizon 2 --min-outcome-owned-cell-growth 1 --output artifacts/policies/outcome-target-ranker.json
```

Evaluate an outcome-trained ranker against held-out bot rollouts:

```sh
npm run evaluate-outcome-policy -- --input artifacts --policy artifacts/policies/outcome-target-ranker.json --outcome-horizon 2 --min-outcome-owned-cell-growth 1 --output artifacts/policies/outcome-target-ranker-eval.json
```

Train a target-ranker from action-labeled observation recordings:

```sh
npm run train-action-policy -- --input artifacts --output artifacts/policies/action-target-ranker.json
```

Evaluate a target-ranker against held-out action-labeled recordings:

```sh
npm run evaluate-action-policy -- --input artifacts --policy artifacts/policies/action-target-ranker.json --output artifacts/policies/action-target-ranker-eval.json
```

Run with a trained target ranker:

```sh
npm run bot -- --policy artifacts/policies/local-target-ranker.json --policy-candidate-count 8 --duration-ms 30000
```

Probe the real client's menu/lobby routes without playing a public match:

```sh
npm run lobby-probe -- --headless --route game-menu --duration-ms 3000 --player-name TTBotLab
npm run lobby-probe -- --headless --route join-lobby-2 --duration-ms 6000 --player-name TTBotLab
```

Watch a lobby route for named friends or a minimum player count without clicking `Ready`:

```sh
npm run lobby-watch -- --headless --route join-lobby-2 --player-name TTBotLab --expected-player TTBotLab --min-players 1 --watch-ms 10000
```

Run tests:

```sh
npm test
```

Artifacts are written under `artifacts/` and are ignored by git.

Observation recordings are newline-delimited JSON and are intended to be local training/evaluation input. By default they keep compact telemetry, visual state, draw counts, canvas metadata, and passive WebSocket lifecycle counts. `--include-grid` stores the raw sampled RGBA grid for every observation, which is larger and intentionally opt-in.

When `--label-actions` is set, `observations.ndjson` also includes local UI events captured by the injected client script. Canvas clicks and pointer events are normalized to canvas-relative coordinates when possible, and key presses are stored as key labels. This is for local supervised/imitation learning from authorized play sessions; it still does not inspect, send, or replay gameplay protocol messages.

For named runs, pass `--player-name <name>` before recording or running the bot. When that exact name appears in drawn map or leaderboard text, the harness uses it as the own-player identity instead of relying only on default `Player N` inference.

For troop-aware target selection, `--max-target-troop-ratio` controls when visible neutral labels are treated as too strong relative to the bot's own visible troops. `--max-opponent-troop-ratio` is a stricter cap for opponent labels inferred from leaderboard names or non-own `Player N` labels, and for still-unknown labels. It defaults to `0.65` so the bot does not attack player-like labels using the looser neutral-land threshold. `--weak-target-troop-ratio` controls when a labeled target is considered weak enough for more aggressive attack sizing. These guards only apply when the real client draws a usable map-label troop count.

For attack-cost selection, `--max-selected-attack-ratio` rejects hover-probed targets whose selected attack troops exceed that fraction of the bot's current visible troops. With `--reprobe-low-attack-on-unsafe-cost`, the bot lowers the real attack slider to `--low-attack-slider`, waits `--attack-percent-wait-ms`, and reprobes the same candidates once before deciding whether to click or hold. With `--recover-attack-slider-after-progress`, the next post-opening decision restores the normal attack slider before probing when the sampled canvas shows enough owned-cell growth, so low-slider recovery remains evidence-driven instead of permanent. `--max-selected-attack-percent` is still used by adaptive attack sizing to move the real slider down when the real client's selected percentage label is too high.

For progress-aware pacing, `--stall-backoff` waits after repeated post-opening ticks where the sampled owned-cell count does not increase by at least `--min-owned-cell-growth`. When a post-opening target fails to produce at least `--min-successful-target-growth`, the bot remembers that target area for `--failed-target-cooldown` decisions and avoids candidates within `--failed-target-distance`. This is based on the lossy sampled canvas grid, so it is a conservative tuning signal rather than exact territory accounting.

Decision samples are stored as newline-delimited JSON so they can be streamed into training or analysis scripts without loading full screenshots/instrumentation into memory. The sample format is intentionally compact and lossy: it keeps candidate features, visible map labels, and action context, not full canvas frames.

The current trained policy format is a prototype linear target ranker. `train-policy` learns from the bot's own recorded choices, so it is only as good as the rollouts used to train it. `train-outcome-policy` filters those choices to clicks that are followed by sampled owned-cell growth within `--outcome-horizon`, but the sampled canvas grid is lossy and delayed captures can misattribute outcomes. These commands are useful for building the training/evaluation loop, but they are not evidence of high-skill play yet.

`train-action-policy` uses action-labeled observation recordings instead of bot decision samples. It only trains from canvas clicks that can be matched to current visual/map-label candidates within `--positive-distance`, so menu clicks, unmatched clicks, and samples without candidates are ignored. The output policy is still the same prototype linear target ranker and can be passed to `bot --policy`.

`evaluate-outcome-policy` is an offline ranking check over bot decisions that had a positive sampled outcome. It reports top-1/top-3, mean rank, MRR, and candidate count for the target that was actually clicked in successful decisions. Use separate held-out rollout directories for honest comparisons; evaluating on the same artifacts used for `train-outcome-policy` is only a smoke test.

`evaluate-action-policy` is an offline ranking check over action-labeled recordings. It is useful for comparing policies before spending time on real-client bot runs, but it is not a win-rate measurement and does not prove the bot is strong.

Lobby probe artifacts are also local and ignored by git. They include visible DOM text because Territorial.io's Game Menu and lobby are not fully drawn through the same canvas text path as the match UI. Network logging records request URLs, WebSocket lifecycle, and frame sizes only; it does not send or replay gameplay protocol messages.

`lobby-probe-summary.json` includes an `assessment` object that reports whether the route reached the Game Menu, found `Join Lobby 2`, entered a lobby screen, saw a `Ready` control, or remained stuck at loading. When `Ready` is visible, the assessment includes a dry-run click target so later authorized/private-room automation can reuse the locator. The current `join-lobby-2` route is evidence for a real public lobby surface, not a private-room implementation.

`lobby-watch-summary.json` includes route captures, a compact watch timeline, visible lobby players, expected-player matches, minimum-player checks, and a dry-run `Ready` target when the readiness condition is met. This is local observation/planning data only; the command does not press `Ready`.

## Scoring

Evaluation scoring is a tuning heuristic, not a game result. It combines recent leaderboard rank, visible troops, percentage, interest, and income from text drawn by the real client. Each evaluation entry also records placement metrics derived from the final drawn rank/player count: placement percentile, rank fraction, and top-10/top-25/top-50 flags. These are useful for comparing bot configurations over the same duration, but they are not proof of long-game strength yet.

`--spawn-list` takes normalized custom-map click coordinates as `x:y` pairs separated by commas, for example `0.63:0.78,0.54:0.74`. These are real browser click targets on the current custom scenario map, not map-independent strategic locations, so revalidate them if Territorial.io changes the custom scenario layout.

Pacing sweeps use `--min-interest-list`, `--resume-interest-list`, and `--midgame-start-seconds-list`. They can make the bot attack earlier or wait longer after the opening budget, so compare them over the same duration and map before trusting a profile.

`tune-summary.json` records mean/best/worst score, mean/best placement percentile, mean/best rank, and top-rate metrics for each swept config. By default it ranks configurations by mean heuristic score; pass `--tune-objective placement` or `--tune-objective rank` when placement should drive the selected profile. Because each configuration launches the real game through Playwright, use small lists for smoke tests and increase `--games` only when you intentionally want a longer tuning run.

Saved config profiles are plain local JSON. Values from `--config <file>` are defaults only; explicit CLI flags override them. Put generated profiles under `artifacts/profiles/` if you want them ignored by git.

## Development Roadmap

The next useful pieces are:

- Improve the canvas-state decoder so it can infer map bounds, player colors, opponent troop labels, selected target state, and border ownership more reliably.
- Turn action-labeled observation recordings into supervised/offline evaluation sets for visual-state reconstruction and strategic target selection.
- Add enemy/neighbor evaluation from recorded rollouts: estimate relative strength, attack only when profitable, and size attacks based on decoded opponent labels, interest, and visual region features. Current selected attack labels help size the bot's own sends, but they are not enemy-strength labels.
- Add private-room flow automation so friends can join a controlled match without public-match automation. The current real-client evidence shows the visible `Join Lobby 2` route, loaded lobby, `Ready` locator, and watcher/readiness plan, but this is still public Lobby 2, not a private-room flow.
- Run longer repeated evaluations and track placement/win rate, not only final opening telemetry.
- Sweep opening budgets, attack percentages, pause thresholds, and spawn points over repeated real-client games.
- Improve the policy pipeline with stronger labels, opponent/neutral context, held-out evaluation, and policies trained from much longer real-client rollouts.

## Fresh Clone Check

A fresh clone can install dependencies, run tests, and launch the real game for probes if it has network access and a Chromium-compatible Playwright browser. It will not include generated artifacts, credentials, private game state, or a trained model.
