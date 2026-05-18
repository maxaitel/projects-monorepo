import { describe, expect, it } from "vitest";

import {
  articles,
  getArticleBySlug,
  getArticlesBySection,
  getFeaturedArticle,
  getLatestArticles,
  siteConfig,
} from "@/lib/content";

describe("site content contract", () => {
  it("identifies UCGREENBISON.nz as an unofficial satire publication", () => {
    expect(siteConfig.name).toBe("UC GREEN BISON");
    expect(siteConfig.domain).toBe("UCGREENBISON.nz");
    expect(siteConfig.description.toLowerCase()).toContain("unofficial");
    expect(siteConfig.description.toLowerCase()).toContain("satire");
  });

  it("has one featured lead story", () => {
    const leadStories = articles.filter((article) => article.isFeatured);

    expect(leadStories).toHaveLength(1);
    expect(getFeaturedArticle()).toEqual(leadStories[0]);
  });

  it("filters articles by section", () => {
    const campusArticles = getArticlesBySection("Campus");

    expect(campusArticles.length).toBeGreaterThan(0);
    expect(campusArticles.every((article) => article.section === "Campus")).toBe(
      true
    );
  });

  it("sorts latest articles newest first", () => {
    const latest = getLatestArticles();

    expect(latest.map((article) => article.publishedAt)).toEqual(
      [...latest]
        .map((article) => article.publishedAt)
        .sort()
        .reverse()
    );
  });

  it("looks up articles by slug", () => {
    const article = articles[0];

    expect(getArticleBySlug(article.slug)).toEqual(article);
    expect(getArticleBySlug("missing-story")).toBeUndefined();
  });
});
