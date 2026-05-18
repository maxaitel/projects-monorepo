import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BisonPhoto } from "@/components/bison-photo";
import {
  articles,
  formatArticleDate,
  getArticleBySlug,
  getLatestArticles,
  siteConfig,
} from "@/lib/content";

type ArticlePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return articles.map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const article = getArticleBySlug((await params).slug);

  if (!article) {
    return {
      title: "Story not found",
    };
  }

  return {
    title: article.title,
    description: article.dek,
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const article = getArticleBySlug((await params).slug);

  if (!article) {
    notFound();
  }

  const related = getLatestArticles()
    .filter((a) => a.slug !== article.slug)
    .slice(0, 3);

  const pullQuoteSource =
    article.body.length > 1 ? article.body[1] : article.body[0];
  const pullQuote =
    pullQuoteSource.length > 180
      ? pullQuoteSource.slice(0, 180).replace(/[\s,.;:]+$/, "") + "…"
      : pullQuoteSource;

  return (
    <main className="flex min-h-screen flex-col">
      {/* Top bar */}
      <div className="border-b-4 border-foreground">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-3 text-foreground hover:text-primary"
          >
            <BisonPhoto variant="crest" className="h-9 w-9" />
            <span className="font-display text-xl font-black leading-none">
              {siteConfig.name}
            </span>
          </Link>
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
          >
            ← Back to the front page
          </Link>
        </div>
      </div>

      <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Article header */}
        <header className="flex flex-col gap-5 border-b border-foreground/20 pb-8">
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            <span className="rounded-sm bg-foreground px-2 py-0.5 text-background">
              {article.section}
            </span>
            <time dateTime={article.publishedAt}>
              {formatArticleDate(article.publishedAt)}
            </time>
            <span aria-hidden>·</span>
            <span>{article.readingTime}</span>
          </div>

          <h1 className="font-display text-4xl font-black leading-[0.98] tracking-tight sm:text-6xl">
            {article.title}
          </h1>

          <p className="font-news text-xl leading-9 text-foreground/80">
            {article.dek}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            <span>
              By <span className="text-foreground">{article.author}</span>
            </span>
            <span>Filed without supervision</span>
          </div>
        </header>

        {/* Body */}
        <div className="flex flex-col gap-7 pt-8 font-news text-[18px] leading-[1.85] text-foreground">
          {article.body.map((paragraph, index) => (
            <p
              key={paragraph}
              className={index === 0 ? "drop-cap" : undefined}
            >
              {paragraph}
            </p>
          ))}
        </div>

        {/* Pull quote */}
        <figure className="my-10 border-y-2 border-foreground py-8 text-center">
          <blockquote className="font-display text-2xl font-bold italic leading-snug text-foreground sm:text-3xl">
            “{pullQuote}”
          </blockquote>
          <figcaption className="mt-4 font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            — pulled from the middle of the article, like a real newspaper
          </figcaption>
        </figure>

        {/* Stamp + disclaimer */}
        <div className="mt-4 flex flex-col items-start gap-4 border-t border-foreground/20 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="stamp px-3 py-1 text-xs">Satire · Not News</span>
          <p className="font-news text-sm leading-6 text-muted-foreground sm:max-w-md sm:text-right">
            {siteConfig.disclaimer}
          </p>
        </div>
      </article>

      {/* Related */}
      {related.length > 0 ? (
        <section className="border-t border-foreground/20">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-baseline gap-4 border-b-2 border-foreground pb-3">
              <span className="font-mono text-2xl font-black text-primary">
                ¶
              </span>
              <h2 className="font-display text-2xl font-black uppercase tracking-tight sm:text-3xl">
                Also in the herd
              </h2>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {related.map((r) => (
                <article key={r.slug} className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    {r.section}
                  </span>
                  <h3 className="font-display text-xl font-bold leading-snug">
                    <Link
                      href={`/articles/${r.slug}`}
                      className="hover:text-primary"
                    >
                      {r.title}
                    </Link>
                  </h3>
                  <p className="font-news text-[15px] leading-7 text-foreground/75">
                    {r.dek}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <footer className="mt-auto border-t-4 border-foreground bg-foreground text-background">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-4 py-4 font-mono text-[10px] uppercase tracking-[0.24em] text-background/70 sm:flex-row sm:px-6 lg:px-8">
          <span>© The Herd · {siteConfig.domain}</span>
          <Link href="/" className="hover:text-accent">
            Return to the front page
          </Link>
        </div>
      </footer>
    </main>
  );
}
