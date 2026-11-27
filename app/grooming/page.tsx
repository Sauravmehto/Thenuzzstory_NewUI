import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import BookingFlow from "@/components/grooming/BookingFlow";
import GroomingFaq from "@/components/grooming/GroomingFaq";
import GroomingHero from "@/components/grooming/GroomingHero";
import PetGallery from "@/components/grooming/PetGallery";
import PriceList from "@/components/grooming/PriceList";
import ReelStack from "@/components/grooming/ReelStack";
import StickyBookBar from "@/components/grooming/StickyBookBar";
import Testimonials from "@/components/grooming/Testimonials";
import WhyChoose from "@/components/grooming/WhyChoose";
import { DEFAULT_AVAILABILITY } from "@/lib/grooming/availability";
import { formatRupees } from "@/lib/grooming/money";
import { menuFrom } from "@/lib/grooming/pricing";
import { SAMPLE_GALLERY } from "@/lib/grooming/samples";
import type { AvailabilityConfig, GalleryItem, GroomingVideo, PricingConfig, Testimonial } from "@/lib/grooming/types";
import { getAvailability, getPricing, menuPricing, publishedContent } from "@/lib/server/grooming-config";
import { groomingStore } from "@/lib/server/grooming-store";

export const metadata: Metadata = {
  title: "Premium Pet Grooming — The Nuzz Story",
  description:
    "Spa grooming, haircuts, quick services and massages for dogs and cats at The Nuzz Story, Chittaranjan Park, New Delhi. See prices and request an appointment online.",
};

// Admin changes refresh this page on demand; this is the fallback interval.
export const revalidate = 300;

async function loadPage(): Promise<{
  pricing: PricingConfig;
  availability: AvailabilityConfig;
  videos: GroomingVideo[];
  gallery: GalleryItem[];
  testimonials: Testimonial[];
}> {
  try {
    const store = await groomingStore();
    const [pricing, availability, videos, gallery, testimonials] = await Promise.all([
      getPricing(store),
      getAvailability(store),
      publishedContent("videos", store),
      publishedContent("gallery", store),
      publishedContent("testimonials", store),
    ]);
    return { pricing, availability, videos, gallery, testimonials };
  } catch (err) {
    // Storage unreachable (e.g. at build time): show the printed menu; the page refreshes later.
    console.error("[grooming page] falling back to the printed menu", err);
    return { pricing: menuPricing(), availability: DEFAULT_AVAILABILITY, videos: [], gallery: SAMPLE_GALLERY, testimonials: [] };
  }
}

export default async function GroomingPage() {
  const { pricing, availability, videos, gallery, testimonials } = await loadPage();
  const from = menuFrom(pricing);
  return (
    <div className="cozy-page grooming-page">
      <SiteHeader />
      <main id="main">
        <GroomingHero fromCents={from} />
        <PriceList pricing={pricing} />
        <BookingFlow pricing={pricing} bookingEnabled={availability.bookingEnabled} maxDaysAhead={availability.maxDaysAhead} />
        <WhyChoose />
        <ReelStack videos={videos.slice(0, 8)} />
        <PetGallery items={gallery} />
        <Testimonials items={testimonials} />
        <GroomingFaq pricing={pricing} />
        <section className="gr-final" aria-labelledby="gr-final-title">
          <h2 id="gr-final-title" className="gr-title gr-title--light">
            Ready for a <em>spa day?</em>
          </h2>
          <p>Because your pet deserves the best.</p>
          <a href="#book" className="gr-btn gr-btn--amber gr-btn--lg">
            Book grooming
          </a>
        </section>
      </main>
      <StickyBookBar fromLabel={from ? formatRupees(from) : null} />
      <SiteFooter />
    </div>
  );
}
