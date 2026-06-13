const rawUsage = window.CODEX_USAGE_DATA || window.CODEX_SAMPLE_USAGE_DATA;
const isSample = !window.CODEX_USAGE_DATA;

const state = {
  rangeDays: 7,
  hideTitles: false,
  threadFilter: ""
};

const colors = {
  total: "#4bd8f2",
  input: "#8ee667",
  cachedInput: "#f6b83f",
  output: "#ff705f",
  reasoningOutput: "#c091ff"
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const els = {
  rangeSummary: document.querySelector("#rangeSummary"),
  sourceLabel: document.querySelector("#sourceLabel"),
  updatedLabel: document.querySelector("#updatedLabel"),
  timezoneLabel: document.querySelector("#timezoneLabel"),
  environmentLabel: document.querySelector("#environmentLabel"),
  datasetLabel: document.querySelector("#datasetLabel"),
  sampleBanner: document.querySelector("#sampleBanner"),
  kpis: document.querySelector("#history"),
  dailyChart: document.querySelector("#dailyChart"),
  dailyChartCaption: document.querySelector("#dailyChartCaption"),
  lineLegend: document.querySelector("#lineLegend"),
  compositionChart: document.querySelector("#compositionChart"),
  limitGauge: document.querySelector("#limitGauge"),
  threadTable: document.querySelector("#threadTable"),
  heatmap: document.querySelector("#heatmap"),
  insightList: document.querySelector("#insightList"),
  threadFilter: document.querySelector("#threadFilter"),
  privacyToggle: document.querySelector("#privacyToggle"),
  filesScanned: document.querySelector("#filesScanned"),
  eventsScanned: document.querySelector("#eventsScanned"),
  threadsScanned: document.querySelector("#threadsScanned"),
  dataCaveat: document.querySelector("#dataCaveat")
};

function numberValue(value) {
  return Number.isFinite(value) ? value : 0;
}

function sumMetric(rows, key) {
  return rows.reduce((sum, row) => sum + numberValue(row[key]), 0);
}

function formatNumber(value) {
  const abs = Math.abs(numberValue(value));
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(digits)}%`;
}

function formatDate(value) {
  if (!value) return "unknown";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "unknown";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dailyRowsForRange(days) {
  const rows = [...(rawUsage.daily || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (days === "all") return rows;
  return rows.slice(-days);
}

function previousDailyRows(days, selectedRows) {
  if (days === "all" || selectedRows.length === 0) return [];
  const rows = [...(rawUsage.daily || [])].sort((a, b) => a.date.localeCompare(b.date));
  const endIndex = rows.findIndex((row) => row.date === selectedRows[0].date);
  if (endIndex <= 0) return [];
  return rows.slice(Math.max(0, endIndex - days), endIndex);
}

function totalsFromRows(rows) {
  return {
    total: sumMetric(rows, "total"),
    input: sumMetric(rows, "input"),
    uncachedInput: sumMetric(rows, "uncachedInput"),
    cachedInput: sumMetric(rows, "cachedInput"),
    output: sumMetric(rows, "output"),
    reasoningOutput: sumMetric(rows, "reasoningOutput"),
    requests: sumMetric(rows, "requests")
  };
}

function deltaMarkup(current, previous) {
  if (!previous) return `<span>No prior window</span>`;
  const delta = ((current - previous) / previous) * 100;
  const className = delta >= 0 ? "delta-up" : "delta-down";
  const sign = delta >= 0 ? "+" : "";
  return `<span class="${className}">${sign}${formatPercent(delta)}</span> vs previous window`;
}

function renderKpis(rows) {
  const totals = totalsFromRows(rows);
  const previous = totalsFromRows(previousDailyRows(state.rangeDays, rows));
  const cacheRate = totals.input ? (totals.cachedInput / totals.input) * 100 : 0;
  const outputShare = totals.total ? (totals.output / totals.total) * 100 : 0;
  const reasoningShare = totals.output ? (totals.reasoningOutput / totals.output) * 100 : 0;
  const avgRequest = totals.requests ? totals.total / totals.requests : 0;

  const kpis = [
    {
      label: "Total tokens",
      value: formatNumber(totals.total),
      subtext: deltaMarkup(totals.total, previous.total),
      accent: colors.total,
      icon: "database"
    },
    {
      label: "Input tokens",
      value: formatNumber(totals.input),
      subtext: `${formatPercent(totals.total ? (totals.input / totals.total) * 100 : 0)} of total volume`,
      accent: colors.input,
      icon: "arrow-up"
    },
    {
      label: "Cached input",
      value: formatNumber(totals.cachedInput),
      subtext: `${formatPercent(cacheRate)} of input tokens reused`,
      accent: colors.cachedInput,
      icon: "cache"
    },
    {
      label: "Output tokens",
      value: formatNumber(totals.output),
      subtext: `${formatPercent(outputShare)} of total; reasoning ${formatPercent(reasoningShare)}`,
      accent: colors.output,
      icon: "arrow-down"
    },
    {
      label: "Requests",
      value: formatNumber(totals.requests),
      subtext: `${formatNumber(avgRequest)} tokens per token-count event`,
      accent: colors.violet,
      icon: "hash"
    }
  ];

  els.kpis.innerHTML = kpis
    .map(
      (kpi) => `
        <article class="kpi-card" style="--accent:${kpi.accent}">
          <div class="kpi-topline">
            <span class="kpi-icon">${icon(kpi.icon)}</span>
            <span>${escapeHtml(kpi.label)}</span>
          </div>
          <div class="kpi-value">${kpi.value}</div>
          <div class="kpi-subtext">${kpi.subtext}</div>
        </article>
      `
    )
    .join("");
}

function icon(name) {
  const icons = {
    database: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>',
    "arrow-up": '<svg viewBox="0 0 24 24"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
    "arrow-down": '<svg viewBox="0 0 24 24"><path d="M7 7l10 10"/><path d="M17 8v9H8"/></svg>',
    cache: '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/><path d="M3 9h3"/><path d="M3 15h3"/><path d="M18 9h3"/><path d="M18 15h3"/></svg>',
    hash: '<svg viewBox="0 0 24 24"><path d="M5 9h14"/><path d="M5 15h14"/><path d="m10 4-2 16"/><path d="m16 4-2 16"/></svg>'
  };
  return icons[name] || icons.database;
}

function renderLegend() {
  const items = [
    ["Total", colors.total],
    ["Input", colors.input],
    ["Output", colors.output],
    ["Cached", colors.cachedInput]
  ];
  els.lineLegend.innerHTML = items
    .map(
      ([label, color]) =>
        `<span class="legend-item"><span class="legend-swatch" style="--series-color:${color}"></span>${label}</span>`
    )
    .join("");
}

function renderLineChart(rows) {
  const width = 900;
  const height = 330;
  const pad = { top: 18, right: 28, bottom: 46, left: 58 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.total, row.input, row.output, row.cachedInput]));
  const yMax = Math.ceil(maxValue / 100000) * 100000;
  const x = (index) => pad.left + (rows.length <= 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const y = (value) => pad.top + plotHeight - (numberValue(value) / yMax) * plotHeight;

  const series = [
    ["total", "total", colors.total],
    ["input", "input", colors.input],
    ["output", "output", colors.output],
    ["cachedInput", "cachedInput", colors.cachedInput]
  ];

  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = (yMax / 4) * index;
    const yy = y(value);
    return `
      <line class="grid-line" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" />
      <text class="axis-label" x="${pad.left - 12}" y="${yy + 4}" text-anchor="end">${formatNumber(value)}</text>
    `;
  }).join("");

  const lines = series
    .map(([name, key, color]) => {
      const points = rows.map((row, index) => `${x(index)},${y(row[key])}`).join(" ");
      const areaPoints = `${pad.left},${height - pad.bottom} ${points} ${width - pad.right},${height - pad.bottom}`;
      const area =
        name === "total" ? `<polygon class="chart-area" points="${areaPoints}" fill="${color}"></polygon>` : "";
      return `${area}<polyline class="chart-line" points="${points}" stroke="${color}"></polyline>`;
    })
    .join("");

  const labels = rows
    .map((row, index) => {
      const showEvery = rows.length > 18 ? 4 : rows.length > 10 ? 2 : 1;
      if (index % showEvery !== 0 && index !== rows.length - 1) return "";
      return `<text class="axis-label" x="${x(index)}" y="${height - 16}" text-anchor="middle">${formatDate(row.date)}</text>`;
    })
    .join("");

  const points = rows
    .map((row, index) => `<circle cx="${x(index)}" cy="${y(row.total)}" r="3" fill="${colors.total}"></circle>`)
    .join("");

  els.dailyChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      ${grid}
      <line class="grid-line" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" />
      <line class="grid-line" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" />
      ${lines}
      ${points}
      ${labels}
    </svg>
  `;
}

