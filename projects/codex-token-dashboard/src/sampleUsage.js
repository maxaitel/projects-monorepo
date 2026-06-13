window.CODEX_SAMPLE_USAGE_DATA = {
  schemaVersion: 1,
  generatedAt: "2026-06-13T00:00:00.000Z",
  isSample: true,
  timezone: "Pacific/Auckland",
  source: {
    codexHome: "~/.codex",
    roots: ["sessions", "archived_sessions"],
    titleSource: "sample"
  },
  totals: {
    total: 4238000,
    input: 3294000,
    uncachedInput: 1289000,
    cachedInput: 2005000,
    output: 901000,
    reasoningOutput: 43000,
    requests: 54,
    threads: 8
  },
  dateRange: {
    first: "2026-06-07",
    last: "2026-06-13"
  },
  daily: [
    { date: "2026-06-07", total: 412000, input: 324000, uncachedInput: 154000, cachedInput: 170000, output: 85000, reasoningOutput: 3000, requests: 7 },
    { date: "2026-06-08", total: 536000, input: 414000, uncachedInput: 181000, cachedInput: 233000, output: 116000, reasoningOutput: 6000, requests: 8 },
    { date: "2026-06-09", total: 608000, input: 471000, uncachedInput: 186000, cachedInput: 285000, output: 130000, reasoningOutput: 7000, requests: 9 },
    { date: "2026-06-10", total: 781000, input: 615000, uncachedInput: 223000, cachedInput: 392000, output: 156000, reasoningOutput: 10000, requests: 10 },
    { date: "2026-06-11", total: 962000, input: 744000, uncachedInput: 247000, cachedInput: 497000, output: 207000, reasoningOutput: 11000, requests: 11 },
    { date: "2026-06-12", total: 585000, input: 452000, uncachedInput: 188000, cachedInput: 264000, output: 126000, reasoningOutput: 7000, requests: 6 },
    { date: "2026-06-13", total: 354000, input: 274000, uncachedInput: 110000, cachedInput: 164000, output: 81000, reasoningOutput: 2000, requests: 3 }
  ],
  hourly: [
    { weekday: 0, hour: 9, total: 145000, requests: 4 },
    { weekday: 0, hour: 10, total: 188000, requests: 5 },
    { weekday: 1, hour: 11, total: 220000, requests: 6 },
    { weekday: 2, hour: 13, total: 310000, requests: 7 },
    { weekday: 3, hour: 15, total: 404000, requests: 9 },
    { weekday: 4, hour: 16, total: 260000, requests: 5 },
    { weekday: 5, hour: 21, total: 155000, requests: 3 },
    { weekday: 6, hour: 12, total: 98000, requests: 2 }
  ],
  threads: [
    { id: "sample-thread-1", title: "Refactor dashboard parser", workspace: "monorepo", source: "primary", requests: 12, total: 1110000, input: 860000, uncachedInput: 280000, cachedInput: 580000, output: 238000, reasoningOutput: 12000, firstSeen: "2026-06-10T10:00:00.000Z", lastSeen: "2026-06-11T14:30:00.000Z" },
    { id: "sample-thread-2", title: "Debug local media pipeline", workspace: "discord-persona-chat", source: "primary", requests: 9, total: 840000, input: 651000, uncachedInput: 271000, cachedInput: 380000, output: 180000, reasoningOutput: 9000, firstSeen: "2026-06-09T08:10:00.000Z", lastSeen: "2026-06-09T16:10:00.000Z" },
    { id: "sample-thread-3", title: "Review Codex workflow notes", workspace: "monorepo", source: "subagent", requests: 8, total: 655000, input: 503000, uncachedInput: 180000, cachedInput: 323000, output: 145000, reasoningOutput: 7000, firstSeen: "2026-06-12T12:00:00.000Z", lastSeen: "2026-06-12T13:00:00.000Z" },
    { id: "sample-thread-4", title: "Build graph-heavy usage view", workspace: "codex-token-dashboard", source: "primary", requests: 7, total: 501000, input: 385000, uncachedInput: 169000, cachedInput: 216000, output: 112000, reasoningOutput: 4000, firstSeen: "2026-06-13T01:00:00.000Z", lastSeen: "2026-06-13T03:00:00.000Z" }
  ],
  rateLimits: {
    latest: {
      planType: "pro",
      primaryUsedPercent: 24,
      primaryWindowMinutes: 300,
      secondaryUsedPercent: 41,
      secondaryWindowMinutes: 10080
    },
    maxPrimaryUsedPercent: 38,
    maxSecondaryUsedPercent: 56,
    samples: 18
  },
  quality: {
    filesScanned: 4,
    tokenEvents: 54,
    threadsWithUsage: 8,
    invalidJsonLines: 0,
    missingLastUsage: 0,
    missingTotalUsage: 0,
    duplicateSessions: 0,
    notes: ["Sample data is synthetic. Run npm run generate for local usage."]
  }
};
