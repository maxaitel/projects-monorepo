import { useEffect, useState } from "react";
import heroImage from "./assets/civic-podium-hero.png";
import flagImage from "./assets/flag-columns.png";

const navItems = [
  { label: "Home", target: "home" },
  { label: "Record", target: "record" },
  { label: "Priorities", target: "priorities" },
  { label: "Press Notes", target: "press" },
  { label: "Gallery", target: "gallery" },
  { label: "About", target: "about" },
];

const recordItems = [
  {
    title: "Consistently Consistent",
    icon: "landmark",
    copy: "Unwavering in positions crafted to please yesterday's donors and tomorrow's.",
    detail: "A steady hand for people who prefer their principles pre-negotiated.",
  },
  {
    title: "Strategic Flexibility",
    icon: "knight",
    copy: "Adapts quickly to any political wind - especially the ones that blow toward power.",
    detail: "A nimble posture, maintained with solemn graphics and selective memory.",
  },
  {
    title: "National Security First*",
    icon: "shield",
    copy: "Strong on threats, surveillance, and anything that makes someone feel slightly less free.",
    detail: "*Yours may vary. Terms, exceptions, and classified vibes apply.",
  },
  {
    title: "Legislative Highlights",
    icon: "pen",
    copy: "Authored, cosponsored, or quietly enabled a long list of ideas history won't thank him for.",
    detail: "The paperwork is real. The mandate is theoretical.",
  },
];

const priorityItems = [
  {
    title: "Security Above All",
    icon: "lock",
    copy: "Expand what we can see. Restrict what you can say. Safety is strength.",
  },
  {
    title: "Power in Partnerships",
    icon: "landmark",
    copy: "Strong alliances with powerful interests keep the country aligned.",
  },
  {
    title: "American Exceptionalism",
    icon: "flag",
    copy: "Because the rules are for other countries.",
  },
  {
    title: "Rule of Law & Order",
    icon: "scale",
    copy: "Strict for some. Flexible for the rest.",
  },
];

const pressNotes = [
  {
    outlet: "The Daily Ledger",
    quote: "Rubio proves that conviction is optional - but ambition isn't.",
    date: "5.12.24",
    detail: "A short review of disciplined message control and long-distance accountability.",
  },
  {
    outlet: "Capital Outlook",
    quote: "He'll say what he needs to. You just have to guess who 'he' is.",
    date: "3.08.24",
    detail: "A concise assessment of brand stability under changing weather conditions.",
  },
  {
    outlet: "Midnight Wire",
    quote: "A masterclass in positioning. Substance remains highly theoretical.",
    date: "11.19.23",
    detail: "A dispatch from the quiet space between a podium and a principle.",
  },
];

