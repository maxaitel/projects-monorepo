import Link from "next/link";

import { BisonPhoto } from "@/components/bison-photo";
import { Badge } from "@/components/ui/badge";
import {
  formatArticleDate,
  getFeaturedArticle,
  getLatestArticles,
  sections,
  siteConfig,
} from "@/lib/content";

const EDITION_NUMBER = "Vol. I · No. 7";
const WEATHER = "Christchurch · 12°C · easterly · mildly judgmental";

function sectionAnchor(section: string) {
  return section.toLowerCase().replaceAll(" ", "-");
}

export default function Home() {
  const featuredArticle = getFeaturedArticle();
  const all = getLatestArticles();
  const latestArticles = all.filter(
    (article) => article.slug !== featuredArticle?.slug,
  );
  const tickerHeadlines = all.slice(0, 6).map((a) => a.title);
  const subLeads = latestArticles.slice(0, 2);
  const restByDate = latestArticles.slice(2);

  return (
    <main className="flex min-h-screen flex-col">
      {/* Utility bar */}
      <div className="border-b border-foreground/20 bg-foreground text-background">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] sm:px-6 lg:px-8">
          <span>{EDITION_NUMBER}</span>
          <span className="hidden sm:inline">{WEATHER}</span>
          <span className="hidden md:inline">Established the week we noticed</span>
          <span>{siteConfig.domain}</span>
        </div>
      </div>

      {/* Masthead */}
      <header className="border-b-4 border-foreground">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4 pb-3 pt-6 sm:pt-8">
            <div className="hidden flex-col gap-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground sm:flex">
              <span>Monday Edition</span>
              <span>Pacific / Auckland</span>
              <span>One Dollar (or thereabouts)</span>
            </div>
            <div className="flex flex-col items-center gap-3 text-center">
              <BisonPhoto variant="crest" className="h-16 w-16 sm:h-20 sm:w-20" />
              <h1 className="font-display text-4xl font-black leading-[0.92] tracking-tight text-foreground sm:text-6xl md:text-7xl lg:text-[5.5rem]">
                {siteConfig.name}
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-muted-foreground sm:text-xs">
                The unofficial broadsheet of Ilam, Riccarton & Adjacent Disasters
              </p>
            </div>
            <div className="hidden items-center justify-end sm:flex">
              <span className="stamp px-3 py-1 text-[10px] sm:text-xs">
                Satire / Not News
              </span>
            </div>
          </div>

          {/* Section nav */}
          <nav
            aria-label="Sections"
            className="flex items-center justify-between gap-4 border-t border-foreground/30 py-2"
          >
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.22em]">
              {sections.map((section) => (
                <li key={section}>
                  <a
                    href={`#${sectionAnchor(section)}`}
                    className="text-foreground/80 transition-colors hover:text-primary"
                  >
                    {section}
                  </a>
                </li>
              ))}
            </ul>
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground md:inline">
              Filed from the Central Library carpet
            </span>
          </nav>
        </div>
      </header>

      {/* Breaking ticker */}
      <div className="border-b border-foreground/30 bg-primary text-primary-foreground">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 overflow-hidden px-4 py-2 sm:px-6 lg:px-8">
          <span className="shrink-0 rounded-sm bg-background px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
            Breaking-ish
          </span>
          <div className="relative flex w-full overflow-hidden">
            <div className="marquee-track font-mono text-xs uppercase tracking-[0.18em]">
              {[...tickerHeadlines, ...tickerHeadlines].map((headline, index) => (
                <span
                  key={`${headline}-${index}`}
                  className="inline-flex items-center gap-3 whitespace-nowrap"
                >
                  <span aria-hidden className="opacity-70">◆</span>
                  {headline}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Front page */}
      <section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 border-b border-foreground/20 py-8 lg:grid-cols-[2.2fr_1fr] lg:gap-10 lg:py-12">
          {featuredArticle ? (
            <article className="relative flex flex-col gap-5">
              <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                <span className="rounded-sm bg-foreground px-2 py-0.5 text-background">
                  Lead
                </span>
                <span>{featuredArticle.section}</span>
                <span aria-hidden>·</span>
                <span>{formatArticleDate(featuredArticle.publishedAt)}</span>
              </div>
              <h2 className="font-display text-4xl font-black leading-[0.95] tracking-tight sm:text-6xl md:text-[4.2rem]">
                <Link
                  href={`/articles/${featuredArticle.slug}`}
                  className="hover:text-primary"
                >
                  {featuredArticle.title}
                </Link>
              </h2>
              <p className="font-news max-w-2xl text-lg leading-8 text-foreground/80 sm:text-xl">
                {featuredArticle.dek}
              </p>

              {/* Hero photo — real bison, duotone-printed in bison green ink. */}
              <div className="relative">
                <BisonPhoto priority />
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  Above: a bison, looking exactly as accountable as the
                  beanbags claim to be. Photo: USDA / Jack Dykinga, public domain.
                </p>
              </div>

              <p className="font-news drop-cap text-[17px] leading-[1.75] text-foreground sm:columns-2 sm:gap-10 sm:text-[17px]">
                {featuredArticle.body[0]}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/20 pt-4 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                <span>By {featuredArticle.author}</span>
                <span>{featuredArticle.readingTime} · filed without permission</span>
                <Link
                  href={`/articles/${featuredArticle.slug}`}
                  className="text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  Read the whole thing →
                </Link>
              </div>
            </article>
          ) : null}

          {/* Right rail: editor's note + sub-leads */}
          <aside className="flex flex-col gap-6 lg:border-l lg:border-foreground/20 lg:pl-8">
            <div className="relative border border-dashed border-foreground/40 p-4">
              <span className="absolute -top-2 left-3 bg-background px-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                Editor&apos;s note
              </span>
              <p className="font-news text-sm leading-7 text-foreground/85">
                {siteConfig.disclaimer}
              </p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                — the herd
              </p>
            </div>

            <div className="flex flex-col gap-5">
              {subLeads.map((article, index) => (
                <article
                  key={article.slug}
                  className="flex flex-col gap-2 border-t border-foreground/20 pt-5 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    <span className="font-bold text-foreground">
                      {String(index + 2).padStart(2, "0")}
                    </span>
                    <span>{article.section}</span>
                  </div>
                  <h3 className="font-display text-2xl font-bold leading-tight">
                    <Link
                      href={`/articles/${article.slug}`}
                      className="hover:text-primary"
                    >
                      {article.title}
                    </Link>
                  </h3>
                  <p className="font-news text-[15px] leading-7 text-foreground/75">
                    {article.dek}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    {article.author} · {article.readingTime}
                  </p>
                </article>
              ))}
            </div>
          </aside>
        </div>

        {/* Second front: 3-column river */}
        {restByDate.length > 0 ? (
          <div className="border-b border-foreground/20 py-10">
            <div className="mb-6 flex items-baseline justify-between gap-4">
              <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
                Page Two
              </h2>
              <span className="ink-rule h-px flex-1" />
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Continued from somewhere
              </span>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {restByDate.slice(0, 3).map((article) => (
                <article
                  key={article.slug}
                  className="flex flex-col gap-3 border-t-2 border-foreground/80 pt-4"
                >
                  <Badge
                    variant="outline"
                    className="w-fit border-foreground/40 font-mono text-[10px] uppercase tracking-[0.22em]"
                  >
                    {article.section}
                  </Badge>
                  <h3 className="font-display text-xl font-bold leading-snug">
                    <Link
                      href={`/articles/${article.slug}`}
                      className="hover:text-primary"
                    >
                      {article.title}
                    </Link>
                  </h3>
                  <p className="font-news text-[15px] leading-7 text-foreground/75">
                    {article.dek}
                  </p>
                  <div className="mt-auto flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    <span>{article.author}</span>
                    <span>{article.readingTime}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {/* Sections */}
        <div className="flex flex-col gap-14 py-12">
          {sections.map((section, idx) => {
            const items = latestArticles.filter((a) => a.section === section);
            if (items.length === 0) return null;

            return (
              <section
                key={section}
                id={sectionAnchor(section)}
                className="scroll-mt-24"
              >
                <div className="mb-6 flex items-baseline gap-4 border-b-2 border-foreground pb-3">
                  <span className="font-mono text-3xl font-black text-primary">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <h2 className="font-display text-3xl font-black uppercase tracking-tight sm:text-4xl">
                    {section}
                  </h2>
                  <span className="ink-rule hidden h-px flex-1 sm:block" />
                  <span className="hidden font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground sm:inline">
                    {items.length} {items.length === 1 ? "story" : "stories"}
                  </span>
                </div>
                <div className="grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
                  {items.map((article, i) => (
                    <article
                      key={article.slug}
                      className={`flex flex-col gap-2 ${i === 0 ? "md:col-span-2 lg:col-span-1" : ""}`}
                    >
                      <h3
                        className={`font-display font-bold leading-tight ${i === 0 ? "text-2xl" : "text-xl"}`}
                      >
                        <Link
                          href={`/articles/${article.slug}`}
                          className="hover:text-primary"
                        >
                          {article.title}
                        </Link>
                      </h3>
                      <p className="font-news text-[15px] leading-7 text-foreground/75">
                        {article.dek}
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        {article.author} · {formatArticleDate(article.publishedAt)} · {article.readingTime}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t-4 border-foreground bg-foreground text-background">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          <div className="flex flex-col gap-3">
            <BisonPhoto variant="crest" className="h-14 w-14 border-background/40" />
            <p className="font-display text-2xl font-black leading-none">
              {siteConfig.name}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-background/60">
              {siteConfig.domain}
            </p>
          </div>
          <div>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-background/60">
              Desks
            </h3>
            <ul className="flex flex-col gap-1 font-news text-sm">
              {sections.map((section) => (
                <li key={section}>
                  <a
                    href={`#${sectionAnchor(section)}`}
                    className="text-background/90 hover:text-accent"
                  >
                    {section}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-background/60">
              Submissions
            </h3>
            <p className="font-news text-sm leading-6 text-background/85">
              Slide your hot take under the door of any tutorial room. We&apos;ll
              find it eventually. Pseudonyms encouraged, references required.
            </p>
          </div>
          <div>
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-background/60">
              Disclaimer
            </h3>
            <p className="font-news text-sm leading-6 text-background/85">
              {siteConfig.disclaimer}
            </p>
          </div>
        </div>
        <div className="border-t border-background/20">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.24em] text-background/60 sm:flex-row sm:px-6 lg:px-8">
            <span>© The Herd · All bison wrongs reserved</span>
            <span>Printed with electrons on recycled doubt</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
