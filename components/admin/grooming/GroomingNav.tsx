/*
 * The grooming screens are listed in the admin sidebar (AdminHeader).
 * This only adds the note that grooming changes go live straight away,
 * unlike product changes which wait for the next publish.
 */
export default function GroomingNav() {
  return (
    <p className="admin-gr-live">
      <span className="admin-gr-live__dot" aria-hidden="true" />
      Grooming changes go live on the website straight away. No publish needed.
    </p>
  );
}
