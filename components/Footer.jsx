"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { prefersReducedMotion } from "@/lib/motion";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SOCIAL_ICONS, WIGGLE_CONFIG } from "@/lib/data";
import { STORE } from "@/lib/contact-places";
import { useIdleReady } from "@/lib/hooks/useIdleReady";

function initWiggle(element, intensity) {
  // Looping wiggles are pure decoration: skip them for reduced-motion users.
  if (prefersReducedMotion()) return () => {};
  const target = element.querySelector("[data-wiggle-target]") || element;
  gsap.set(target, { transformOrigin: "center center" });
  let tween;
  const onEnter = () => {
    tween = gsap.to(target, {
      rotation: intensity,
      duration: 0.17,
      repeat: -1,
      yoyo: true,
      ease: "steps(1)",
    });
  };
  const onLeave = () => {
    if (tween) {
      tween.kill();
      gsap.to(target, { rotation: 0, duration: 0.3, ease: "power2.out" });
    }
  };
  element.addEventListener("mouseenter", onEnter);
  element.addEventListener("mouseleave", onLeave);
  return () => {
    element.removeEventListener("mouseenter", onEnter);
    element.removeEventListener("mouseleave", onLeave);
  };
}

export default function Footer() {
  // Below the fold: wire up animations once the browser is idle.
  const ready = useIdleReady();

  useEffect(() => {
    if (!ready) return;
    gsap.registerPlugin(ScrollTrigger);

    document.querySelectorAll(".footer-map-link").forEach((footerMapLink) => {
      const mapSvgPaths = footerMapLink.querySelectorAll(".draw-btn__svg path");
      mapSvgPaths.forEach((path) => {
        const length = path.getTotalLength();
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: 0 });
      });
      const onEnter = () =>
        gsap.fromTo(
          mapSvgPaths,
          { strokeDashoffset: (i, el) => el.getTotalLength() },
          {
            strokeDashoffset: 0,
            duration: 0.5,
            ease: "power2.out",
            stagger: 0.1,
            overwrite: true,
          },
        );
      const onLeave = () =>
        gsap.to(mapSvgPaths, {
          strokeDashoffset: 0,
          duration: 0.4,
          ease: "power2.out",
          overwrite: true,
        });
      footerMapLink.addEventListener("mouseenter", onEnter);
      footerMapLink.addEventListener("mouseleave", onLeave);
    });

    const creditsWrapper = document.querySelector(".footer-credits-wrapper");
    if (creditsWrapper) {
      const creditsBox = creditsWrapper.querySelector(".credits-box");
      const creditsItems = creditsBox.querySelectorAll(".credits-item");

      gsap.set(creditsBox, {
        visibility: "visible",
        width: "auto",
        height: "auto",
        opacity: 1,
      });
      const boxRect = creditsBox.getBoundingClientRect();
      const fullWidth = boxRect.width;
      const fullHeight = boxRect.height;
      const boxHeight = boxRect.height; // for text Y translation

      const creditsBtn = creditsWrapper.querySelector(".footer-credits");
      const startY = creditsBtn.offsetHeight + 15;

      gsap.set(creditsBox, {
        visibility: "hidden",
        width: 0,
        height: 0,
        opacity: 0,
        y: startY,
      });
      gsap.set(creditsItems, { y: boxHeight });

      const onEnter = () => {
        gsap.set(creditsBox, { visibility: "visible" });
        gsap.killTweensOf(creditsBox);
        gsap.killTweensOf(creditsItems);

        gsap.to(creditsBox, {
          width: fullWidth,
          height: fullHeight,
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: "power3.out",
        });

        gsap.to(creditsItems, {
          y: 0,
          duration: 0.5,
          stagger: 0.04,
          ease: "power3.out",
          delay: 0.1,
        });
      };

      const onLeave = () => {
        gsap.killTweensOf(creditsBox);
        gsap.killTweensOf(creditsItems);

        gsap.to(creditsBox, {
          width: 0,
          height: 0,
          opacity: 0,
          y: startY,
          duration: 0.35,
          ease: "power3.in",
          onComplete: () => gsap.set(creditsBox, { visibility: "hidden" }),
        });

        gsap.to(creditsItems, {
          y: boxHeight,
          duration: 0.4,
          ease: "power3.in",
          stagger: -0.03,
          delay: 0.1,
        });
      };

      creditsWrapper.addEventListener("mouseenter", onEnter);
      creditsWrapper.addEventListener("mouseleave", onLeave);
    }

    const footerStickers = gsap.utils.toArray(".footer-sticker");
    const reduceMotion = prefersReducedMotion();
    const stickerCleanups = [];
    const stickerRotations = [12, -10, 8, -12, 10, -8];
    gsap.set(footerStickers, {
      scale: 0,
      opacity: 0,
      transformOrigin: "center bottom",
    });
    footerStickers.forEach((sticker, i) =>
      gsap.set(sticker, {
        rotation: stickerRotations[i % stickerRotations.length],
      }),
    );

    gsap.to(footerStickers, {
      scale: 1,
      opacity: 1,
      // Reduced motion: stickers simply appear, no pop or bounce.
      ...(reduceMotion && { duration: 0, stagger: 0, ease: "none" }),
      rotation: (i) => stickerRotations[i % stickerRotations.length] * 0.7,
      duration: 0.7,
      ease: "back.out(1.7)",
      stagger: 0.12,
      scrollTrigger: {
        trigger: ".footer-stickers",
        start: "top 80%",
        toggleActions: "play none none reverse", // Play on enter, reverse on leave up
      },
    });

    footerStickers.forEach((sticker, i) => {
      if (reduceMotion) return; // no proximity "push" physics
      const baseRotation = stickerRotations[i % stickerRotations.length] * 0.7;
      const PROXIMITY_RADIUS = 180,
        STRENGTH = 4,
        MAX_PUSH = 55,
        MIN_SPEED = 3;
      let prevX = 0,
        prevY = 0;
      const clamp = (v, max) => Math.max(-max, Math.min(max, v));

      const onMove = (e) => {
        const dx = e.clientX - prevX,
          dy = e.clientY - prevY;
        prevX = e.clientX;
        prevY = e.clientY;
        const rect = sticker.getBoundingClientRect();
        const cx = rect.left + rect.width / 2,
          cy = rect.top + rect.height / 2;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        const onSticker =
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;
        const speed = Math.hypot(dx, dy);

        const isOverCreditsBox = e.target.closest(".credits-box") !== null;

        if (
          !onSticker &&
          !isOverCreditsBox &&
          dist < PROXIMITY_RADIUS &&
          speed > MIN_SPEED
        ) {
          const falloff = 1 - dist / PROXIMITY_RADIUS;
          const pushX = clamp(dx * STRENGTH * falloff, MAX_PUSH);
          const pushY = clamp(dy * STRENGTH * falloff, MAX_PUSH);
          gsap.killTweensOf(sticker);
          gsap.to(sticker, {
            x: pushX,
            y: pushY,
            rotation: baseRotation + pushX * 0.25,
            duration: 0.18,
            ease: "power3.out",
          });
          gsap.to(sticker, {
            x: 0,
            y: 0,
            rotation: baseRotation,
            duration: 1.1,
            ease: "elastic.out(1, 0.35)",
            delay: 0.18,
          });
        }
      };
      document.addEventListener("mousemove", onMove);
      stickerCleanups.push(() => document.removeEventListener("mousemove", onMove));
    });

    const wiggleTargets = [
      { selector: ".footer-column:first-child h3", key: "jobHeading" },
      { selector: ".footer-map-link span", key: "googleMap" },
      { selector: ".footer-email", key: "email" },
      { selector: ".footer-whatsapp", key: "whatsapp" },
      { selector: ".credits-name", key: "socials" }, // Added wiggle target for names using social intensity
    ];
    wiggleTargets.forEach(({ selector, key }) => {
      document
        .querySelectorAll(selector)
        .forEach((el) => stickerCleanups.push(initWiggle(el, WIGGLE_CONFIG[key])));
    });

    document
      .querySelectorAll(".single-social")
      .forEach((el) => stickerCleanups.push(initWiggle(el, WIGGLE_CONFIG.socials)));

    // Remove document listeners when the footer unmounts (client-side navigation).
    return () => stickerCleanups.forEach((fn) => fn());
  }, [ready]);

  return (
    <div className="footer-inner">
      <div className="footer-top">
        <div className="footer-column">
          <span className="footer-badge">hungry for something good?</span>
          <h3>treats your pet will love</h3>
          <a href="/shop" className="footer-map-link">
            <span>explore our favourite treats</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="100%"
              viewBox="0 0 169 10"
              fill="none"
              className="draw-btn__svg"
            >
              <path
                d="M1 6.5661C56.3941 3.06082 112.187 1.20095 168 0.999878"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.25"
              ></path>
              <path
                d="M32.1313 8.63371C68.2147 6.92799 104.462 6.13378 140.695 6.25107"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.25"
              ></path>
            </svg>
          </a>
        </div>
        <div className="footer-column">
          <span className="footer-badge">store</span>
          <address className="footer-address--full">
            {STORE.addressLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </address>
          <a href={STORE.mapsUrl} className="footer-map-link" target="_blank" rel="noopener noreferrer">
            <span>Get directions</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="100%"
              viewBox="0 0 169 10"
              fill="none"
              className="draw-btn__svg"
            >
              <path
                d="M1 6.5661C56.3941 3.06082 112.187 1.20095 168 0.999878"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.25"
              ></path>
              <path
                d="M32.1313 8.63371C68.2147 6.92799 104.462 6.13378 140.695 6.25107"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.25"
              ></path>
            </svg>
          </a>
        </div>
        <div className="footer-column">
          <span className="footer-badge">contact</span>
          <a href={STORE.phoneHref} className="footer-email footer-phone">
            {STORE.phone}
          </a>
          <a href="mailto:hello@thenuzzstory.co" className="footer-email">
            hello@thenuzzstory.co
          </a>
          <a href="#" className="footer-whatsapp">
            send us a whatsapp*
          </a>
          <p className="footer-note">
            *messages only: we reply within a day, usually with pet photos.
          </p>
          <div className="footer-socials" id="footer-socials">
            {SOCIAL_ICONS.map(({ href, label, svg }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="single-social w-inline-block"
                aria-label={label}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="footer-big-text">
          <img
            src="/assets/brand/thenuzzstory_logo.png"
            alt=""
            className="footer-big-text__logo"
            width={652}
            height={383}
          />
          <span>THE NUZZ STORY</span>
        </div>

        <div className="footer-stickers">
          <div className="footer-sticker sticker-smiley">
            <img
              loading="lazy"
              src="/assets/Footer-Sticker SVG/footer-sticker-smiley.svg"
              width="100%"
              alt=""
              data-scroll-animation-target=""
              aria-hidden="true"
            />
          </div>
          <div className="footer-sticker sticker-heart">
            <img
              loading="lazy"
              src="/assets/Footer-Sticker SVG/footer-sticker-heart.svg"
              width="100%"
              alt=""
              data-scroll-animation-target=""
              aria-hidden="true"
            />
          </div>
          <div className="footer-sticker sticker-hands">
            <img
              loading="lazy"
              src="/assets/Footer-Sticker SVG/footer-sticker-hands.svg"
              width="100%"
              alt=""
              data-scroll-animation-target=""
              aria-hidden="true"
            />
          </div>
          <div className="footer-sticker sticker-100">
            <img
              loading="lazy"
              src="/assets/Footer-Sticker SVG/footer-sticker-100.svg"
              width="100%"
              alt=""
              data-scroll-animation-target=""
              aria-hidden="true"
            />
          </div>
          <div className="footer-sticker sticker-camera">
            <img
              loading="lazy"
              src="/assets/Footer-Sticker SVG/footer-sticker-camera.svg"
              width="100%"
              alt=""
              aria-hidden="true"
            />
          </div>
          <div className="footer-sticker sticker-boom">
            <img
              loading="lazy"
              src="/assets/Footer-Sticker SVG/footer-sticker-boom.svg"
              width="100%"
              alt=""
              data-scroll-animation-target=""
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
