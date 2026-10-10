"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useScrollReveal } from "@/lib/useScrollReveal";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ContactMap from "@/components/ContactMap";
import { IconArrowRight, IconArrowUpRight, IconCheck, IconCopy, IconMapPin, IconPhone, IconStar } from "@/components/icons";
import { STORE } from "@/lib/contact-places";

const TOPICS = [
  { id: "general", label: "General" },
  { id: "order", label: "My order" },
  { id: "product", label: "Product help" },
  { id: "wholesale", label: "Wholesale" },
  { id: "hi", label: "Say hi 👋" },
] as const;
type TopicId = (typeof TOPICS)[number]["id"];

const CONTACT_CARDS = [
  {
    sticker: "/assets/Card-Sticker SVG/sticker-heart.svg",
    title: "email us",
    detail: "hello@thenuzzstory.co",
    href: "mailto:hello@thenuzzstory.co",
    color: "var(--color-pink)",
    tilt: "-3deg",
  },
  {
    sticker: "/assets/Card-Sticker SVG/sticker-phone.svg",
    title: "call us",
    detail: STORE.phone,
    href: STORE.phoneHref,
    color: "var(--color-lightblue)",
    tilt: "2deg",
  },
  {
    sticker: "/assets/Card-Sticker SVG/sticker-smiley.svg",
    title: "visit the store",
    detail: STORE.area,
    href: "#visit",
    color: "var(--color-lightgreen)",
    tilt: "-1.5deg",
  },
];

type Errors = Partial<Record<"name" | "email" | "message" | "orderNumber" | "company" | "form", string>>;


