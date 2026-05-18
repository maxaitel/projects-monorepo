export type ArticleSection =
  | "Campus"
  | "Student Life"
  | "Sport"
  | "Opinion"
  | "Corrections";

export type Article = {
  slug: string;
  title: string;
  dek: string;
  section: ArticleSection;
  author: string;
  publishedAt: string;
  readingTime: string;
  isFeatured?: boolean;
  body: string[];
};

export const siteConfig = {
  name: "UC GREEN BISON",
  domain: "UCGREENBISON.nz",
  description:
    "An unofficial satire news site about University of Canterbury student life, campus rituals, and the small dramas that somehow become everyone else's business.",
  disclaimer:
    "Unofficial satire. Not affiliated with, endorsed by, or speaking for the University of Canterbury.",
};

export const sections: ArticleSection[] = [
  "Campus",
  "Student Life",
  "Sport",
  "Opinion",
  "Corrections",
];

export const articles: Article[] = [
  {
    slug: "central-library-beanbags-announce-collective-bargaining",
    title: "Central Library Beanbags Announce Collective Bargaining",
    dek: "The soft seating bloc says it has carried group assignments, midterm naps, and at least three existential crises without representation.",
    section: "Campus",
    author: "M. Ledger",
    publishedAt: "2026-05-18",
    readingTime: "3 min",
    isFeatured: true,
    body: [
      "Central Library's most disputed study furniture has issued a statement requesting better rotation, clearer nap limits, and an end to being described as available when already occupied by a backpack.",
      "The beanbags insist the action is peaceful, though witnesses report one first-year was gently absorbed after attempting to reserve a seat with a single highlighter.",
      "A spokesperson for absolutely no official department said the matter would be considered after exams, which the beanbags described as exactly the sort of delay tactic they had expected.",
    ],
  },
  {
    slug: "course-outline-gains-sentience-week-three",
    title: "Course Outline Gains Sentience In Week Three",
    dek: "Students were notified by email, Moodle, and a footnote that only appears when the printer is low on toner.",
    section: "Campus",
    author: "Priya Notes",
    publishedAt: "2026-05-17",
    readingTime: "2 min",
    body: [
      "A 42-page course outline has reportedly become self-aware after absorbing enough amendment notices to develop a survival instinct.",
      "The document now prefers to be addressed as 'the living assessment schedule' and has asked students to stop saying they will read it later.",
    ],
  },
  {
    slug: "flat-meeting-declared-historic-after-dish-soap-purchase",
    title: "Flat Meeting Declared Historic After Someone Bought Dish Soap",
    dek: "Sources close to the sink described the moment as a turning point in domestic governance.",
    section: "Student Life",
    author: "Sam Receipts",
    publishedAt: "2026-05-16",
    readingTime: "2 min",
    body: [
      "A Riccarton flat has entered a new era of accountability after a meeting that began with accusations and ended with a shared spreadsheet.",
      "The dishwasher remains theoretical, but morale briefly improved when someone used the phrase 'rotating roster' without laughing.",
    ],
  },
  {
    slug: "ucsa-couch-knows-too-much",
    title: "Opinion: The UCSA Couch Knows Too Much",
    dek: "It has heard the group chat debrief, the assignment panic, and your confident plan to start studying tomorrow.",
    section: "Opinion",
    author: "The Editorial Herd",
    publishedAt: "2026-05-15",
    readingTime: "4 min",
    body: [
      "There are institutions, and then there is the couch that has silently hosted every possible version of 'quick coffee before class.'",
      "We are not saying it judges. We are saying it has context, and context changes everything.",
    ],
  },
  {
    slug: "engineering-students-find-shortcut-still-uphill",
    title: "Engineering Students Find Shortcut That Is Somehow Still Uphill",
    dek: "The route saves four minutes and costs one full personality trait.",
    section: "Campus",
    author: "Alex Gradient",
    publishedAt: "2026-05-14",
    readingTime: "2 min",
    body: [
      "A group of students has mapped a faster path across campus, confirming that all roads eventually become a hill if you are carrying a laptop and regret.",
      "The shortcut has been added to three group chats and one extremely confident hand-drawn map.",
    ],
  },
  {
    slug: "social-netball-team-appeals-vibes-based-scorekeeping",
    title: "Social Netball Team Appeals Vibes-Based Scorekeeping",
    dek: "Players argue the final score failed to account for momentum, playlist quality, and emotional growth.",
    section: "Sport",
    author: "Casey Wing",
    publishedAt: "2026-05-13",
    readingTime: "2 min",
    body: [
      "A social netball side has requested a review after losing by seven goals but winning what several witnesses called the narrative.",
      "The appeal asks that future ladders include a column for 'looked organised during warmups.'",
    ],
  },
  {
    slug: "corrections-map-of-ilam-was-a-vibe",
    title: "Corrections: Yesterday's Map Of Ilam Was A Vibe, Not A Map",
    dek: "We regret implying north was where the coffee was.",
    section: "Corrections",
    author: "Corrections Desk",
    publishedAt: "2026-05-12",
    readingTime: "1 min",
    body: [
      "An earlier article described a route through Ilam using landmarks, emotional tone, and the phrase 'you will know it when you see it.'",
      "We accept this did not meet cartographic standards and apologise to everyone who ended up near a lecture theatre they were actively avoiding.",
    ],
  },
];

export function getFeaturedArticle() {
  return articles.find((article) => article.isFeatured);
}

export function getLatestArticles() {
  return [...articles].sort((first, second) =>
    second.publishedAt.localeCompare(first.publishedAt)
  );
}

export function getArticlesBySection(section: ArticleSection) {
  return getLatestArticles().filter((article) => article.section === section);
}

export function getArticleBySlug(slug: string) {
  return articles.find((article) => article.slug === slug);
}

export function formatArticleDate(publishedAt: string) {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    timeZone: "Pacific/Auckland",
    year: "numeric",
  }).format(new Date(`${publishedAt}T12:00:00+12:00`));
}
