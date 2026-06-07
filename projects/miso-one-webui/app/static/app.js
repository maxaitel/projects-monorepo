const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");
const loadModel = document.querySelector("#loadModel");
const message = document.querySelector("#message");
const latest = document.querySelector("#latest");
const historyList = document.querySelector("#historyList");
const resultTemplate = document.querySelector("#resultTemplate");
const turns = document.querySelector("#turns");
const cloneForm = document.querySelector("#cloneForm");
const referenceAudioInput = cloneForm.querySelector('input[name="reference_audio"]');
const preparedReferenceAudio = document.querySelector("#preparedReferenceAudio");
const prepareYoutube = document.querySelector("#prepareYoutube");
const youtubeUrl = document.querySelector("#youtubeUrl");
const youtubeStart = document.querySelector("#youtubeStart");
const youtubeDuration = document.querySelector("#youtubeDuration");
const youtubeStatus = document.querySelector("#youtubeStatus");
const youtubeClip = document.querySelector("#youtubeClip");
const referenceTranscript = cloneForm.querySelector('textarea[name="reference_text"]');
const transcribeReference = document.querySelector("#transcribeReference");
const transcriptStatus = document.querySelector("#transcriptStatus");

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
    throw new Error(formatError(data.detail) || `Request failed: ${response.status}`);
  }
  return data;
}

function formatError(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const location = Array.isArray(item.loc) ? item.loc.join(".") : "";
        return [location, item.msg].filter(Boolean).join(": ");
      })
      .join("; ");
  }
  return JSON.stringify(detail);
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

function clearPreparedReference() {
  preparedReferenceAudio.value = "";
  youtubeStatus.textContent = "";
  youtubeClip.hidden = true;
  youtubeClip.querySelector("audio").removeAttribute("src");
  const download = youtubeClip.querySelector(".download");
  download.removeAttribute("href");
  download.removeAttribute("download");
}

function clearReferenceTranscript() {
  referenceTranscript.value = "";
  transcriptStatus.textContent = "";
}

async function transcribeCurrentReference() {
  const transcriptData = new FormData();
  if (preparedReferenceAudio.value) {
    transcriptData.set("prepared_reference_audio", preparedReferenceAudio.value);
  } else if (referenceAudioInput.files.length > 0) {
    transcriptData.set("reference_audio", referenceAudioInput.files[0]);
  } else {
    setMessage("Upload reference audio or load a YouTube clip before transcribing.", true);
    return null;
  }

  transcribeReference.disabled = true;
  transcriptStatus.textContent = "Transcribing...";
  setMessage("Transcribing reference audio...");
  try {
    const result = await fetchJson("/api/transcribe-reference", {
      method: "POST",
      body: transcriptData,
    });
    referenceTranscript.value = result.text;
    transcriptStatus.textContent = `${result.duration_seconds}s via ${result.model_source}`;
    setMessage("Reference transcript filled.");
    return result;
  } catch (error) {
    transcriptStatus.textContent = "Transcription failed";
    setMessage(error.message, true);
    return null;
  } finally {
    transcribeReference.disabled = false;
  }
}

async function prepareYoutubeClip() {
  const clipData = new FormData();
  clipData.set("youtube_url", youtubeUrl.value);
  clipData.set("start_seconds", youtubeStart.value || "0");
  clipData.set("duration_seconds", youtubeDuration.value || "10");

  prepareYoutube.disabled = true;
  youtubeStatus.textContent = "Loading...";
  setMessage("Preparing YouTube reference clip...");
  try {
    const clip = await fetchJson("/api/youtube-reference", {
      method: "POST",
      body: clipData,
    });
    referenceAudioInput.value = "";
    clearReferenceTranscript();
    preparedReferenceAudio.value = clip.id;
    youtubeClip.hidden = false;
    youtubeClip.querySelector("audio").src = clip.audio_url;
    const download = youtubeClip.querySelector(".download");
    download.href = clip.audio_url;
    download.download = clip.filename;
    youtubeStatus.textContent = `${clip.duration_seconds}s clip ready`;
    setMessage("YouTube reference clip ready. Transcribing...");
    await transcribeCurrentReference();
  } catch (error) {
    clearPreparedReference();
    setMessage(error.message, true);
  } finally {
    prepareYoutube.disabled = false;
  }
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

prepareYoutube.addEventListener("click", () => {
  prepareYoutubeClip().catch((error) => setMessage(error.message, true));
});

transcribeReference.addEventListener("click", () => {
  transcribeCurrentReference().catch((error) => setMessage(error.message, true));
});

referenceAudioInput.addEventListener("change", () => {
  if (referenceAudioInput.files.length > 0) {
    clearPreparedReference();
    clearReferenceTranscript();
    transcribeCurrentReference().catch((error) => setMessage(error.message, true));
  }
});

for (const input of [youtubeUrl, youtubeStart, youtubeDuration]) {
  input.addEventListener("input", () => {
    if (preparedReferenceAudio.value) {
      clearPreparedReference();
      clearReferenceTranscript();
    }
  });
}

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
    if (id === "cloneForm") {
      const hasUploadedReference = referenceAudioInput.files.length > 0;
      const hasPreparedReference = Boolean(preparedReferenceAudio.value);
      if (!hasUploadedReference && !hasPreparedReference) {
        setMessage("Upload reference audio or load a YouTube clip before generating a clone.", true);
        return;
      }
    }

    const formData = new FormData(form);
    setBusy(form, true);
    setMessage("Generating...");
    try {
      const record = await fetchJson("/api/generate", {
        method: "POST",
        body: formData,
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
