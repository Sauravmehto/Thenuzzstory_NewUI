"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import AnimatedPrice from "@/components/AnimatedPrice";
import { useAccount } from "@/lib/account";
import { STORE } from "@/lib/contact-places";
import { findBreed, OTHER_BREED_ID, type Breed } from "@/lib/grooming/breeds";
import { SELECT_EVENT, type SelectDetail } from "@/lib/grooming/events";
import { formatSlot } from "@/lib/grooming/messages";
import { formatRupees } from "@/lib/grooming/money";
import { estimate, priceFor, servicesFor, sizeBandFor, slotsNeeded } from "@/lib/grooming/pricing";
import type { Estimate, GroomingService, PricingConfig, SizeBand, Species } from "@/lib/grooming/types";
import { COAT_LABEL, COATS, validateContact, validatePet, type BookingErrors, type BookingField, type BookingRequest } from "@/lib/grooming/validation";
import { whatsappUrl } from "@/lib/whatsapp-order";
import AvailabilityCalendar, { type LoadDays } from "./AvailabilityCalendar";
import BreedCombobox from "./BreedCombobox";

type Step = 1 | 2 | 3 | 4;
const STEPS: Step[] = [1, 2, 3, 4];

interface Success {
  bookingId: string;
  statusUrl: string | null;
  whatsappUrl: string;
  estimate: Estimate | null;
  slot: { date: string; start: string };
  petName: string;
  services: string;
}

const STEP_OF: Record<BookingField, Step> = {
  species: 1,
  petName: 1,
  breed: 1,
  breedOther: 1,
  ageText: 1,
  weightKg: 1,
  sizeBand: 1,
  coat: 1,
  mainId: 2,
  extraIds: 2,
  slot: 3,
  name: 4,
  phone: 4,
  whatsapp: 4,
  email: 4,
  notes: 4,
};

const STEP_TITLES: Record<Step, string> = { 1: "Your pet", 2: "Service & estimate", 3: "Date & time", 4: "Your details" };

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function coatFromBreed(b: Breed): string {
  if (!b.coat) return "";
  return b.coat === "wire" || b.coat === "curly" ? "other" : b.coat;
}

