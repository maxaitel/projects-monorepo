const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");
const loadModel = document.querySelector("#loadModel");
const message = document.querySelector("#message");
const latest = document.querySelector("#latest");
const historyList = document.querySelector("#historyList");
const resultTemplate = document.querySelector("#resultTemplate");
const turns = document.querySelector("#turns");

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
}

function setBusy(form, busy) {
  form.querySelectorAll("button, input, textarea").forEach((el) => {
    el.disabled = busy;
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || `Request failed: ${response.status}`);
  }
  return data;
}

async function refreshStatus() {
  try {
    const status = await fetchJson("/api/status");
    statusDot.className = status.loaded ? "dot loaded" : "dot";
    statusText.textContent = status.loaded
      ? `${status.device} / ${status.dtype} / ${status.sample_rate} Hz`
      : "Model not loaded";
  } catch (error) {
    statusDot.className = "dot error";
    statusText.textContent = error.message;
  }
}

function renderResult(record, target) {
  const node = resultTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".mode").textContent = record.mode;
  node.querySelector(".meta").textContent =
    `${record.duration_seconds}s audio, ${Math.round(record.generation_ms / 1000)}s generation`;
  node.querySelector(".text").textContent = record.text;
  node.querySelector("audio").src = record.audio_url;
  const download = node.querySelector(".download");
  download.href = record.audio_url;
  download.download = record.filename;
  target.prepend(node);
}

async function refreshHistory() {
  const records = await fetchJson("/api/history");
  historyList.innerHTML = "";
  records.reverse().forEach((record) => renderResult(record, historyList));
}

loadModel.addEventListener("click", async () => {
  loadModel.disabled = true;
  statusText.textContent = "Loading model...";
  try {
    await fetchJson("/api/load", { method: "POST" });
    await refreshStatus();
  } catch (error) {
    statusDot.className = "dot error";
    statusText.textContent = error.message;
  } finally {
    loadModel.disabled = false;
  }
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.tab}`).classList.add("active");
    if (tab.dataset.tab === "history") refreshHistory().catch((error) => setMessage(error.message, true));
  });
});

for (const id of ["singleForm", "cloneForm"]) {
  const form = document.querySelector(`#${id}`);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setBusy(form, true);
    setMessage("Generating...");
    try {
      const record = await fetchJson("/api/generate", {
        method: "POST",
        body: new FormData(form),
      });
      latest.innerHTML = "";
      renderResult(record, latest);
      setMessage("Generated.");
      await refreshStatus();
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      setBusy(form, false);
    }
  });
}

function addTurn(speaker = 0, text = "") {
  const row = document.createElement("div");
  row.className = "turn";
  row.innerHTML = `
    <label>Speaker <input class="turn-speaker" type="number" min="0" max="99" value="${speaker}" /></label>
    <label>Text <textarea class="turn-text" rows="2" required>${text}</textarea></label>
    <button type="button">Remove</button>
  `;
  row.querySelector("button").addEventListener("click", () => row.remove());
  turns.appendChild(row);
}

document.querySelector("#addTurn").addEventListener("click", () => addTurn());

document.querySelector("#dialogueForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setBusy(form, true);
  setMessage("Generating dialogue...");
  try {
    const payload = {
      max_audio_length_ms: Number(form.max_audio_length_ms.value),
      temperature: Number(form.temperature.value),
      topk: Number(form.topk.value),
      turns: [...turns.querySelectorAll(".turn")].map((turn) => ({
        speaker: Number(turn.querySelector(".turn-speaker").value),
        text: turn.querySelector(".turn-text").value,
      })),
    };
    const record = await fetchJson("/api/conversation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    latest.innerHTML = "";
    renderResult(record, latest);
    setMessage("Generated dialogue.");
    await refreshStatus();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    setBusy(form, false);
  }
});

document.querySelector("#refreshHistory").addEventListener("click", () => {
  refreshHistory().catch((error) => setMessage(error.message, true));
});

addTurn(0, "I'm just honestly not that into him, you know?");
addTurn(1, "Yeah, I get it.");
refreshStatus();