export default function ContactPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  useScrollReveal(pageRef);

  const [topic, setTopic] = useState<TopicId>("general");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errors, setErrors] = useState<Errors>({});
  const [successMsg, setSuccessMsg] = useState("");
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);

  // Free the preview's object URL when it's replaced or the page unmounts.
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  // After a failed send, take the visitor to the first thing to fix (once
  // React has rendered the error state, so the field is marked invalid).
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (status === "error") formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [status, errors]);

  const [mapReady, setMapReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(`${STORE.name}, ${STORE.address}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the address is still selectable text */
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("sending");
    setErrors({});
    const form = e.currentTarget;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "";

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: field("name"),
          email: field("email"),
          message: field("message"),
          topic,
          orderNumber: topic === "order" ? field("orderNumber") : undefined,
          company: topic === "wholesale" ? field("company") : undefined,
          hasPhoto: topic === "hi" && Boolean(photo),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(data.errors || { form: data.error || "Something went wrong." });
        setStatus("error");
        return;
      }
      setSuccessMsg(data.message);
      setStatus("success");
      form.reset();
      setTopic("general");
      setPhoto(null);
    } catch {
      setErrors({ form: "Network hiccup, please try again." });
      setStatus("error");
    }
  };

  const err = (key: keyof Errors) =>
    errors[key] ? (
      <span className="contact-error" id={`cf-${key}-error`}>
        {errors[key]}
      </span>
    ) : null;
  const invalid = (key: keyof Errors) =>
    errors[key] ? { "aria-invalid": true as const, "aria-describedby": `cf-${key}-error` } : {};

  return (
    <div className="cozy-page contact-page" ref={pageRef}>
      <SiteHeader />

      <section className="contact-hero">
        <span className="story-eyebrow cozy-fade-up cozy-delay-100">🐾 get in touch</span>
        <h1 className="story-title cozy-fade-up cozy-delay-200">
          let&apos;s talk <em>pets</em>
          <img
            className="story-title__sticker"
            src="/assets/Footer-Sticker SVG/footer-sticker-hands.svg"
            alt=""
            aria-hidden="true"
          />
        </h1>
        <p className="contact-hero__subtitle cozy-fade-up cozy-delay-300">
          Question about an order, a product, or just want to send a photo of your pet? We&apos;re all
          ears (and floppy ones at that).
        </p>
      </section>

      <section className="contact-body">
        <div className="contact-cards">
          {CONTACT_CARDS.map((card) => (
            <a
              key={card.title}
              href={card.href}
              className="sticker-card"
              data-reveal
              style={{ "--accent": card.color, "--tilt": card.tilt } as CSSProperties}
            >
              <img className="sticker-card__sticker" src={card.sticker} alt="" aria-hidden="true" />
              <span className="sticker-card__title">{card.title}</span>
              <span className="sticker-card__detail">{card.detail}</span>
              <IconArrowUpRight className="sticker-card__arrow" aria-hidden="true" />
            </a>
          ))}
          <p className="contact-hours" data-reveal>
We reply to messages within one business day.
          </p>
        </div>

        <div className="contact-form-wrap" data-reveal data-reveal-delay="0.1">
          {status === "success" ? (
            <div className="contact-success" role="status">
              <svg className="paw-stamp" viewBox="0 0 120 120" aria-hidden="true">
                <circle className="paw-stamp__ring" cx="60" cy="60" r="54" />
                <g className="paw-stamp__paw">
                  <ellipse cx="60" cy="72" rx="19" ry="16" />
                  <ellipse cx="36" cy="50" rx="8" ry="10" />
                  <ellipse cx="51" cy="37" rx="8" ry="10.5" />
                  <ellipse cx="69" cy="37" rx="8" ry="10.5" />
                  <ellipse cx="84" cy="50" rx="8" ry="10" />
                </g>
              </svg>
              <h2>message sent!</h2>
              <p>{successMsg}</p>
              <button className="cozy-btn-orange" onClick={() => setStatus("idle")}>
                send another
              </button>
            </div>
          ) : (
            <form ref={formRef} className="contact-form" onSubmit={onSubmit} noValidate>
              <div className="contact-field">
                <label htmlFor="cf-name">Your name</label>
                <input id="cf-name" name="name" type="text" autoComplete="name" {...invalid("name")} />
                {err("name")}
              </div>

              <div className="contact-field">
                <label htmlFor="cf-email">Email</label>
                <input id="cf-email" name="email" type="email" autoComplete="email" {...invalid("email")} />
                {err("email")}
              </div>

              <fieldset className="contact-field contact-field--topics">
                <legend>What&apos;s it about?</legend>
                <div className="contact-topics">
                  {TOPICS.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      className={`contact-topic ${topic === t.id ? "is-active" : ""}`}
                      aria-pressed={topic === t.id}
                      onClick={() => setTopic(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Extra fields slide in for the topics that need them. */}
              <div className="contact-extra" data-open={topic === "order" || undefined}>
                <div className="contact-extra__inner">
                  {topic === "order" && (
                    <div className="contact-field">
                      <label htmlFor="cf-order">Order number</label>
                      <input
                        id="cf-order"
                        name="orderNumber"
                        type="text"
                        autoCapitalize="characters"
                        spellCheck={false}
                        aria-invalid={errors.orderNumber ? true : undefined}
                        aria-describedby={errors.orderNumber ? "cf-order-hint cf-orderNumber-error" : "cf-order-hint"}
                      />
                      <span className="contact-hint" id="cf-order-hint">
                        It&apos;s on your receipt and starts with CP-
                      </span>
                      {err("orderNumber")}
                    </div>
                  )}
                </div>
              </div>

              <div className="contact-extra" data-open={topic === "wholesale" || undefined}>
                <div className="contact-extra__inner">
                  {topic === "wholesale" && (
                    <div className="contact-field">
                      <label htmlFor="cf-company">Shop or company name</label>
                      <input id="cf-company" name="company" type="text" autoComplete="organization" {...invalid("company")} />
                      {err("company")}
                    </div>
                  )}
                </div>
              </div>

              <div className="contact-extra" data-open={topic === "hi" || undefined}>
                <div className="contact-extra__inner">
                  {topic === "hi" && (
                    <div className="contact-field">
                      <span className="contact-label">Got a pet photo? (optional)</span>
                      <label className="photo-drop" data-has-photo={photo ? "" : undefined}>
                        <input
                          type="file"
                          accept="image/*"
                          className="visually-hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setPhoto({ url: URL.createObjectURL(file), name: file.name });
                          }}
                        />
                        {photo ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photo.url} alt={`Your photo: ${photo.name}`} className="photo-drop__preview" />
                            <span>what a cutie. tap to change</span>
                          </>
                        ) : (
                          <span>
                            <strong>choose a photo</strong> of your pet
                          </span>
                        )}
                      </label>
                      <span className="contact-hint">Demo store: the photo stays on your device.</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="contact-field">
                <label htmlFor="cf-message">Message</label>
                <textarea id="cf-message" name="message" rows={5} {...invalid("message")} />
                {err("message")}
              </div>

              {errors.form && <p className="contact-error">{errors.form}</p>}

              <button type="submit" className="cozy-btn-orange contact-submit" disabled={status === "sending"}>
                {status === "sending" ? "sending…" : "send message"}
                <IconArrowRight className="cozy-btn-orange__icon" />
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="contact-visit" id="visit" aria-labelledby="visit-title">
        <div className="contact-visit__head" data-reveal>
          <span className="story-eyebrow">📍 visit us</span>
          <h2 id="visit-title" className="story-title story-title--section">
            come say hi <em>in person</em>
          </h2>
        </div>

        <div className="contact-visit__layout">
          <div className="store-card" data-reveal>
            <h3 className="store-card__name">{STORE.name}</h3>
            <a className="store-card__rating" href={STORE.mapsUrl} target="_blank" rel="noopener noreferrer">
              <IconStar aria-hidden="true" />
              <strong>{STORE.google.rating}</strong>
              <span>
                on Google · {STORE.google.reviews} reviews
                <span className="visually-hidden"> (opens Google Maps)</span>
              </span>
            </a>
            <p className="store-card__intro">Dogs and cats welcome inside (obviously). Come say hi.</p>

            <dl className="store-card__details">
              <div className="store-card__row">
                <dt>
                  <IconMapPin aria-hidden="true" />
                  <span>Address</span>
                </dt>
                <dd>
                  <address>
                    {STORE.addressLines.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </address>
                  <button type="button" className="store-card__copy" onClick={copyAddress}>
                    {copied ? <IconCheck aria-hidden="true" /> : <IconCopy aria-hidden="true" />}
                    {copied ? "copied" : "copy address"}
                  </button>
                  <span className="visually-hidden" role="status">
                    {copied ? "Address copied" : ""}
                  </span>
                </dd>
              </div>
              <div className="store-card__row">
                <dt>
                  <IconPhone aria-hidden="true" />
                  <span>Phone</span>
                </dt>
                <dd>
                  <a className="store-card__phone" href={STORE.phoneHref}>
                    {STORE.phone}
                  </a>
                </dd>
              </div>
            </dl>

            <div className="store-card__actions">
              <a className="cozy-btn-orange store-card__cta" href={STORE.mapsUrl} target="_blank" rel="noopener noreferrer">
                get directions <IconArrowUpRight className="cozy-btn-orange__icon" aria-hidden="true" />
                <span className="visually-hidden"> (opens Google Maps)</span>
              </a>
              <a className="store-card__call" href={STORE.phoneHref}>
                <IconPhone aria-hidden="true" /> call the store
              </a>
            </div>
          </div>

          <div className="contact-map" data-state={mapReady ? "ready" : "idle"}>
            {/* Shown until the embed has loaded. */}
            <div className="contact-map__placeholder" aria-hidden="true">
              <span className="contact-map__pin" />
              <p>loading the map…</p>
            </div>
            <ContactMap onReady={() => setMapReady(true)} />
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
