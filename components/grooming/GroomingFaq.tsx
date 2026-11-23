import { STORE } from "@/lib/contact-places";
import type { PricingConfig } from "@/lib/grooming/types";

/**
 * Only answers we can stand behind from the menu and the booking flow.
 * Store policies (cancellations, vaccinations, matted coats…) are added once
 * the store has written them.
 */
export default function GroomingFaq({ pricing }: { pricing: PricingConfig }) {
  const inclusions = pricing.sections.find((s) => s.id === "grooming")?.inclusions ?? [];
  const faqs: { q: string; a: React.ReactNode }[] = [
    {
      q: "How does booking work?",
      a: (
        <p>
          Choose your pet, the service and a time that suits you, then send the request. It&apos;s saved as <strong>pending</strong>: our team calls
          you to confirm the appointment before it&apos;s final.
        </p>
      ),
    },
    {
      q: "Is the price I see final?",
      a: <p>It&apos;s an estimate from our price list, based on your pet&apos;s size and the services you pick. We confirm the final price with you on the call.</p>,
    },
    ...(inclusions.length
      ? [
          {
            q: "What's included in a spa grooming?",
            a: (
              <ul>
                {inclusions.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
    {
      q: "Can I add a massage or a quick service?",
      a: <p>Yes. Pick one main service, then add any quick services or massages as extras. The estimate adds them up for you.</p>,
    },
    {
      q: "Do you groom cats?",
      a: <p>Yes: Cats Spa Grooming, grooming + haircut for long-coated cats, and our quick services and massages.</p>,
    },
    {
      q: "Where is the store?",
      a: (
        <p>
          {STORE.address}.{" "}
          <a href={STORE.mapsUrl} target="_blank" rel="noopener noreferrer">
            Get directions<span className="visually-hidden"> (opens Google Maps)</span>
          </a>
        </p>
      ),
    },
    {
      q: "Need to change your appointment?",
      a: (
        <p>
          Call us on <a href={STORE.phoneHref}>{STORE.phone}</a> and the team will help.
        </p>
      ),
    },
  ];
  return (
    <section className="gr-section gr-faq" aria-labelledby="gr-faq-title">
      <div className="gr-section__head">
        <p className="gr-eyebrow">Good to know</p>
        <h2 id="gr-faq-title" className="gr-title">
          Questions, <em>answered.</em>
        </h2>
      </div>
      <div className="gr-faq__list">
        {faqs.map((f) => (
          <details key={f.q} className="gr-faq__item">
            <summary>
              <span>{f.q}</span>
              <span className="gr-faq__icon" aria-hidden="true" />
            </summary>
            <div className="gr-faq__answer">{f.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
