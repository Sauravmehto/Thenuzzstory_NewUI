import { instagramPermalink, parseInstagramUrl } from "@/lib/grooming/instagram";
import type { Testimonial } from "@/lib/grooming/types";

/** Hidden until the store has published at least one real review. */
export default function Testimonials({ items }: { items: Testimonial[] }) {
  if (items.length === 0) return null;
  return (
    <section className="gr-section gr-reviews" aria-labelledby="gr-reviews-title">
      <div className="gr-section__head">
        <p className="gr-eyebrow">Kind words</p>
        <h2 id="gr-reviews-title" className="gr-title">
          From pet <em>parents.</em>
        </h2>
      </div>
      <ul className="gr-reviews__grid">
        {items.map((t) => {
          const link = t.instagramUrl ? parseInstagramUrl(t.instagramUrl) : null;
          return (
            <li key={t.id} className="gr-review">
              <p className="gr-review__stars" aria-label={`${t.rating} out of 5 stars`}>
                {"★".repeat(t.rating)}
                <span aria-hidden="true">{"★".repeat(5 - t.rating)}</span>
              </p>
              <blockquote>
                <p>{t.text}</p>
              </blockquote>
              <p className="gr-review__who">
                <strong>{t.customerName}</strong>
                {t.petName && <span> with {t.petName}</span>}
              </p>
              {link && (
                <a className="gr-review__link" href={instagramPermalink(link.kind, link.shortcode)} target="_blank" rel="noopener noreferrer">
                  Watch on Instagram ↗<span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
