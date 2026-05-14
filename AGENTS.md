# Small Projects Monorepo

This repository is `small-projects-monorepo`, a public GitHub monorepo for many projects and experiments.

## Repository Defaults

- Treat this as a monorepo: projects should live under `projects/<project-name>/` unless there is a strong reason to use another layout.
- Assume the default production stack for web apps is Next.js, hosted Supabase for realtime/database/auth, and Vercel for hosting unless the user explicitly chooses otherwise.
- When the target is Vercel production, use hosted Supabase early instead of starting with local Docker.
- Treat `main` as the production branch. When the user says to push to `main`, that means ship it to production: merge or commit to `main`, push `main` to GitHub, and deploy the affected Vercel project to production.
- If `main` is empty or close to empty, build directly on `main` or merge fast instead of over-managing branches.
