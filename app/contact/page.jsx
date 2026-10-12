import ContactPage from "@/components/ContactPage";
import { STORE } from "@/lib/contact-places";

export const metadata = {
  title: "Contact — The Nuzz Story",
  description: `Visit or call The Nuzz Story, ${STORE.area}. ${STORE.address}. Phone ${STORE.phone}.`,
};

// LocalBusiness data for search engines: only what the store's Google listing
// confirms (no hours, email or ratings, which Google ignores on own-site markup).
const storeSchema = {
  "@context": "https://schema.org",
  "@type": "Store",
  name: STORE.name,
  address: { "@type": "PostalAddress", ...STORE.postal },
  telephone: STORE.phoneHref.replace("tel:", ""),
  hasMap: STORE.mapsUrl,
};

export default function Contact() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(storeSchema) }}
      />
      <ContactPage />
    </>
  );
}
