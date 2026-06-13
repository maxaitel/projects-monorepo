#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const args = parseArgs(process.argv.slice(2));
const codexHome = path.resolve(args.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
const outPath = path.resolve(args.out || path.join(process.cwd(), "src", "generatedUsage.js"));
const includeTitles = args.titles !== false;
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";

const quality = {
  filesScanned: 0,
  tokenEvents: 0,
  threadsWithUsage: 0,
  invalidJsonLines: 0,
  missingLastUsage: 0,
  missingTotalUsage: 0,
  duplicateSessions: 0,
  notes: []
};

const titles = loadSessionTitles(path.join(codexHome, "session_index.jsonl"));
const files = [
  ...listJsonlFiles(path.join(codexHome, "sessions")),
  ...listJsonlFiles(path.join(codexHome, "archived_sessions"))
];

if (files.length === 0) {
  quality.notes.push(`No JSONL session files found under ${codexHome}`);
}

const sessions = new Map();
for (const file of files) {
  const parsed = await parseSessionFile(file);
  quality.filesScanned += 1;
  if (parsed.events.length === 0) continue;

  const existing = sessions.get(parsed.id);
  if (existing) {
    quality.duplicateSessions += 1;
    existing.events.push(...parsed.events);
    existing.meta = { ...existing.meta, ...parsed.meta };
  } else {
    sessions.set(parsed.id, parsed);
  }
}

for (const session of sessions.values()) {
  session.events = dedupeEvents(session.events).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

const data = buildDataset([...sessions.values()]);
writeGeneratedData(outPath, data);

console.log(`Generated ${path.relative(process.cwd(), outPath)} from ${quality.filesScanned} session files.`);
console.log(`${quality.tokenEvents} token-count events across ${quality.threadsWithUsage} threads.`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--codex-home") {
      parsed.codexHome = argv[++index];
    } else if (arg === "--out") {
      parsed.out = argv[++index];
    } else if (arg === "--no-titles") {
      parsed.titles = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/generate-usage.js [options]

Options:
  --codex-home <path>  Codex home directory. Defaults to CODEX_HOME or ~/.codex.
  --out <path>         Output JS file. Defaults to src/generatedUsage.js.
  --no-titles          Do not include Codex thread titles in generated data.
`);
}

function listJsonlFiles(root) {
  if (!fs.existsSync(root)) return [];
  const results = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
}

function loadSessionTitles(indexPath) {
  const map = new Map();
  if (!fs.existsSync(indexPath)) return map;

  const lines = fs.readFileSync(indexPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.id && entry.thread_name) {
        map.set(entry.id, {
          title: entry.thread_name,
          updatedAt: entry.updated_at || null
        });
      }
    } catch {
      quality.invalidJsonLines += 1;
    }
  }
  return map;
}

async function parseSessionFile(file) {
  const meta = {
    id: path.basename(file, ".jsonl"),
    file,
    cwd: "",
    workspace: "unknown",
    source: "primary",
    model: "",
    provider: "",
    createdAt: "",
    cliVersion: ""
  };
  const events = [];
  let previousTotal = null;

  const input = fs.createReadStream(file, { encoding: "utf8" });
  const reader = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of reader) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      quality.invalidJsonLines += 1;
      continue;
    }

    if (entry.type === "session_meta" && entry.payload) {
      const payload = entry.payload;
      meta.id = payload.id || meta.id;
      meta.cwd = payload.cwd || meta.cwd;
      meta.workspace = basenameOrUnknown(payload.cwd);
      meta.source =
        payload.thread_source === "subagent" || payload.source?.subagent ? "subagent" : "primary";
      meta.model = payload.model || payload.base_model || meta.model;
      meta.provider = payload.model_provider || meta.provider;
      meta.createdAt = payload.timestamp || entry.timestamp || meta.createdAt;
      meta.cliVersion = payload.cli_version || meta.cliVersion;
    }

    if (entry.type !== "event_msg" || entry.payload?.type !== "token_count") continue;

    const info = entry.payload.info || {};
    const totalUsage = readUsage(info.total_token_usage);
    let lastUsage = readUsage(info.last_token_usage);

    if (!lastUsage.total && previousTotal?.total && totalUsage.total) {
      lastUsage = subtractUsage(totalUsage, previousTotal);
    }
    if (!lastUsage.total) quality.missingLastUsage += 1;
    if (!totalUsage.total) quality.missingTotalUsage += 1;
    previousTotal = totalUsage.total ? totalUsage : previousTotal;

    const rateLimits = readRateLimits(entry.payload.rate_limits);
    const timestamp = entry.timestamp || meta.createdAt;
    if (!timestamp) continue;

    events.push({
      timestamp,
      date: localDateKey(timestamp),
      weekday: localWeekday(timestamp),
      hour: new Date(timestamp).getHours(),
      totalUsage,
      lastUsage,
      contextWindow: numberValue(info.model_context_window),
      rateLimits
    });
  }

  return {
    id: meta.id,
    meta,
    events
  };
}

function readUsage(value = {}) {
  const input = numberValue(value.input_tokens);
  const cachedInput = numberValue(value.cached_input_tokens);
  const output = numberValue(value.output_tokens);
  const reasoningOutput = numberValue(value.reasoning_output_tokens);
  const total = numberValue(value.total_tokens) || input + output;
  return {
    total,
    input,
    uncachedInput: Math.max(0, input - cachedInput),
    cachedInput,
    output,
    reasoningOutput
  };
}

function subtractUsage(current, previous) {
  return {
    total: Math.max(0, current.total - previous.total),
    input: Math.max(0, current.input - previous.input),
    uncachedInput: Math.max(0, current.uncachedInput - previous.uncachedInput),
    cachedInput: Math.max(0, current.cachedInput - previous.cachedInput),
    output: Math.max(0, current.output - previous.output),
    reasoningOutput: Math.max(0, current.reasoningOutput - previous.reasoningOutput)
  };
}

function readRateLimits(value = {}) {
  value = value || {};
  const primary = value.primary || {};
  const secondary = value.secondary || {};
  return {
    planType: value.plan_type || "",
    primaryUsedPercent: numberValue(primary.used_percent),
    primaryWindowMinutes: numberValue(primary.window_minutes),
    primaryResetsAt: primary.resets_at ? new Date(primary.resets_at * 1000).toISOString() : null,
    secondaryUsedPercent: numberValue(secondary.used_percent),
    secondaryWindowMinutes: numberValue(secondary.window_minutes),
    secondaryResetsAt: secondary.resets_at ? new Date(secondary.resets_at * 1000).toISOString() : null,
    reachedType: value.rate_limit_reached_type || null
  };
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function basenameOrUnknown(value) {
  if (!value) return "unknown";
  return path.basename(value) || value;
}

function localDateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localWeekday(timestamp) {
  const day = new Date(timestamp).getDay();
  return (day + 6) % 7;
}

function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = `${event.timestamp}|${event.lastUsage.total}|${event.totalUsage.total}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildDataset(sessionList) {
  const dailyMap = new Map();
  const hourlyMap = new Map();
  const threads = [];
  let latestRateLimit = null;
  let maxPrimaryUsedPercent = 0;
  let maxSecondaryUsedPercent = 0;
  let rateLimitSamples = 0;

  for (const session of sessionList) {
    if (session.events.length === 0) continue;
    quality.threadsWithUsage += 1;

    const titleEntry = titles.get(session.id);
    const latestEvent = session.events[session.events.length - 1];
    const firstEvent = session.events[0];
    const threadTotal = latestEvent.totalUsage.total ? latestEvent.totalUsage : sumLastUsage(session.events);

    threads.push({
      id: session.id,
      title: includeTitles ? titleEntry?.title || `Thread ${session.id.slice(0, 8)}` : `Thread ${session.id.slice(0, 8)}`,
      workspace: session.meta.workspace,
      source: session.meta.source,
      requests: session.events.length,
      total: threadTotal.total,
      input: threadTotal.input,
      uncachedInput: threadTotal.uncachedInput,
      cachedInput: threadTotal.cachedInput,
      output: threadTotal.output,
      reasoningOutput: threadTotal.reasoningOutput,
      firstSeen: firstEvent.timestamp,
      lastSeen: latestEvent.timestamp
    });

    for (const event of session.events) {
      quality.tokenEvents += 1;
      addUsage(dailyMap, event.date, event.lastUsage, { requests: 1 });

      const hourKey = `${event.date}|${event.weekday}|${event.hour}`;
      addUsage(hourlyMap, hourKey, event.lastUsage, {
        date: event.date,
        weekday: event.weekday,
        hour: event.hour,
        requests: 1
      });

      if (event.rateLimits) {
        const primary = numberValue(event.rateLimits.primaryUsedPercent);
        const secondary = numberValue(event.rateLimits.secondaryUsedPercent);
        if (primary || secondary) {
          latestRateLimit = event.rateLimits;
          maxPrimaryUsedPercent = Math.max(maxPrimaryUsedPercent, primary);
          maxSecondaryUsedPercent = Math.max(maxSecondaryUsedPercent, secondary);
          rateLimitSamples += 1;
        }
      }
    }
  }

  const daily = fillDaily([...dailyMap.entries()].map(([date, values]) => ({ date, ...values })));
  const hourly = [...hourlyMap.values()].sort((a, b) =>
    a.date === b.date ? a.hour - b.hour : a.date.localeCompare(b.date)
  );
  const totals = totalsFromDaily(daily);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    isSample: false,
    timezone,
    source: {
      codexHome: displayCodexHome(codexHome),
      roots: ["sessions", "archived_sessions"],
      titleSource: includeTitles ? "session_index.jsonl" : "disabled"
    },
    totals: {
      ...totals,
      threads: threads.length
    },
    dateRange: {
      first: daily[0]?.date || null,
      last: daily[daily.length - 1]?.date || null
    },
    daily,
    hourly,
    threads: threads.sort((a, b) => b.total - a.total),
    rateLimits: {
      latest: latestRateLimit,
      maxPrimaryUsedPercent,
      maxSecondaryUsedPercent,
      samples: rateLimitSamples
    },
    quality
  };
}

function addUsage(map, key, usage, extra = {}) {
  const { requests = 0, ...metadata } = extra;
  const current = map.get(key) || {
    total: 0,
    input: 0,
    uncachedInput: 0,
    cachedInput: 0,
    output: 0,
    reasoningOutput: 0,
    requests: 0,
    ...metadata
  };
  current.total += numberValue(usage.total);
  current.input += numberValue(usage.input);
  current.uncachedInput += numberValue(usage.uncachedInput);
  current.cachedInput += numberValue(usage.cachedInput);
  current.output += numberValue(usage.output);
  current.reasoningOutput += numberValue(usage.reasoningOutput);
  current.requests += numberValue(requests);
  map.set(key, current);
}

function sumLastUsage(events) {
  return events.reduce(
    (acc, event) => ({
      total: acc.total + event.lastUsage.total,
      input: acc.input + event.lastUsage.input,
      uncachedInput: acc.uncachedInput + event.lastUsage.uncachedInput,
      cachedInput: acc.cachedInput + event.lastUsage.cachedInput,
      output: acc.output + event.lastUsage.output,
      reasoningOutput: acc.reasoningOutput + event.lastUsage.reasoningOutput
    }),
    { total: 0, input: 0, uncachedInput: 0, cachedInput: 0, output: 0, reasoningOutput: 0 }
  );
}

function totalsFromDaily(daily) {
  return daily.reduce(
    (acc, row) => ({
      total: acc.total + row.total,
      input: acc.input + row.input,
      uncachedInput: acc.uncachedInput + row.uncachedInput,
      cachedInput: acc.cachedInput + row.cachedInput,
      output: acc.output + row.output,
      reasoningOutput: acc.reasoningOutput + row.reasoningOutput,
      requests: acc.requests + row.requests
    }),
    { total: 0, input: 0, uncachedInput: 0, cachedInput: 0, output: 0, reasoningOutput: 0, requests: 0 }
  );
}

function fillDaily(rows) {
  const sorted = rows.sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length <= 1) return sorted;

  const byDate = new Map(sorted.map((row) => [row.date, row]));
  const result = [];
  const cursor = new Date(`${sorted[0].date}T00:00:00`);
  const end = new Date(`${sorted[sorted.length - 1].date}T00:00:00`);

  while (cursor <= end) {
    const key = localDateKey(cursor);
    result.push(
      byDate.get(key) || {
        date: key,
        total: 0,
        input: 0,
        uncachedInput: 0,
        cachedInput: 0,
        output: 0,
        reasoningOutput: 0,
        requests: 0
      }
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function displayCodexHome(value) {
  const home = os.homedir();
  return value.startsWith(home) ? value.replace(home, "~") : value;
}

function writeGeneratedData(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const contents = `window.CODEX_USAGE_DATA = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(file, contents);
}
