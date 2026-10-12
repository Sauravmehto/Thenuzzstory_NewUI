/**
 * The store's official contact + location details: the single source for the
 * contact page, both footers and the contact page's structured data.
 * Only information from the store's Google listing lives here; don't add
 * hours, emails or anything else that isn't confirmed.
 */

const ADDRESS_LINES = [
  "40/42 UGF, Market No 1, Main Rd,",
  "opposite to Looks Salon,",
  "Pocket 40, Chittaranjan Park,",
  "New Delhi, Delhi 110019",
] as const;

export const STORE = {
  name: "The Nuzz Story",
  /** For multi-line display (one <br /> per entry). */
  addressLines: ADDRESS_LINES,
  /** For copying / one-line display. */
  address: ADDRESS_LINES.join(" "),
  /** Short form for tight spots (a card subtitle). */
  area: "Chittaranjan Park, New Delhi",
  postal: {
    streetAddress: "40/42 UGF, Market No 1, Main Rd, opposite to Looks Salon, Pocket 40, Chittaranjan Park",
    addressLocality: "New Delhi",
    addressRegion: "Delhi",
    postalCode: "110019",
    addressCountry: "IN",
  },
  phone: "096677 07716",
  phoneHref: "tel:+919667707716",
  mapsUrl: "https://maps.app.goo.gl/56mzcdxAwx34DR487",
  mapsEmbedUrl:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d695.4715132875936!2d77.24948404462607!3d28.54101972087986!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x390ce3e417a2d24b%3A0x3d189adba01622d7!2sThe%20Nuzz%20Story!5e0!3m2!1sen!2sin!4v1791291835890!5m2!1sen!2sin",
  /** As shown on the Google listing; update by hand when it changes. */
  google: { rating: "5.0", reviews: 16 },
} as const;
