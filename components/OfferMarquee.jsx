const OFFER_TEXT = [
  "10% OFF - Use NUZZSTROY10 on every product",
  "Free home delivery up to 2-3 km",
];

export default function OfferMarquee({ className = "" }) {
  const line = OFFER_TEXT.join("   •   ");
  return (
    <div className={`offer-marquee ${className}`.trim()} role="status" aria-label="Offers">
      <div className="offer-marquee__track" aria-hidden="true">
        <span>{line}</span>
        <span>{line}</span>
      </div>
      <p className="offer-marquee__static">{line}</p>
    </div>
  );
}
