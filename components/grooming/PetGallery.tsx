import SmartImage from "@/components/SmartImage";
import type { GalleryItem } from "@/lib/grooming/types";

export default function PetGallery({ items }: { items: GalleryItem[] }) {
  if (items.length === 0) return null;
  const allSamples = items.every((i) => i.isSample);
  return (
    <section className="gr-section gr-gallery" aria-labelledby="gr-gallery-title">
      <div className="gr-section__head">
        <p className="gr-eyebrow">Happy pets</p>
        <h2 id="gr-gallery-title" className="gr-title">
          Fresh from the <em>spa.</em>
        </h2>
        {allSamples && <p className="gr-section__note">Sample photos for now: our own pet gallery is coming soon.</p>}
      </div>
      <ul className="gr-gallery__grid">
        {items.map((item, i) => (
          <li key={item.id} className="gr-gallery__item">
            <figure>
              <div className="gr-gallery__frame img-slot">
                <SmartImage src={item.src} alt={item.alt} width={600} height={750} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px" loading={i < 2 ? undefined : "lazy"} />
                {item.isSample && <span className="gr-gallery__sample">Sample photo</span>}
              </div>
              {!item.isSample && (item.petName || item.breed || item.service || item.caption) && (
                <figcaption>
                  {item.petName && <strong>{item.petName}</strong>}
                  {item.breed && <span>{item.breed}</span>}
                  {item.service && <span className="gr-gallery__service">{item.service}</span>}
                  {item.caption && <span className="gr-gallery__caption">{item.caption}</span>}
                </figcaption>
              )}
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
