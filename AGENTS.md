# Small Projects Monorepo

This repository is `projects-monorepo`, a public GitHub monorepo for many projects and experiments.

## Repository Defaults

- Treat this as a monorepo: projects should live under `projects/<project-name>/` unless there is a strong reason to use another layout.
- Assume the default production stack for web apps is Next.js, hosted Supabase for realtime/database/auth, and Vercel for hosting unless the user explicitly chooses otherwise.
- Default frontend implementation should be super minimal and working. Build the usable product surface first, avoid heavy visual polish, and assume a later AI model may come in specifically to redo the frontend and make it look nice.
- When the target is Vercel production, use hosted Supabase early instead of starting with local Docker.
- Prefer Go for simple CLI tools, Python for data-related stuff/potential large-scale projects, but use your judgement to choose the true best language for a project.
- Treat `main` as the production branch. When the user says to push to `main`, that means ship it to production: merge or commit to `main`, push `main` to GitHub, and deploy the affected Vercel project to production.
- If `main` is empty or close to empty, build directly on `main` or merge fast instead of over-managing branches.
- Additional approved harness notes live in `docs/ai/harness-notes.md`.

## Truth In Packaging

When creating, modifying, or publishing a project, make sure the repo accurately represents what it is, what it contains, and what a new user can expect.

Before committing or pushing:

- Do not let the README, repo name, UI text, comments, or examples imply more than the project actually does.
- Clearly distinguish prototype, demo, sample, experiment, production-ready tool, and complete implementation.
- If something is partial, sampled, mocked, inferred, cached, generated, or externally hosted, say so plainly.
- If a command works only because local files, credentials, services, GPUs, caches, or generated outputs already exist, document that dependency.
- Prefer reproducible scripts over hidden local state.
- Add setup, regeneration, and verification commands for any important generated artifact.
- Use safe defaults. Expensive, destructive, private, large, or irreversible actions must require explicit opt-in flags.
- Do not commit bulky/generated/private artifacts unless there is a clear reason and the README explains them.
- Keep `.gitignore` aligned with the project's claims.
- If publishing publicly, assume a stranger will clone the repo with no context and check whether the README would mislead them.

A useful final check:

> "If someone clones this fresh, what will work, what will not, and what did we leave out?"

Answer that in the repo before pushing.