function renderComposition(rows) {
  const totals = totalsFromRows(rows);
  const denominator = Math.max(1, totals.uncachedInput + totals.cachedInput + totals.output + totals.reasoningOutput);
  const inputPct = (totals.uncachedInput / denominator) * 100;
  const cachePct = inputPct + (totals.cachedInput / denominator) * 100;
  const outputPct = cachePct + (totals.output / denominator) * 100;

  const items = [
    ["Uncached input", totals.uncachedInput, colors.input, `${formatPercent((totals.uncachedInput / denominator) * 100)} of composition`],
    ["Cached input", totals.cachedInput, colors.cachedInput, `${formatPercent(totals.input ? (totals.cachedInput / totals.input) * 100 : 0)} of input reused`],
    ["Output", totals.output, colors.output, `${formatPercent((totals.output / denominator) * 100)} of composition`],
    ["Reasoning output", totals.reasoningOutput, colors.violet, `${formatPercent(totals.output ? (totals.reasoningOutput / totals.output) * 100 : 0)} of output`]
  ];

  els.compositionChart.innerHTML = `
    <div class="donut" style="--input-end:${inputPct}%;--cache-end:${cachePct}%;--output-end:${outputPct}%">
      <div class="donut-center">
        <strong>${formatNumber(totals.total)}</strong>
        <span>Total</span>
      </div>
    </div>
    <div class="composition-list">
      ${items
        .map(
          ([label, value, color, caption]) => `
            <div class="composition-row">
              <span class="composition-dot" style="--dot:${color}"></span>
              <div>
                <strong>${label}</strong>
                <span>${formatNumber(value)} · ${caption}</span>
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function gaugePath(percent, radius, centerX, centerY) {
  const angle = -180 + (Math.max(0, Math.min(100, percent)) / 100) * 180;
  const radians = (angle * Math.PI) / 180;
  const start = { x: centerX - radius, y: centerY };
  const end = { x: centerX + radius * Math.cos(radians), y: centerY + radius * Math.sin(radians) };
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

function gaugePoint(percent, radius, centerX, centerY) {
  const angle = -180 + (Math.max(0, Math.min(100, percent)) / 100) * 180;
  const radians = (angle * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians)
  };
}

function renderGauge() {
  const limits = rawUsage.rateLimits || {};
  const latest = limits.latest || {};
  const latestPrimary = numberValue(latest.primaryUsedPercent);
  const latestSecondary = numberValue(latest.secondaryUsedPercent);
  const maxPrimary = numberValue(limits.maxPrimaryUsedPercent);
  const maxSecondary = numberValue(limits.maxSecondaryUsedPercent);
  const pressure = Math.max(latestPrimary, latestSecondary, maxPrimary, maxSecondary);
  const pressureColor =
    pressure >= 85 ? colors.output : pressure >= 55 ? colors.cachedInput : colors.input;
  const needleEnd = gaugePoint(pressure, 88, 160, 150);
  const label = latest.planType ? `${latest.planType} plan` : "plan unknown";
  const samples = numberValue(limits.samples);

  els.limitGauge.innerHTML = `
    <div>
      <svg viewBox="0 0 320 190" role="img" aria-label="Rate limit pressure gauge">
        <path d="M 40 150 A 120 120 0 0 1 280 150" fill="none" stroke="#202d32" stroke-width="18" stroke-linecap="round" />
        <path d="${gaugePath(pressure, 120, 160, 150)}" fill="none" stroke="${pressureColor}" stroke-width="18" stroke-linecap="round" />
        <line x1="160" y1="150" x2="${needleEnd.x}" y2="${needleEnd.y}" stroke="#d9e3df" stroke-width="5" stroke-linecap="round" />
        <circle cx="160" cy="150" r="10" fill="#87919a" stroke="#0a1114" stroke-width="4" />
        <text x="40" y="174" class="axis-label">0%</text>
        <text x="151" y="40" class="axis-label">50%</text>
        <text x="260" y="174" class="axis-label">100%</text>
      </svg>
      <div class="gauge-value" style="--gauge-color:${pressureColor}">${formatPercent(pressure, 0)}</div>
      <div class="gauge-caption">
        Latest primary ${formatPercent(latestPrimary, 0)}, secondary ${formatPercent(latestSecondary, 0)}<br>
        Peak primary ${formatPercent(maxPrimary, 0)}, secondary ${formatPercent(maxSecondary, 0)} · ${formatNumber(samples)} samples · ${escapeHtml(label)}
      </div>
    </div>
  `;
}

function filteredThreads() {
  const query = state.threadFilter.trim().toLowerCase();
  return [...(rawUsage.threads || [])]
    .filter((thread) => {
      if (!query) return true;
      const haystack = `${thread.title || ""} ${thread.id || ""} ${thread.workspace || ""}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => numberValue(b.total) - numberValue(a.total));
}

function renderThreads() {
  const rows = filteredThreads().slice(0, 12);
  if (rows.length === 0) {
    els.threadTable.innerHTML = `<tr><td colspan="6">No matching threads for this filter.</td></tr>`;
    return;
  }

  els.threadTable.innerHTML = rows
    .map((thread) => {
      const title = state.hideTitles ? "Title hidden" : thread.title || "Untitled thread";
      return `
        <tr>
          <td>
            <span class="thread-title">${escapeHtml(title)}</span>
            <span class="thread-subtitle">${escapeHtml((thread.id || "unknown").slice(0, 13))} · ${escapeHtml(thread.workspace || "workspace")} · ${escapeHtml(thread.source || "primary")}</span>
          </td>
          <td>${formatNumber(thread.requests)}</td>
          <td>${formatNumber(thread.total)}</td>
          <td>${formatNumber(thread.input)}</td>
          <td>${formatNumber(thread.output)}</td>
          <td>${formatNumber(thread.cachedInput)}</td>
        </tr>
      `;
    })
    .join("");
}

function dateRangeSet(rows) {
  return new Set(rows.map((row) => row.date));
}

function localDateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderHeatmap(rows) {
  const rangeDates = dateRangeSet(rows);
  const heat = new Map();
  for (const sample of rawUsage.hourly || []) {
    if (sample.date && !rangeDates.has(sample.date)) continue;
    const key = `${sample.weekday}:${sample.hour}`;
    heat.set(key, (heat.get(key) || 0) + numberValue(sample.total));
  }
  const positiveValues = [...heat.values()].filter((value) => value > 0);
  const scaleMax = Math.max(1, percentile(positiveValues, 0.92), Math.max(...positiveValues, 1) * 0.18);

  const hourLabels = Array.from({ length: 24 }, (_, hour) => {
    const className = hour % 2 ? "hour-odd" : "";
    return `<div class="heatmap-hour ${className}">${hour % 2 === 0 ? String(hour).padStart(2, "0") : ""}</div>`;
  }).join("");

  const cells = weekdays
    .map((day, weekday) => {
      const row = Array.from({ length: 24 }, (_, hour) => {
        const value = heat.get(`${weekday}:${hour}`) || 0;
        const intensity = value > 0 ? Math.min(1, Math.sqrt(value / scaleMax)) : 0;
        const color = heatmapColor(intensity);
        const border = intensity > 0.72 ? "rgba(255, 255, 255, 0.18)" : "rgba(255, 255, 255, 0.08)";
        const shadow = intensity > 0.9 ? `0 0 14px ${rgba(color, 0.35)}` : "none";
        const className = hour % 2 ? "cell-odd" : "";
        return `<div class="heatmap-cell ${className}" title="${day} ${String(hour).padStart(2, "0")}:00 · ${formatNumber(value)} tokens" style="--heat-bg:${color};--heat-border:${border};--heat-shadow:${shadow}"></div>`;
      }).join("");
      return `<div class="heatmap-day">${day}</div>${row}`;
    })
    .join("");

  els.heatmap.innerHTML = `
    <div class="heatmap-grid">
      <div></div>
      ${hourLabels}
      ${cells}
    </div>
    <div class="heatmap-scale">
      <span>Low</span>
      <span class="heatmap-gradient"></span>
      <span>High</span>
    </div>
  `;
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

function heatmapColor(value) {
  if (value <= 0) return "#11191d";
  const stops = [
    [0, [17, 25, 29]],
    [0.24, [30, 68, 92]],
    [0.5, [83, 168, 112]],
    [0.74, [246, 210, 68]],
    [1, [255, 112, 95]]
  ];
  const upperIndex = stops.findIndex(([stop]) => value <= stop);
  const upper = stops[Math.max(1, upperIndex)];
  const lower = stops[stops.indexOf(upper) - 1];
  const local = (value - lower[0]) / (upper[0] - lower[0]);
  const rgb = upper[1].map((channel, index) => Math.round(lower[1][index] + (channel - lower[1][index]) * local));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function rgba(rgb, alpha) {
  const channels = rgb.match(/\d+/g) || ["0", "0", "0"];
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}

function computeInsights(rows) {
  const totals = totalsFromRows(rows);
  const topDay = rows.reduce((best, row) => (numberValue(row.total) > numberValue(best?.total) ? row : best), rows[0]);
  const topThread = [...(rawUsage.threads || [])].sort((a, b) => numberValue(b.total) - numberValue(a.total))[0];
  const rangeDates = dateRangeSet(rows);
  const topHour = [...(rawUsage.hourly || [])]
    .filter((sample) => !sample.date || rangeDates.has(sample.date))
    .sort((a, b) => numberValue(b.total) - numberValue(a.total))[0];
  const cacheRate = totals.input ? (totals.cachedInput / totals.input) * 100 : 0;
  const outputRate = totals.total ? (totals.output / totals.total) * 100 : 0;
  const requestAverage = totals.requests ? totals.total / totals.requests : 0;
  const quality = rawUsage.quality || {};
  const invalid = numberValue(quality.invalidJsonLines) + numberValue(quality.missingLastUsage) + numberValue(quality.missingTotalUsage);
  const topTitle = state.hideTitles ? "Title hidden" : topThread?.title || topThread?.id || "No thread";
  const topHourLabel = topHour
    ? `${weekdays[topHour.weekday] || "Day"} ${String(topHour.hour).padStart(2, "0")}:00`
    : "No hourly data";

  return [
    {
      marker: colors.lime,
      title: topDay ? `Peak day was ${formatDate(topDay.date)} with ${formatNumber(topDay.total)} tokens` : "No peak day yet",
      body: `${formatNumber(totals.total)} tokens in the selected range across ${formatNumber(totals.requests)} token-count events.`
    },
    {
      marker: colors.amber,
      title: `${formatPercent(cacheRate)} cached-input reuse`,
      body: `Cached input is a subset of input tokens. High reuse usually means repeated context is being reused effectively.`
    },
    {
      marker: colors.coral,
      title: `${formatPercent(outputRate)} of selected volume is output`,
      body: `Average event size is ${formatNumber(requestAverage)} tokens; reasoning output is ${formatNumber(totals.reasoningOutput)} tokens.`
    },
    {
      marker: colors.violet,
      title: `${escapeHtml(topTitle)} is the largest thread`,
      body: topThread
        ? `${formatNumber(topThread.total)} total tokens, ${formatNumber(topThread.requests)} events, last seen ${formatDateTime(topThread.lastSeen)}.`
        : "No thread totals were found."
    },
    {
      marker: colors.total,
      title: `${topHourLabel} is the hottest local hour`,
      body: topHour ? `${formatNumber(topHour.total)} tokens observed in this weekday/hour bucket.` : "No hourly samples were generated."
    },
    {
      marker: invalid ? colors.amber : colors.lime,
      title: invalid ? `${formatNumber(invalid)} parser caveats detected` : "No parser caveats in generated aggregates",
      body: invalid
        ? "Some records were skipped or were missing expected usage fields. See README for source limits."
        : "The generated dataset contains aggregate usage only, not transcript contents."
    }
  ];
}

function renderInsights(rows) {
  els.insightList.innerHTML = computeInsights(rows)
    .map(
      (item) => `
        <div class="insight-row">
          <span class="insight-marker" style="--marker:${item.marker}"></span>
          <div>
            <strong>${item.title}</strong>
            <span>${item.body}</span>
          </div>
        </div>
      `
    )
    .join("");
}

function renderMeta(rows) {
  const range = rows.length ? `${formatDate(rows[0].date)} - ${formatDate(rows[rows.length - 1].date)}` : "No usage range";
  const totals = totalsFromRows(rows);
  const quality = rawUsage.quality || {};
  els.sampleBanner.hidden = !isSample;
  els.rangeSummary.textContent = `${range} · ${formatNumber(totals.total)} tokens · ${formatNumber(totals.requests)} token-count events`;
  els.sourceLabel.textContent = isSample ? "Sample data" : "Local Codex data";
  els.updatedLabel.textContent = `Updated ${formatDateTime(rawUsage.generatedAt)}`;
  els.timezoneLabel.textContent = rawUsage.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Local timezone";
  els.environmentLabel.textContent = isSample ? "Sample" : "Local";
  els.datasetLabel.textContent = isSample ? "Sample" : "Generated";
  els.filesScanned.textContent = formatNumber(quality.filesScanned || 0);
  els.eventsScanned.textContent = formatNumber(quality.tokenEvents || 0);
  els.threadsScanned.textContent = formatNumber(quality.threadsWithUsage || 0);
  els.dataCaveat.textContent = "No raw transcripts";
}

function render() {
  const rows = dailyRowsForRange(state.rangeDays);
  renderMeta(rows);
  renderKpis(rows);
  renderLegend();
  renderLineChart(rows);
  renderComposition(rows);
  renderGauge();
  renderThreads();
  renderHeatmap(rows);
  renderInsights(rows);
  els.dailyChartCaption.textContent =
    state.rangeDays === "all"
      ? "Input, cached input, output, and total tokens across all parsed days."
      : `Input, cached input, output, and total tokens over the last ${state.rangeDays} days.`;
}

function wireEvents() {
  document.querySelectorAll(".range-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".range-button").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      state.rangeDays = button.dataset.days === "all" ? "all" : Number(button.dataset.days);
      render();
    });
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      document.querySelector(`#${button.dataset.target}`)?.scrollIntoView({ block: "start" });
    });
  });

  els.threadFilter.addEventListener("input", (event) => {
    state.threadFilter = event.target.value;
    renderThreads();
  });

  els.privacyToggle.addEventListener("click", () => {
    state.hideTitles = !state.hideTitles;
    els.privacyToggle.setAttribute("aria-pressed", String(state.hideTitles));
    els.privacyToggle.querySelector("span").textContent = state.hideTitles ? "Show titles" : "Hide titles";
    renderThreads();
    renderInsights(dailyRowsForRange(state.rangeDays));
  });
}

wireEvents();
render();
