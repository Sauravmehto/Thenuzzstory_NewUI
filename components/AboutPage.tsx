"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useScrollReveal } from "@/lib/useScrollReveal";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SmartImage from "@/components/SmartImage";
import { REMOTE_ASSETS } from "@/lib/remote-assets";
import { IconArrowRight, IconArrowUpRight } from "@/components/icons";
import { getProduct } from "@/lib/catalog";

/* ─── Content ──────────────────────────────────────────────────────────── */

const PROMISES = ["biscuit-tested", "vet-approved", "no filler", "30-day returns", "pet people only", "carbon-neutral delivery"];

interface Verdict {
  item: string;
  result: string;
  chew: number; // 0–5: how well it survived
  approved: boolean;
  href?: string;
}

// Every product meets Biscuit before it meets you. Most don't make it.
const BISCUIT_VERDICTS: Verdict[] = [
  { item: "the cheap rope ball", result: "lasted 4 minutes", chew: 1, approved: false },
  { item: "rope tug bundle", result: "3 weeks of daily tug, still going", chew: 5, approved: true, href: "/shop/rope-tug-bundle" },
  { item: "“natural” beef jerky", result: "one sniff, walked away", chew: 0, approved: false },
  { item: "peanut butter bites", result: "full tail-helicopter", chew: 5, approved: true, href: "/shop/peanut-butter-bites" },
  { item: "memory foam bed v1", result: "stuffing everywhere by day 2", chew: 1, approved: false },
  { item: "cloud nine bed", result: "won't get out of it", chew: 4, approved: true, href: "/shop/cloud-nine-bed" },
];

// Only link to products the shop actually sells right now (archived ones would 404).
const BISCUIT_TEST: Verdict[] = BISCUIT_VERDICTS.map((v) =>
  v.href && !getProduct(v.href.replace(/^\/shop\//, "")) ? { ...v, href: undefined } : v,
);

interface Moment {
  year: string;
  title: string;
  body: string;
  photo?: { src: string; alt: string; caption: string; width: number; height: number };
}

const TIMELINE: Moment[] = [
  {
    year: "2019",
    title: "biscuit eats the sofa",
    body: "One muddy golden retriever, one very expensive sofa. Every “indestructible” toy we bought lasted about a day.",
    photo: { src: "/assets/pets/dog1.avif", alt: "A golden retriever sitting on a path", caption: "biscuit, unbothered", width: 724, height: 1161 },
  },
  {
    year: "2020",
    title: "the first box",
    body: "We started packing the few things that actually survived into boxes for friends, from a kitchen table.",
  },
  {
    year: "2022",
    title: "the biscuit test becomes official",
    body: "Nothing gets on the shelf until Biscuit (and friends) have chewed, tugged, napped on or licked it clean.",
    photo: {
      src: "/assets/products/paw-balm-duo.avif",
      alt: "A dog licking its nose after a treat",
      caption: "the tail-helicopter test",
      width: 800,
      height: 800,
    },
  },
  {
    year: "2024",
    title: "a shop of our own",
    body: "A real door to walk through, a water bowl outside it, and a treat jar that empties every afternoon.",
  },
  {
    year: "today",
    title: "120 things that passed",
    body: "Small, picky, and proud of it. If it's here, a pet we know loves it.",
  },
];

const RULES = [
  {
    title: "pets first, always",
    body: "Every product earns its spot by making a pet's day better. No filler, no fluff.",
    sticker: "/assets/Card-Sticker SVG/sticker-heart.svg",
  },
  {
    title: "if it breaks, we say so",
    body: "Vet-approved and safety-tested, and when something fails the Biscuit test we tell you why.",
    sticker: "/assets/Card-Sticker SVG/sticker-hand.svg",
  },
  {
    title: "delivered with a wag",
    body: "Carbon-neutral shipping and a 30-day, no-fuss return promise.",
    sticker: "/assets/Card-Sticker SVG/sticker-smiley.svg",
  },
];

const TEAM = [
  {
    name: "Maya & Biscuit",
    role: "founder & chief treat tester",
    img: "/assets/pets/dog1.avif",
    width: 724,
    height: 1161,
    stats: [
      ["favourite toy", "rope tug bundle"],
      ["worst habit", "eats sofas (retired)"],
      ["treat of choice", "peanut butter bites"],
      ["biscuit test job", "chief destroyer"],
    ],
    color: "var(--color-yellow)",
    ink: "var(--color-navy)",
  },
  {
    name: "Theo & Waffle",
    role: "head of play",
    img: "/assets/pets/dog2.avif",
    width: 834,
    height: 1161,
    stats: [
      ["favourite toy", "squeaky friends set"],
      ["worst habit", "judging everyone"],
      ["treat of choice", "dental chews"],
      ["biscuit test job", "squeak inspector"],
    ],
    color: "var(--color-darkblue)",
  },
  {
    name: "Nour & Luna",
    role: "comfort curator",
    img: "/assets/pets/moon-dog.jpg",
    width: 1104,
    height: 1472,
    stats: [
      ["favourite toy", "anything plush"],
      ["worst habit", "4am zoomies"],
      ["treat of choice", "superfood kibble"],
      ["biscuit test job", "nap tester"],
    ],
    color: "var(--color-maroon)",
  },
];

/* ─── Bits ─────────────────────────────────────────────────────────────── */

function ChewMeter({ value }: { value: number }) {
  return (
    <span className="chew-meter" role="img" aria-label={`${value} out of 5 paws`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" data-on={i < value || undefined} aria-hidden="true">
          <ellipse cx="10" cy="12.5" rx="4.6" ry="3.8" />
          <circle cx="4.6" cy="8" r="2" />
          <circle cx="8.2" cy="4.8" r="2" />
          <circle cx="11.8" cy="4.8" r="2" />
          <circle cx="15.4" cy="8" r="2" />
        </svg>
      ))}
    </span>
  );
}

