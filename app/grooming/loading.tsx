export default function Loading() {
  return (
    <div className="cozy-page grooming-page" aria-busy="true">
      <div className="gr-hero gr-hero--skeleton">
        <span className="visually-hidden">Loading grooming…</span>
      </div>
    </div>
  );
}
