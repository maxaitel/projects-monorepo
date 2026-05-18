# UC GREEN BISON

UCGREENBISON.nz is a minimal Next.js prototype for an unofficial satire news site about University of Canterbury student life.

This project is not affiliated with, endorsed by, or speaking for the University of Canterbury. The current article copy is sample satirical content stored in the repo, not reported news.

## Current Status

- Static Next.js App Router site with a homepage and generated article pages.
- Simple shadcn/ui primitives are installed and used for cards, badges, buttons, and separators.
- No CMS, database, authentication, comments, submissions, analytics, domain registration, or Vercel project is configured yet.
- Frontend styling is intentionally plain so a later model or designer can replace it without untangling a heavy visual system.

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

No environment variables are required for the current static prototype.

## Assets

- `public/bison.jpg` — "American bison" by Jack Dykinga / USDA Agricultural Research Service, public domain. Sourced from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:American_bison_k5680-1.jpg) and resized to 1800px wide for web delivery. See `public/bison.credit.txt`.

The site stylises this single source photo (duotone + halftone) in `src/components/bison-photo.tsx` for both the masthead crest and the hero image.

## Content

Articles and site metadata live in `src/lib/content.ts`.

To add or edit sample stories:

1. Update the `articles` array.
2. Keep slugs unique.
3. Run the verification commands below.

## Verification

```bash
npm run test
npm run lint
npm run build
```

The tests cover the content contract and a homepage smoke render. They do not verify editorial quality, legal review, deployment, or a production content workflow.

## Deployment Notes

The app is compatible with Vercel as a standard Next.js project, but this repository does not currently include Vercel project configuration or DNS setup for `UCGREENBISON.nz`.