function TeamCard({ member }: { member: (typeof TEAM)[number] }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <li className="flip-card" data-reveal style={{ "--accent": member.color, "--accent-ink": "ink" in member ? member.ink : undefined } as CSSProperties}>
      <button
        type="button"
        className="flip-card__inner"
        data-flipped={flipped || undefined}
        aria-pressed={flipped}
        aria-label={`${member.name}, ${member.role}. ${flipped ? "Hide" : "Show"} the pet's stats`}
        onClick={() => setFlipped((f) => !f)}
      >
        <span className="flip-card__face flip-card__front">
          <span className="flip-card__photo img-slot">
            <SmartImage src={member.img} alt="" width={member.width} height={member.height} loading="lazy" sizes="(max-width: 768px) 80vw, 340px" />
          </span>
          <span className="flip-card__name">{member.name}</span>
          <span className="flip-card__role">{member.role}</span>
          <span className="flip-card__hint" aria-hidden="true">
            flip for stats ↻
          </span>
        </span>
        <span className="flip-card__face flip-card__back" aria-hidden={!flipped}>
          <span className="flip-card__back-title">{member.name.split(" & ")[1]}&apos;s file</span>
          <dl>
            {member.stats.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </span>
      </button>
    </li>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────── */

export default function AboutPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  useScrollReveal(pageRef);

  const tried = 214;
  const passed = BISCUIT_TEST.filter((v) => v.approved).length;

  return (
    <div className="cozy-page about-page" ref={pageRef}>
      <SiteHeader />

      <section className="about-hero">
        <div className="about-hero__text">
          <span className="story-eyebrow cozy-fade-up cozy-delay-100">🐾 our story</span>
          <h1 className="story-title cozy-fade-up cozy-delay-200">
            a little obsessed with <em>good pets</em>
          </h1>
          <p className="about-hero__subtitle cozy-fade-up cozy-delay-300">
            The Nuzz Story started with one muddy golden retriever, a chewed-up sofa, and a simple idea: pets
            deserve better stuff. So we made a pet store run by pet people, for pet people.
          </p>
          <Link href="/shop" className="cozy-btn-orange cozy-fade-up cozy-delay-400">
            Shop the good stuff <IconArrowRight className="cozy-btn-orange__icon" />
          </Link>
        </div>
        <div className="about-hero__media cozy-scale-in cozy-delay-300">
          <span className="about-hero__blob" aria-hidden="true" />
          <SmartImage src={REMOTE_ASSETS.aboutHero} alt="A happy dog on a beach" width={1000} height={667} fetchPriority="high" sizes="(max-width: 768px) 100vw, 560px" />
          <img src="/assets/Footer-Sticker SVG/footer-sticker-100.svg" alt="" aria-hidden="true" className="about-hero__sticker" />
        </div>
      </section>

      <div className="promise-strip" aria-label="Our promises">
        <div className="promise-strip__track">
          {[0, 1].map((copy) => (
            <ul key={copy} aria-hidden={copy === 1 || undefined}>
              {PROMISES.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      <section className="biscuit-test" aria-labelledby="biscuit-title">
        <div className="biscuit-test__head" data-reveal>
          <h2 id="biscuit-title" className="story-title story-title--section">
            the biscuit <em>test</em>
          </h2>
          <p>
            Every product meets Biscuit before it meets you. Most of them don&apos;t make it. So far:{" "}
            <strong>
              {tried} tried, 120 made the shelf.
            </strong>
          </p>
        </div>
        <ul className="verdict-grid">
          {BISCUIT_TEST.map((v, i) => {
            const body = (
              <>
                <span className="verdict__stamp" data-approved={v.approved || undefined}>
                  {v.approved ? "approved" : "rejected"}
                </span>
                <span className="verdict__item">{v.item}</span>
                <span className="verdict__result">{v.result}</span>
                <span className="verdict__meter">
                  <span className="verdict__meter-label">chew-o-meter</span>
                  <ChewMeter value={v.chew} />
                </span>
                {v.href && (
                  <span className="verdict__link">
                    see it in the shop <IconArrowUpRight aria-hidden="true" />
                  </span>
                )}
              </>
            );
            return (
              <li
                key={v.item}
                className="verdict"
                data-approved={v.approved || undefined}
                data-reveal
                data-reveal-delay={String((i % 3) * 0.08)}
              >
                {v.href ? (
                  <Link href={v.href} className="verdict__card">
                    {body}
                  </Link>
                ) : (
                  <div className="verdict__card">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="biscuit-test__foot" data-reveal>
          {passed} of the {BISCUIT_TEST.length} above passed. The other {BISCUIT_TEST.length - passed} were
          returned to their makers with notes.
        </p>
      </section>

      <section className="timeline" aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="story-title story-title--section" data-reveal>
          how we got <em>here</em>
        </h2>
        <div className="timeline__track">
          <svg className="timeline__line" viewBox="0 0 40 1000" preserveAspectRatio="none" aria-hidden="true">
            <path
              pathLength={1}
              d="M20 0 C 36 60, 4 120, 20 180 S 36 300, 20 360 S 4 480, 20 540 S 36 660, 20 720 S 4 840, 20 900 S 30 960, 20 1000"
            />
          </svg>
          <ol>
            {TIMELINE.map((m) => (
              <li key={m.year} className="moment" data-reveal>
                <span className="moment__dot" aria-hidden="true" />
                <div className="moment__text">
                  <span className="moment__year">{m.year}</span>
                  <h3>{m.title}</h3>
                  <p>{m.body}</p>
                </div>
                {m.photo && (
                  <figure className="polaroid">
                    <span className="polaroid__img img-slot">
                      <SmartImage src={m.photo.src} alt={m.photo.alt} width={m.photo.width} height={m.photo.height} loading="lazy" sizes="260px" />
                    </span>
                    <figcaption>{m.photo.caption}</figcaption>
                  </figure>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="house-rules" aria-labelledby="rules-title">
        <h2 id="rules-title" className="story-title story-title--section" data-reveal>
          house <em>rules</em>
        </h2>
        <ol>
          {RULES.map((rule, i) => (
            <li key={rule.title} className="rule" data-reveal>
              <span className="rule__num" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{rule.title}</h3>
                <p>{rule.body}</p>
              </div>
              <img className="rule__sticker" src={rule.sticker} alt="" aria-hidden="true" />
            </li>
          ))}
        </ol>
      </section>

      <section className="about-team" aria-labelledby="team-title">
        <h2 id="team-title" className="story-title story-title--section" data-reveal>
          the humans <em>(and their bosses)</em>
        </h2>
        <ul className="flip-grid">
          {TEAM.map((member) => (
            <TeamCard key={member.name} member={member} />
          ))}
        </ul>
      </section>

      <section className="about-cta" data-reveal>
        <img src="/assets/Footer-Sticker SVG/footer-sticker-boom.svg" alt="" aria-hidden="true" className="about-cta__sticker" />
        <h2>ready to spoil your best friend?</h2>
        <Link href="/shop" className="about-cta__btn">
          Explore the shop <IconArrowRight />
        </Link>
      </section>

      <SiteFooter />
    </div>
  );
}
