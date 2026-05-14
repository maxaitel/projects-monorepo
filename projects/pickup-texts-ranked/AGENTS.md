<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Defaults

- This app lives inside the `small-projects-monorepo` public GitHub monorepo, which contains many small projects under `projects/`.
- Assume the default production stack is Next.js, hosted Supabase for realtime/database/auth, and Vercel for hosting unless the user explicitly chooses otherwise.
- When the target is Vercel production, use hosted Supabase early instead of starting with local Docker.
- Treat `main` as the production branch. When a feature is finished and verified, merge and push it to `main` because that is the actual prod branch.
- If `main` is empty or close to empty, build directly on `main` or merge fast instead of over-managing branches.
