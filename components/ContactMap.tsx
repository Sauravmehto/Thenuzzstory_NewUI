"use client";

import { STORE } from "@/lib/contact-places";

/**
 * The store on Google Maps (the official embed from the store's listing).
 * The browser lazy-loads it (loading="lazy"), so it costs nothing until the
 * visitor scrolls near it. The parent shows a placeholder underneath until
 * `onReady` fires, so the space never looks empty or broken.
 */
export default function ContactMap({ onReady }: { onReady?: () => void }) {
  return (
    <iframe
      className="contact-map__canvas"
      src={STORE.mapsEmbedUrl}
      title={`${STORE.name} on Google Maps`}
      style={{ border: 0 }}
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={onReady}
    />
  );
}
