import { describe, expect, it } from "vitest";
import { STORE } from "@/lib/contact-places";

describe("STORE contact details", () => {
  it("dials the number it displays (+91, without the trunk 0)", () => {
    const shown = STORE.phone.replace(/\D/g, "").replace(/^0/, "");
    expect(STORE.phoneHref).toBe(`tel:+91${shown}`);
  });

  it("keeps the one-line and multi-line address in sync", () => {
    expect(STORE.address).toBe(STORE.addressLines.join(" "));
    expect(STORE.address).toContain(STORE.postal.postalCode);
  });

  it("links to the official Google Maps listing and embed", () => {
    expect(STORE.mapsUrl).toBe("https://maps.app.goo.gl/56mzcdxAwx34DR487");
    expect(STORE.mapsEmbedUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/embed\?pb=/);
  });
});