export default function BookingFlow({ pricing, bookingEnabled, maxDaysAhead }: { pricing: PricingConfig; bookingEnabled: boolean; maxDaysAhead: number }) {
  const { status: accountStatus, openPanel } = useAccount();
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const [step, setStep] = useState<Step>(1);
  const [reached, setReached] = useState<Step>(1);

  // pet
  const [species, setSpecies] = useState<Species>("dog");
  const [petName, setPetName] = useState("");
  const [breedId, setBreedId] = useState("");
  const [breedOther, setBreedOther] = useState("");
  const [weightText, setWeightText] = useState("");
  const [manualBand, setManualBand] = useState<SizeBand | "">("");
  const [coat, setCoat] = useState("");
  const [ageText, setAgeText] = useState("");
  // service
  const [mainId, setMainId] = useState("");
  const [extraIds, setExtraIds] = useState<string[]>([]);
  // when
  const [slot, setSlot] = useState<{ date: string; start: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // you
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [waSame, setWaSame] = useState(true);
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  const [errors, setErrors] = useState<BookingErrors>({});
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [slotNeedsRefresh, setSlotNeedsRefresh] = useState(false);
  const [serverEstimate, setServerEstimate] = useState<Estimate | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<Success | null>(null);
  const submitLock = useRef(false);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const headingRefs = useRef<Partial<Record<Step, HTMLHeadingElement | null>>>({});

  // ---- derived -------------------------------------------------------------------
  const weightKg = useMemo(() => {
    const n = Number(weightText.replace(",", "."));
    return weightText.trim() && Number.isFinite(n) && n > 0 ? n : null;
  }, [weightText]);
  const sizeBand: SizeBand | null = species === "dog" ? (weightKg ? sizeBandFor(weightKg, pricing.sizeBands) : manualBand || null) : null;
  const services = useMemo(() => servicesFor(pricing, species), [pricing, species]);
  const popularServiceIds = useMemo(() => new Set(services.slice(0, 3).map((s) => s.id)), [services]);
  const main = services.find((s) => s.id === mainId);
  const extras = services.filter((s) => s.role === "main_or_extra" && s.id !== mainId);
  const selection = { species, sizeBand, mainId, extraIds };
  const result = mainId ? estimate(selection, pricing) : null;
  const shownEstimate: Estimate | null = serverEstimate !== undefined ? serverEstimate : result?.kind === "estimate" ? result.estimate : null;
  const slotsForSelection = mainId ? slotsNeeded({ mainId, extraIds }, pricing) : null;
  const onlineOpen = bookingEnabled && slotsForSelection !== null;
  const breed = breedId ? findBreed(species, breedId) : undefined;
  const sectionTitle = (s: GroomingService) => pricing.sections.find((x) => x.id === s.sectionId)?.title ?? "";
  const suggestLongCoat = coat === "long";

  // A different price basis invalidates a server-provided estimate.
  useEffect(() => setServerEstimate(undefined), [mainId, extraIds, sizeBand, species]);

  // ---- "Book this" from the price list ------------------------------------------
  useEffect(() => {
    const onSelect = (e: Event) => {
      const { serviceId, species: sp } = (e as CustomEvent<SelectDetail>).detail;
      if (sp !== species) {
        setSpecies(sp);
        setBreedId("");
        setManualBand("");
      }
      setMainId(serviceId);
      setExtraIds((x) => x.filter((id) => id !== serviceId));
      setSuccess(null);
      const chosen = pricing.services.find((s) => s.id === serviceId)?.name ?? "Service";
      if (petReady.current && sp === species) {
        setNotice({ tone: "info", text: `${chosen} selected.` });
        setStep(2);
        setReached((r) => (r < 2 ? 2 : r));
      } else {
        setNotice({ tone: "info", text: `${chosen} selected. Tell us about your pet to see the price.` });
        setStep(1);
      }
    };
    window.addEventListener(SELECT_EVENT, onSelect);
    return () => window.removeEventListener(SELECT_EVENT, onSelect);
  }, [species, pricing.services]);

  // Move focus to the step that just opened (not on first render: that would scroll the page).
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    const heading = headingRefs.current[step];
    heading?.focus({ preventScroll: true });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading?.closest(".gr-step")?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [step]);

  // ---- step navigation ------------------------------------------------------------
  const go = (s: Step) => {
    setStep(s);
    setReached((r) => (s > r ? s : r));
  };

  const petErrors = (): BookingErrors => {
    const e = validatePet({ species, name: petName, breedId, breedOther, ageText, weightKg: weightText.trim() ? (weightKg ?? -1) : null, sizeBand: manualBand || null, coat });
    if (species === "dog" && !weightKg && !manualBand && !e.weightKg) e.weightKg = "Enter your dog's weight (roughly is fine), or pick a size below.";
    return e;
  };

  const petReady = useRef(false);
  petReady.current = Object.keys(petErrors()).length === 0;

  const next1 = () => {
    const e = petErrors();
    setErrors(e);
    if (Object.keys(e).length) return focusFirstError(e);
    setNotice(null);
    go(2);
  };
  const next2 = () => {
    if (!main) {
      setErrors({ mainId: "Choose a service." });
      return;
    }
    setErrors({});
    go(3);
  };
  const next3 = () => {
    if (!slot) {
      setErrors({ slot: "Pick a date and a time." });
      return;
    }
    setErrors({});
    go(4);
  };

  function focusFirstError(e: BookingErrors) {
    const order: BookingField[] = ["species", "petName", "breed", "breedOther", "weightKg", "sizeBand", "ageText", "mainId", "slot", "name", "phone", "whatsapp", "email", "notes"];
    const first = order.find((f) => e[f]);
    if (!first) return;
    const target = STEP_OF[first];
    if (target !== step) setStep(target);
    requestAnimationFrame(() => document.getElementById(id(first))?.focus());
  }

  const stepHasError = (s: Step) =>
    Object.entries(errors).some(([field, message]) => Boolean(message) && STEP_OF[field as BookingField] === s);

  const loadDays: LoadDays = useCallback(
    async (from, to) => {
      const qs = new URLSearchParams({ from, to, main: mainId, extras: extraIds.join(",") });
      try {
        const res = await fetch(`/api/grooming/availability?${qs}`, { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as {
          ok: boolean;
          open?: boolean;
          days?: { date: string; starts: string[] }[];
          slotStates?: Record<string, { time: string; status: "available" | "booked" | "unavailable"; taken: number; capacity: number }[]>;
          message?: string;
        } | null;
        if (!data?.ok) return { error: data?.message ?? "We couldn't load the calendar." };
        return { open: !!data.open, days: data.days ?? [], slotStates: data.slotStates ?? {} };
      } catch {
        return { error: "We couldn't reach the store. Check your connection." };
      }
    },
    [mainId, extraIds],
  );

  // ---- submit ---------------------------------------------------------------------
  const submit = async () => {
    if (submitLock.current) return;
    if (accountStatus !== "signedIn") {
      setNotice({ tone: "error", text: "Please sign in first, then send your booking request." });
      openPanel("signin");
      return;
    }
    const contactErrors = validateContact({ name, phone, whatsapp: waSame ? "" : whatsapp, email }, notes);
    const all = { ...petErrors(), ...contactErrors, ...(slot ? {} : { slot: "Pick a date and a time." }) };
    setErrors(all);
    if (Object.keys(all).length) return focusFirstError(all);

    const body: BookingRequest = {
      pet: { species, name: petName, breedId, breedOther: breedId === OTHER_BREED_ID ? breedOther : undefined, ageText, weightKg, sizeBand: manualBand || null, coat: coat || undefined },
      selection: { mainId, extraIds },
      slot: slot!,
      customer: { name, phone, whatsapp: waSame ? "" : whatsapp, email },
      notes,
      seen: { estimate: shownEstimate },
      website,
    };
    const payload = JSON.stringify(body);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: newKey() };

    submitLock.current = true;
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch("/api/grooming/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.current.key },
        body: payload,
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (data?.ok) {
        const booking = data.booking as { bookingId: string; estimate: Estimate | null; appointment: { date: string; start: string } };
        setSuccess({
          bookingId: booking.bookingId,
          statusUrl: (data.statusUrl as string | null) ?? null,
          whatsappUrl: data.whatsappUrl as string,
          estimate: booking.estimate,
          slot: booking.appointment,
          petName,
          services: [main?.name, ...extraIds.map((x) => pricing.services.find((s) => s.id === x)?.name)].filter(Boolean).join(" + "),
        });
        attempt.current = null;
        requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ block: "start" }));
        return;
      }
      const code = data?.code as string | undefined;
      const message = (data?.message as string) ?? "Something went wrong. Please try again.";
      if (code === "slot_unavailable") {
        setSlot(null);
        setSlotNeedsRefresh(true);
        setReloadKey((k) => k + 1);
        setStep(3);
        setNotice({ tone: "error", text: "That slot got booked just now. Pick another one - your details are safe." });
      } else if (code === "quote_changed") {
        const fresh = (data?.estimate as Estimate | null) ?? null;
        setServerEstimate(fresh);
        setNotice({
          tone: "info",
          text: `Prices just updated: your estimate is now ${fresh ? formatRupees(fresh.totalCents) : "a custom quote"}${shownEstimate ? ` (was ${formatRupees(shownEstimate.totalCents)})` : ""}. Please review and send again.`,
        });
      } else if (code === "validation" && data?.errors) {
        const e = data.errors as BookingErrors;
        setErrors(e);
        focusFirstError(e);
      } else if (code === "unauthorized") {
        setNotice({ tone: "error", text: "Please sign in first, then send your booking request." });
        openPanel("signin");
      } else {
        setNotice({ tone: "error", text: message });
      }
    } catch {
      setNotice({ tone: "error", text: "We couldn't reach the store, so your request wasn't sent. Check your connection and try again." });
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const reset = () => {
    setSuccess(null);
    setPetName("");
    setBreedId("");
    setBreedOther("");
    setWeightText("");
    setManualBand("");
    setCoat("");
    setAgeText("");
    setMainId("");
    setExtraIds([]);
    setSlot(null);
    setSlotNeedsRefresh(false);
    setNotes("");
    setErrors({});
    setStep(1);
    setReached(1);
  };

  // ---- render helpers ----------------------------------------------------------------
  const err = (f: BookingField) =>
    errors[f] ? (
      <p className="gr-field__error" id={`${id(f)}-error`}>
        {errors[f]}
      </p>
    ) : null;
  const describedBy = (f: BookingField, hint?: string) => [errors[f] ? `${id(f)}-error` : null, hint].filter(Boolean).join(" ") || undefined;

  const callMessage = `Hi The Nuzz Story, I'd like to book ${main?.name ?? "grooming"}${petName ? ` for ${petName}` : ""}${breed ? ` (${breed.id === OTHER_BREED_ID ? breedOther || "breed not listed" : breed.name})` : ""}.`;

  if (success) {
    return (
      <section className="gr-section gr-book" id="book" ref={sectionRef} aria-labelledby="gr-book-done">
        <div className="gr-done">
          <div className="gr-done__seal" aria-hidden="true">
            ✓
          </div>
          <h2 id="gr-book-done" className="gr-title gr-title--light" tabIndex={-1} ref={(el) => el?.focus()}>
            Request received!
          </h2>
          <p className="gr-done__lead">Your request is in! Our team will call you shortly to confirm your appointment.</p>
          <dl className="gr-done__facts">
            <div>
              <dt>Booking ID</dt>
              <dd>
                <code>{success.bookingId}</code>
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className="gr-status gr-status--pending">Pending confirmation</span>
              </dd>
            </div>
            <div>
              <dt>Pet</dt>
              <dd>{success.petName}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{success.services}</dd>
            </div>
            <div>
              <dt>Requested time</dt>
              <dd>{formatSlot(success.slot)}</dd>
            </div>
            <div>
              <dt>Estimate</dt>
              <dd>{success.estimate ? `${formatRupees(success.estimate.totalCents)} (confirmed on the call)` : "We'll quote it on the call"}</dd>
            </div>
          </dl>
          <p className="gr-done__note">This time is not final yet - we&apos;ll call you soon to confirm it.</p>
          <div className="gr-done__actions">
            {success.statusUrl && (
              <a className="gr-btn gr-btn--amber" href={success.statusUrl}>
                View request status
              </a>
            )}
            <a className="gr-btn gr-btn--ghost-light" href={success.whatsappUrl} target="_blank" rel="noopener noreferrer">
              Send details on WhatsApp<span className="visually-hidden"> (opens WhatsApp)</span>
            </a>
            <button type="button" className="gr-link gr-link--light" onClick={reset}>
              Book for another pet
            </button>
          </div>
          {success.statusUrl && <p className="gr-done__keep">Keep the status link: it&apos;s private to you.</p>}
        </div>
      </section>
    );
  }

  const stepHeader = (s: Step, summary?: React.ReactNode) => (
    <div className="gr-step__head">
      <span className="gr-step__num" aria-hidden="true">
        {s < step || (s < reached && s !== step) ? "✓" : s}
      </span>
      <h3
        className="gr-step__title"
        tabIndex={-1}
        ref={(el) => {
          headingRefs.current[s] = el;
        }}
      >
        <span className="visually-hidden">Step {s} of 4: </span>
        {STEP_TITLES[s]}
      </h3>
      {s !== step && summary && <p className="gr-step__summary">{summary}</p>}
      {s !== step && s <= reached && (
        <button type="button" className="gr-link" onClick={() => setStep(s)}>
          Edit<span className="visually-hidden"> {STEP_TITLES[s]}</span>
        </button>
      )}
    </div>
  );

  return (
    <section className="gr-section gr-book" id="book" ref={sectionRef} aria-labelledby="gr-book-title">
      <div className="gr-section__head">
        <p className="gr-eyebrow gr-eyebrow--light">Book an appointment</p>
        <h2 id="gr-book-title" className="gr-title gr-title--light">
          Book in <em>4 easy steps.</em>
        </h2>
        <p className="gr-section__lead gr-section__lead--light">Tell us about your floof, pick a service, choose a time, and send your request.</p>
      </div>
      <ol className="gr-progress" aria-label="Booking progress">
        {STEPS.map((s) => {
          const status = s < step ? "done" : s === step ? "current" : "upcoming";
          return (
            <li key={s} className="gr-progress__item">
              <button
                type="button"
                className="gr-progress__button"
                data-status={status}
                data-error={stepHasError(s) || undefined}
                aria-current={s === step ? "step" : undefined}
                disabled={s > reached}
                onClick={() => s <= reached && setStep(s)}
              >
                <span className="gr-progress__dot" aria-hidden="true">
                  {status === "done" ? "✓" : s}
                </span>
                <span className="gr-progress__label">{STEP_TITLES[s]}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="gr-book__layout">
        <div className="gr-book__steps">
          {notice && (
            <p className={`gr-notice gr-notice--${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
              {notice.text}
            </p>
          )}

          {/* ---- 1. pet ---- */}
          <div className="gr-step" data-state={step === 1 ? "open" : "closed"} data-has-error={stepHasError(1) || undefined}>
            {stepHeader(1, petName ? `${petName}${breed ? `, ${breed.id === OTHER_BREED_ID ? breedOther : breed.name}` : ""}${sizeBand ? `, ${pricing.sizeBands.find((b) => b.id === sizeBand)?.label}` : ""}` : null)}
            {step === 1 && (
              <div className="gr-step__body">
                <fieldset className="gr-field">
                  <legend>Your pet is a</legend>
                  <div className="gr-choice gr-choice--two" id={id("species")}>
                    {(["dog", "cat"] as const).map((s) => (
                      <label key={s} className="gr-choice__opt">
                        <input
                          type="radio"
                          name={id("species-radio")}
                          checked={species === s}
                          onChange={() => {
                            setSpecies(s);
                            setBreedId("");
                            setManualBand("");
                            if (main && !main.species.includes(s)) setMainId("");
                          }}
                        />
                        <span>
                          <span className="gr-choice__emoji" aria-hidden="true">
                            {s === "dog" ? "🐶" : "🐱"}
                          </span>
                          {s === "dog" ? "Dog" : "Cat"}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="gr-field">
                  <label htmlFor={id("petName")}>Pet&apos;s name</label>
                  <input id={id("petName")} value={petName} onChange={(e) => setPetName(e.target.value)} autoComplete="off" maxLength={40} aria-invalid={!!errors.petName || undefined} aria-describedby={describedBy("petName")} />
                  {err("petName")}
                </div>

                <div className="gr-field">
                  <label htmlFor={id("breed")}>Breed</label>
                  <BreedCombobox
                    key={species}
                    inputId={id("breed")}
                    species={species}
                    value={breedId}
                    error={errors.breed}
                    onChange={(b) => {
                      setBreedId(b.id);
                      if (!coat) setCoat(coatFromBreed(b));
                      if (species === "dog" && !weightKg && b.typicalSize && b.typicalSize !== "varies") setManualBand(b.typicalSize);
                    }}
                  />
                  {err("breed")}
                </div>

                {breedId === OTHER_BREED_ID && (
                  <div className="gr-field">
                    <label htmlFor={id("breedOther")}>Which breed?</label>
                    <input id={id("breedOther")} value={breedOther} onChange={(e) => setBreedOther(e.target.value)} maxLength={60} aria-invalid={!!errors.breedOther || undefined} aria-describedby={describedBy("breedOther")} />
                    {err("breedOther")}
                  </div>
                )}

                {species === "dog" && (
                  <div className="gr-field-row">
                    <div className="gr-field">
                      <label htmlFor={id("weightKg")}>
                        Weight <span className="gr-field__opt">(kg, roughly is fine)</span>
                      </label>
                      <input
                        id={id("weightKg")}
                        inputMode="decimal"
                        value={weightText}
                        onChange={(e) => setWeightText(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))}
                        aria-invalid={!!errors.weightKg || undefined}
                        aria-describedby={describedBy("weightKg", `${id("weightKg")}-hint`)}
                      />
                      <p className="gr-hint" id={`${id("weightKg")}-hint`}>
                        {weightKg && sizeBand ? `That's ${pricing.sizeBands.find((b) => b.id === sizeBand)?.label}.` : "Sets the size used for the price."}
                      </p>
                      {err("weightKg")}
                    </div>
                    {!weightKg && (
                      <fieldset className="gr-field">
                        <legend>
                          Not sure? Pick a size <span className="gr-field__opt">{breed?.typicalSize && breed.typicalSize !== "varies" ? "(typical for the breed)" : ""}</span>
                        </legend>
                        <div className="gr-chipset" id={id("sizeBand")}>
                          {pricing.sizeBands.map((b) => (
                            <label key={b.id} className="gr-chip-opt">
                              <input type="radio" name={id("band")} checked={manualBand === b.id} onChange={() => setManualBand(b.id)} />
                              <span>{b.label}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </div>
                )}

                <details className="gr-more-fields">
                  <summary>Add more details (optional)</summary>
                  <fieldset className="gr-field">
                    <legend>
                      Coat <span className="gr-field__opt">(optional)</span>
                    </legend>
                    <div className="gr-chipset">
                      {COATS.map((c) => (
                        <label key={c} className="gr-chip-opt">
                          <input type="radio" name={id("coat")} checked={coat === c} onChange={() => setCoat(c)} />
                          <span>{COAT_LABEL[c]}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="gr-field gr-field--narrow">
                    <label htmlFor={id("ageText")}>
                      Age <span className="gr-field__opt">(optional)</span>
                    </label>
                    <input id={id("ageText")} value={ageText} onChange={(e) => setAgeText(e.target.value)} maxLength={30} placeholder="e.g. 2 years" aria-invalid={!!errors.ageText || undefined} aria-describedby={describedBy("ageText")} />
                    {err("ageText")}
                  </div>
                </details>

                <div className="gr-step__actions">
                  <button type="button" className="gr-btn gr-btn--amber" onClick={next1}>
                    Continue to services
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---- 2. service ---- */}
          <div className="gr-step" data-state={step === 2 ? "open" : step < 2 && reached < 2 ? "locked" : "closed"} data-has-error={stepHasError(2) || undefined}>
            {stepHeader(2, main ? [main.name, ...extraIds.map((x) => pricing.services.find((s) => s.id === x)?.name)].filter(Boolean).join(" + ") : null)}
            {step === 2 && (
              <div className="gr-step__body">
                <fieldset className="gr-field">
                  <legend>Choose one main service</legend>
                  <p className="gr-hint">Most booked picks are tagged, so choosing is faster.</p>
                  {suggestLongCoat && <p className="gr-hint">Long coat? Our long-coat grooming + haircut packages are made for that.</p>}
                  <div className="gr-svc-pick" id={id("mainId")}>
                    {services.map((s) => {
                      const cents = priceFor(s.price, sizeBand);
                      const recommended = suggestLongCoat && s.id.includes("long-coat");
                      return (
                        <label key={s.id} className="gr-svc-opt" data-recommended={recommended || undefined}>
                          <input type="radio" name={id("main")} checked={mainId === s.id} onChange={() => {
                            setMainId(s.id);
                            setExtraIds((x) => x.filter((e) => e !== s.id));
                          }} />
                          <span className="gr-svc-opt__body">
                            <span className="gr-svc-opt__section">{sectionTitle(s)}</span>
                            <span className="gr-svc-opt__name">{s.name}</span>
                            {s.condition && <span className="gr-svc-opt__cond">{s.condition}</span>}
                            {recommended && <span className="gr-svc-opt__tag">Suggested for long coats</span>}
                            {popularServiceIds.has(s.id) && <span className="gr-svc-opt__tag">Most booked</span>}
                          </span>
                          <span className="gr-svc-opt__price">{cents !== null ? formatRupees(cents) : s.price.type === "by_size" ? "Add size" : "Ask us"}</span>
                        </label>
                      );
                    })}
                  </div>
                  {err("mainId")}
                </fieldset>

                {main && extras.length > 0 && (
                  <fieldset className="gr-field">
                    <legend>
                      Add extras <span className="gr-field__opt">(optional)</span>
                    </legend>
                    <div className="gr-extras">
                      {extras.map((s) => {
                        const cents = priceFor(s.price, sizeBand);
                        const on = extraIds.includes(s.id);
                        return (
                          <label key={s.id} className="gr-extra" data-on={on || undefined}>
                            <input type="checkbox" checked={on} onChange={() => setExtraIds((x) => (on ? x.filter((e) => e !== s.id) : [...x, s.id]))} />
                            <span className="gr-extra__name">{s.name}</span>
                            <span className="gr-extra__price">+{cents !== null ? formatRupees(cents) : "?"}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}

                {main && !onlineOpen ? (
                  <div className="gr-closed" role="status">
                    <p className="gr-closed__title">Online booking for this service opens soon.</p>
                    <p>Call or WhatsApp us and we&apos;ll book {petName || "your pet"} in. Your estimate is shown here.</p>
                    <div className="gr-step__actions">
                      <a className="gr-btn gr-btn--amber" href={STORE.phoneHref}>
                        Call {STORE.phone}
                      </a>
                      <a className="gr-btn gr-btn--ghost" href={whatsappUrl(callMessage)} target="_blank" rel="noopener noreferrer">
                        WhatsApp us<span className="visually-hidden"> (opens WhatsApp)</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="gr-step__actions">
                    <button type="button" className="gr-btn gr-btn--amber" onClick={next2} disabled={!main}>
                      Continue to date & time
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ---- 3. date & time ---- */}
          <div className="gr-step" data-state={step === 3 ? "open" : reached < 3 ? "locked" : "closed"} data-has-error={stepHasError(3) || undefined}>
            {stepHeader(3, slot ? formatSlot(slot) : null)}
            {step === 3 && (
              <div className="gr-step__body" id={id("slot")} tabIndex={-1}>
                <AvailabilityCalendar
                  loadDays={loadDays}
                  value={slot}
                  onChange={(nextSlot) => {
                    setSlot(nextSlot);
                    if (nextSlot) setSlotNeedsRefresh(false);
                  }}
                  maxDaysAhead={maxDaysAhead}
                  reloadKey={reloadKey}
                  label="Appointment date"
                />
                {slotNeedsRefresh && (
                  <div className="gr-retry-slot" role="status">
                    <p>We refreshed live slots. If your preferred time disappeared, pick another available one.</p>
                    <button type="button" className="gr-btn gr-btn--ghost gr-btn--sm" onClick={() => setReloadKey((k) => k + 1)}>
                      Reload times
                    </button>
                  </div>
                )}
                {err("slot")}
                <p className="gr-hint">This is a request. We hold it while our team calls to confirm.</p>
                <div className="gr-step__actions">
                  <button type="button" className="gr-btn gr-btn--amber" onClick={next3} disabled={!slot}>
                    Continue to your details
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---- 4. details ---- */}
          <div className="gr-step" data-state={step === 4 ? "open" : reached < 4 ? "locked" : "closed"} data-has-error={stepHasError(4) || undefined}>
            {stepHeader(4)}
            {step === 4 && (
              <form
                className="gr-step__body"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                {accountStatus !== "signedIn" && (
                  <div className="gr-login-need" role="status">
                    <p>Sign in to continue with booking. Your selected service and slot will stay here.</p>
                    <button type="button" className="gr-btn gr-btn--ghost gr-btn--sm" onClick={() => openPanel("signin")}>
                      Sign in
                    </button>
                  </div>
                )}
                <div className="gr-field-row">
                  <div className="gr-field">
                    <label htmlFor={id("name")}>Your full name</label>
                    <input id={id("name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} aria-invalid={!!errors.name || undefined} aria-describedby={describedBy("name")} />
                    {err("name")}
                  </div>
                  <div className="gr-field">
                    <label htmlFor={id("phone")}>Mobile number</label>
                    <input id={id("phone")} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel-national" aria-invalid={!!errors.phone || undefined} aria-describedby={describedBy("phone", `${id("phone")}-hint`)} />
                    <p className="gr-hint" id={`${id("phone")}-hint`}>
                      We&apos;ll call this number to confirm.
                    </p>
                    {err("phone")}
                  </div>
                </div>
                <label className="gr-check">
                  <input type="checkbox" checked={waSame} onChange={(e) => setWaSame(e.target.checked)} />
                  <span>My WhatsApp number is the same</span>
                </label>
                {!waSame && (
                  <div className="gr-field">
                    <label htmlFor={id("whatsapp")}>WhatsApp number</label>
                    <input id={id("whatsapp")} type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} aria-invalid={!!errors.whatsapp || undefined} aria-describedby={describedBy("whatsapp")} />
                    {err("whatsapp")}
                  </div>
                )}
                <div className="gr-field">
                  <label htmlFor={id("email")}>
                    Email <span className="gr-field__opt">(optional)</span>
                  </label>
                  <input id={id("email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!!errors.email || undefined} aria-describedby={describedBy("email")} />
                  {err("email")}
                </div>
                <div className="gr-field">
                  <label htmlFor={id("notes")}>
                    Anything we should know? <span className="gr-field__opt">(optional)</span>
                  </label>
                  <textarea id={id("notes")} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Allergies, nervous around dryers, matted coat…" aria-invalid={!!errors.notes || undefined} aria-describedby={describedBy("notes")} />
                  {err("notes")}
                </div>
                <div className="gr-hp" aria-hidden="true">
                  <label>
                    Website
                    <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </label>
                </div>
                <div className="gr-step__actions">
                  <button type="submit" className="gr-btn gr-btn--amber gr-btn--lg" disabled={submitting} aria-busy={submitting || undefined}>
                    {submitting ? (
                      <>
                        <span className="gr-spinner" aria-hidden="true" /> Sending request…
                      </>
                    ) : (
                      "Send booking request"
                    )}
                  </button>
                  <p className="gr-hint">Nothing is charged online. Your request is pending until we call to confirm.</p>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* ---- live estimate ---- */}
        <aside className="gr-estimate" aria-label="Your estimate">
          <p className="gr-estimate__label">Your estimate</p>
          {!main ? (
            <p className="gr-estimate__empty">Pick a service to see the price.</p>
          ) : (
            <>
              <ul className="gr-estimate__lines">
                {shownEstimate
                  ? shownEstimate.lines.map((l) => (
                      <li key={l.serviceId}>
                        <span>
                          {l.name}
                          {l.role === "extra" && <em> extra</em>}
                        </span>
                        <span>{formatRupees(l.cents)}</span>
                      </li>
                    ))
                  : [main, ...extraIds.map((x) => pricing.services.find((s) => s.id === x))].filter(Boolean).map((s) => (
                      <li key={s!.id}>
                        <span>{s!.name}</span>
                        <span>—</span>
                      </li>
                    ))}
              </ul>
              <div className="gr-estimate__total" aria-live="polite">
                <span>Estimated total</span>
                {shownEstimate ? <AnimatedPrice cents={shownEstimate.totalCents} format={formatRupees} className="gr-estimate__amount" /> : <strong>Custom quote</strong>}
              </div>
              <p className="gr-estimate__note">
                {shownEstimate
                  ? "From our price list. Final price is confirmed when we call you."
                  : result?.kind === "custom_quote"
                    ? result.reason
                    : "We'll quote this on the call."}
              </p>
              {sizeBand && main.price.type === "by_size" && <p className="gr-estimate__meta">Size: {pricing.sizeBands.find((b) => b.id === sizeBand)?.label}</p>}
              {slot && <p className="gr-estimate__meta">Requested: {formatSlot(slot)}</p>}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
