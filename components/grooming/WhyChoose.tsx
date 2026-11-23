/** Four reasons, each taken from what the printed menu actually includes. No invented numbers. */
const REASONS = [
  {
    icon: "🛁",
    title: "Hygiene first",
    text: "A proper bath with antitick & flea, or sensitive-skin shampoo for rashes and itchy skin.",
  },
  {
    icon: "✂️",
    title: "Head-to-tail care",
    text: "Eyes, ears, teeth and nails, plus brushing, combing and deshedding in every spa grooming.",
  },
  {
    icon: "🐾",
    title: "The little comforts",
    text: "Paw-pad conditioning, a gentle blow dry and a cologne spray to finish.",
  },
  {
    icon: "₹",
    title: "Prices you can see",
    text: "Every price is on this page. You'll see an estimate before you book, and we confirm it on the call.",
  },
];

export default function WhyChoose() {
  return (
    <section className="gr-section gr-why" aria-labelledby="gr-why-title">
      <div className="gr-section__head">
        <p className="gr-eyebrow">Why The Nuzz Story</p>
        <h2 id="gr-why-title" className="gr-title">
          Pampering, done <em>properly.</em>
        </h2>
      </div>
      <ul className="gr-why__grid">
        {REASONS.map((r) => (
          <li key={r.title} className="gr-why__card">
            <span className="gr-why__icon" aria-hidden="true">
              {r.icon}
            </span>
            <h3>{r.title}</h3>
            <p>{r.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
