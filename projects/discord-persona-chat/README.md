# Discord Persona Chat

Upload Discord message exports and chat with a personalized bot built from the writing style in that data.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `OPENAI_API_KEY` in `.env.local` for OpenAI mode. For local mode, run Ollama and set `OLLAMA_BASE_URL` plus `OLLAMA_MODEL`. The DGX Spark deployment defaults to `gpt-oss:120b`.

## First Version

- Parses Discord `.zip`, `.json`, `.csv`, and `.txt` exports in the browser.
- Builds a compact persona profile from message frequency, tone, topics, and representative samples.
- Sends only the derived profile and active chat turns to the server-side OpenAI route.
- Uses OpenAI mode or a local Ollama provider for open-source models.
- Exports JSONL examples from the uploaded messages for a future supervised fine-tuning workflow.

## Privacy Notes

Use data you own or have permission to process. Uploaded files are parsed in the browser in this version; the server receives the derived persona profile for chat generation.
