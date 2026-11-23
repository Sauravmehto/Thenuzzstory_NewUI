import Image from "next/image";
import { formatRupees } from "@/lib/grooming/money";
import { STORE } from "@/lib/contact-places";

export default function GroomingHero({ fromCents }: { fromCents: number | null }) {
  const chips = [
    "Anti-tick & flea bath",
    "Paw-pad conditioning",
    "Dogs & cats",
    ...(fromCents ? [`From ${formatRupees(fromCents)}`] : []),
  ];
  return (
    <section className="gr-hero" aria-labelledby="gr-hero-title">
      <div className="gr-hero__bubbles" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="gr-hero__copy">
        <p className="gr-eyebrow gr-eyebrow--light">Premium pet grooming</p>
        <h1 id="gr-hero-title" className="gr-hero__title">
          Because your pet deserves <em>the best.</em>
        </h1>
        <p className="gr-hero__lead">
          Spa baths, haircuts, quick touch-ups and massages for dogs and cats, at our store in {STORE.area}.
        </p>
        <div className="gr-hero__ctas">
          <a href="#book" className="gr-btn gr-btn--amber gr-btn--lg">
            Check price &amp; book
          </a>
          <a href="#prices" className="gr-btn gr-btn--ghost-light gr-btn--lg">
            See the price list
          </a>
        </div>
        <ul className="gr-chips" aria-label="Highlights">
          {chips.map((c) => (
            <li key={c}>{c}</li>
          ))}
          <li className="gr-chips__rating">
            <span aria-hidden="true">★</span> {STORE.google.rating} on Google ({STORE.google.reviews} reviews)
          </li>
        </ul>
      </div>
      <div className="gr-hero__visual">
        <div className="gr-hero__halo" aria-hidden="true" />
        <div className="gr-hero__photo">
          <Image
            src="/assets/hero/dog-center-blue.avif"
            alt="A golden retriever resting its paws on a royal-blue ledge"
            width={977}
            height={1024}
            sizes="(max-width: 860px) 70vw, 440px"
            priority
          />
          <span className="gr-hero__shine" aria-hidden="true" />
        </div>
        <p className="gr-hero__badge" aria-hidden="true">
          <span>Spa</span> day
        </p>
      </div>
    </section>
  );
}
