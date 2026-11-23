"use client";

import { useState } from "react";
import { requestService } from "@/lib/grooming/events";
import { formatRupees } from "@/lib/grooming/money";
import { priceFor } from "@/lib/grooming/pricing";
import { SIZE_BANDS, type GroomingService, type PricingConfig, type Species } from "@/lib/grooming/types";

const BookThis = ({ service, species }: { service: GroomingService; species: Species }) => (
  <button type="button" className="gr-btn gr-btn--amber gr-btn--sm" onClick={() => requestService({ serviceId: service.id, species })}>
    Book this<span className="visually-hidden">: {service.name}</span>
  </button>
);

function ServiceCard({ service, species }: { service: GroomingService; species: Species }) {
  const cents = priceFor(service.price, null);
  return (
    <li className="gr-svc">
      <div className="gr-svc__top">
        <h4 className="gr-svc__name">{service.name}</h4>
        {cents !== null && <p className="gr-svc__price">{formatRupees(cents)}</p>}
      </div>
      {service.condition && <p className="gr-svc__condition">{service.condition}</p>}
      {service.description && (
        <details className="gr-svc__more">
          <summary>What&apos;s included</summary>
          <p>{service.description}</p>
        </details>
      )}
      <BookThis service={service} species={species} />
    </li>
  );
}

export default function PriceList({ pricing }: { pricing: PricingConfig }) {
  const [species, setSpecies] = useState<Species>("dog");
  const active = pricing.services.filter((s) => s.active && s.species.includes(species)).sort((a, b) => a.order - b.order);
  const sections = [...pricing.sections].sort((a, b) => a.order - b.order);
  const grooming = sections.find((s) => s.id === "grooming");
  const packages = active.filter((s) => s.sectionId === grooming?.id);
  const sized = packages.filter((s) => s.price.type === "by_size");
  const flat = packages.filter((s) => s.price.type === "flat");
  const bands = pricing.sizeBands;

  return (
    <section className="gr-section gr-prices" id="prices" aria-labelledby="gr-prices-title">
      <div className="gr-section__head">
        <p className="gr-eyebrow">Services &amp; prices</p>
        <h2 id="gr-prices-title" className="gr-title">
          Our grooming <em>menu.</em>
        </h2>
        <div className="gr-tabs" role="tablist" aria-label="Pet">
          {(["dog", "cat"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              id={`gr-tab-${s}`}
              aria-selected={species === s}
              aria-controls="gr-price-panel"
              className="gr-tabs__tab"
              onClick={() => setSpecies(s)}
            >
              <span aria-hidden="true">{s === "dog" ? "🐶" : "🐱"}</span> {s === "dog" ? "Dogs" : "Cats"}
            </button>
          ))}
          <span className="gr-tabs__glider" data-pos={species} aria-hidden="true" />
        </div>
      </div>

      <div id="gr-price-panel" role="tabpanel" aria-labelledby={`gr-tab-${species}`} className="gr-prices__panel" key={species}>
        {grooming && packages.length > 0 && (
          <div className="gr-prices__block gr-prices__block--feature">
            <div className="gr-prices__intro">
              <h3>{grooming.title}</h3>
              {grooming.inclusions.length > 0 && (
                <>
                  <p className="gr-prices__included-label">Included in every package</p>
                  <ul className="gr-included">
                    {grooming.inclusions.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="gr-prices__tables">
              {sized.length > 0 && (
                <div className="gr-table-wrap">
                  <table className="gr-table">
                    <caption className="visually-hidden">{species === "dog" ? "Dog grooming prices by weight" : "Prices"}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Size</th>
                        {sized.map((s) => (
                          <th scope="col" key={s.id}>
                            {s.name}
                            {s.subtitle && <span className="gr-table__sub">{s.subtitle}</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {SIZE_BANDS.map((band) => {
                        const def = bands.find((b) => b.id === band);
                        if (!def) return null;
                        return (
                          <tr key={band}>
                            <th scope="row">{def.label}</th>
                            {sized.map((s) => {
                              const cents = priceFor(s.price, band);
                              return <td key={s.id}>{cents === null ? <span className="gr-muted">Ask us</span> : formatRupees(cents)}</td>;
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row" className="gr-table__book-label">
                          <span className="visually-hidden">Book</span>
                        </th>
                        {sized.map((s) => (
                          <td key={s.id} className="gr-table__book">
                            <BookThis service={s} species={species} />
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              {flat.length > 0 && (
                <ul className="gr-package-list">
                  {flat.map((s) => (
                    <li key={s.id} className="gr-package">
                      <div>
                        <h4>{s.name}</h4>
                        {s.subtitle && <p className="gr-muted">{s.subtitle}</p>}
                      </div>
                      <p className="gr-package__price">{formatRupees(priceFor(s.price, null) ?? 0)}</p>
                      <BookThis service={s} species={species} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {sections
          .filter((sec) => sec.id !== grooming?.id)
          .map((sec) => {
            const list = active.filter((s) => s.sectionId === sec.id);
            if (list.length === 0) return null;
            return (
              <div key={sec.id} className="gr-prices__block">
                <h3>{sec.title}</h3>
                <ul className={`gr-svc-grid gr-svc-grid--${sec.id}`}>
                  {list.map((s) => (
                    <ServiceCard key={s.id} service={s} species={species} />
                  ))}
                </ul>
              </div>
            );
          })}
        <p className="gr-prices__foot">
          Prices in ₹ from our grooming menu. You can add any quick service or massage to a grooming package when you book.
        </p>
      </div>
    </section>
  );
}
