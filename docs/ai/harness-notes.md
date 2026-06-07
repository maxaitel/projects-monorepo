# Harness Notes

Use this file only for approved, project-specific Codex harness notes when no more specific doc, skill, checklist, or `AGENTS.md` entry is a better fit.

Keep notes short, actionable, and grounded in a lesson from recent work. Prefer editing or removing stale notes over appending duplicates.

## Approved Notes

- For visible Android app QA, avoid `Codex_QA_API35`; it uses a `google_atd` system image and can show a black emulator window/screenshot even when the UI tree says the app is focused. Use `Frigate_API_35` or `Remodex_QA_API35` with `-gpu host` for user-visible testing, and reserve `Codex_QA_API35` for headless UI-tree checks.