function Icon({ name }) {
  const common = {
    width: "42",
    height: "42",
    viewBox: "0 0 48 48",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  if (name === "landmark") {
    return (
      <svg {...common}>
        <path d="M8 20h32" />
        <path d="M11 20v16" />
        <path d="M20 20v16" />
        <path d="M28 20v16" />
        <path d="M37 20v16" />
        <path d="M7 38h34" />
        <path d="M10 16 24 8l14 8" />
      </svg>
    );
  }

  if (name === "knight") {
    return (
      <svg {...common}>
        <path d="M16 38h20" />
        <path d="M18 34h16" />
        <path d="M20 34c0-6 2-9 7-13l-6-2 3-7 12 8-4 14" />
        <path d="M21 16h.1" />
      </svg>
    );
  }

  if (name === "shield") {
    return (
      <svg {...common}>
        <path d="M24 7 38 12v10c0 9-5.5 15-14 19-8.5-4-14-10-14-19V12l14-5Z" />
        <path d="m24 18 2.1 4.2 4.7.7-3.4 3.3.8 4.7-4.2-2.2-4.2 2.2.8-4.7-3.4-3.3 4.7-.7L24 18Z" />
      </svg>
    );
  }

  if (name === "pen") {
    return (
      <svg {...common}>
        <path d="m34 6 8 8-23 23-10 3 3-10L34 6Z" />
        <path d="m29 11 8 8" />
      </svg>
    );
  }

  if (name === "lock") {
    return (
      <svg {...common}>
        <rect x="12" y="21" width="24" height="19" rx="2" />
        <path d="M17 21v-6a7 7 0 0 1 14 0v6" />
        <path d="M24 29v5" />
      </svg>
    );
  }

  if (name === "flag") {
    return (
      <svg {...common}>
        <path d="M13 40V8" />
        <path d="M13 10c7-4 12 4 22 0v19c-10 4-15-4-22 0" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M24 8v32" />
      <path d="M12 18h24" />
      <path d="M16 18 9 32h14l-7-14Z" />
      <path d="M32 18 25 32h14l-7-14Z" />
    </svg>
  );
}

function scrollToId(target) {
  const element = document.getElementById(target);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function App() {
  const [activeSection, setActiveSection] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedPriority, setSelectedPriority] = useState(null);
  const [selectedPress, setSelectedPress] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    const sections = ["home", "record", "priorities", "press", "about"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target?.id) {
          setActiveSection(visible.target.id);
        }
      },
      { rootMargin: "-28% 0px -55% 0px", threshold: [0.18, 0.35, 0.55] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!galleryOpen) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setGalleryOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [galleryOpen]);

  const onNav = (item) => {
    setMenuOpen(false);
    if (item.target === "gallery") {
      setGalleryOpen(true);
      return;
    }

    scrollToId(item.target);
  };

  return (
    <>
      <header className="site-header" id="home">
        <div className="parody-strip">
          <span aria-hidden="true">★</span>
          <span>Parody / Not an Official Campaign Site</span>
          <span aria-hidden="true">★</span>
        </div>

        <div className="nav-shell">
          <button
            className="brand-mark"
            type="button"
            onClick={() => scrollToId("home")}
            aria-label="Scroll to top"
          >
            <span>Marco Rubio</span>
            <strong>2028</strong>
          </button>

          <button
            className="menu-button"
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <nav
            className={menuOpen ? "main-nav is-open" : "main-nav"}
            id="main-navigation"
            aria-label="Primary"
          >
            {navItems.map((item) => (
              <button
                className={activeSection === item.target ? "is-active" : ""}
                type="button"
                key={item.target}
                onClick={() => onNav(item)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">
              Marco Rubio
              <span>2028</span>
            </h1>
            <p className="tagline">An evil you can count on.</p>
            <p className="hero-subcopy">
              Proven. Principled. Persistent in all the wrong places.
              Delivering results nobody asked for, with consistency that's
              almost admirable.
            </p>
          </div>

          <img
            className="hero-image"
            src={heroImage}
            alt="A dark civic podium and neoclassical columns, used as parody campaign imagery."
          />
        </section>

        <section className="record-section" id="record" aria-labelledby="record-title">
          <div className="section-kicker">
            <span></span>
            <strong>Record</strong>
            <span></span>
          </div>

          <h2 id="record-title">
            A long track record of being on the right side of things. Always.
          </h2>

          <div className="record-grid">
            {recordItems.map((item, index) => (
              <button
                className={selectedRecord === index ? "record-card is-selected" : "record-card"}
                type="button"
                key={item.title}
                onClick={() => setSelectedRecord(index)}
              >
                <Icon name={item.icon} />
                <strong>{item.title}</strong>
                <span></span>
                <p>{item.copy}</p>
              </button>
            ))}
          </div>

          {selectedRecord !== null ? (
            <p className="selection-note" aria-live="polite">
              {recordItems[selectedRecord].detail}
            </p>
          ) : null}
        </section>

        <section
          className="priorities-section"
          id="priorities"
          aria-labelledby="priorities-title"
        >
          <div className="priorities-copy">
            <div className="compact-kicker">
              <span aria-hidden="true">★</span>
              <strong>Priorities</strong>
            </div>
            <h2 id="priorities-title">
              Common sense.
              <br />
              Uncommon motives.
            </h2>

            <div className="priority-list">
              {priorityItems.map((item, index) => (
                <button
                  className={selectedPriority === index ? "priority-row is-selected" : "priority-row"}
                  type="button"
                  key={item.title}
                  onClick={() => setSelectedPriority(index)}
                >
                  <Icon name={item.icon} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.copy}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <figure className="flag-panel">
            <img
              src={flagImage}
              alt="A United States flag in front of neoclassical columns."
            />
            {selectedPriority !== null ? (
              <figcaption aria-live="polite">
                {priorityItems[selectedPriority].title}: {priorityItems[selectedPriority].copy}
              </figcaption>
            ) : null}
          </figure>
        </section>

        <section className="press-section" id="press" aria-labelledby="press-title">
          <div className="section-kicker">
            <span></span>
            <strong>Press Notes</strong>
            <span></span>
          </div>

          <div className="press-grid">
            {pressNotes.map((note, index) => (
              <button
                className={selectedPress === index ? "press-card is-selected" : "press-card"}
                type="button"
                key={note.outlet}
                onClick={() => setSelectedPress(index)}
              >
                <strong>{note.outlet}</strong>
                <span></span>
                <q>{note.quote}</q>
                <small>- {note.date}</small>
              </button>
            ))}
          </div>

          {selectedPress !== null ? (
            <p className="selection-note" aria-live="polite">
              {pressNotes[selectedPress].detail}
            </p>
          ) : null}
        </section>
      </main>

      <footer className="site-footer" id="about">
        <div className="footer-star" aria-hidden="true">
          ★
        </div>
        <strong>Parody / Not an Official Campaign Site</strong>
        <p>
          This is a satirical prototype and is not affiliated with Marco Rubio,
          any campaign, political committee, party, or election operation.
        </p>
      </footer>

      {galleryOpen ? (
        <div
          className="gallery-backdrop"
          role="presentation"
          onMouseDown={() => setGalleryOpen(false)}
        >
          <section
            className="gallery-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close-button"
              type="button"
              onClick={() => setGalleryOpen(false)}
              aria-label="Close gallery"
            >
              x
            </button>
            <h2 id="gallery-title">Gallery</h2>
            <p>Two source images used by this parody prototype.</p>
            <div className="gallery-grid">
              <img src={heroImage} alt="Civic podium and columns." />
              <img src={flagImage} alt="Flag and columns." />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
