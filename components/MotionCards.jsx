"use client";

import gsap from "gsap";
import React, { useEffect, useRef } from "react";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import SmartImage from "@/components/SmartImage";
import { useIdleReady } from "@/lib/hooks/useIdleReady";

gsap.registerPlugin(InertiaPlugin, ScrollTrigger);

export default function MotionCards() {
  const sectionRef = useRef(null);
  const containerRef = useRef(null);

  // Below the fold: wire up animations once the browser is idle.
  const ready = useIdleReady();

  useEffect(() => {
    if (!ready) return;
    // Physics fling + scroll entrances are decorative. Under reduced motion
    // the cards simply render in place (the timeline below never sets them hidden).
    const mm = gsap.matchMedia(sectionRef);
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const cards = document.querySelectorAll(".motion-card__card");
      cards.forEach((card) => {
        let lastX = 0;
        let lastY = 0;
        let speedX = 0;
        let speedY = 0;

        const startRotation = gsap.getProperty(card, "rotation");
        const startX = gsap.getProperty(card, "x");
        const startY = gsap.getProperty(card, "y");

        const onMove = (e) => {
          speedX = e.clientX - lastX;
          speedY = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;
        };

        const onEnter = (e) => {
          speedX = 0;
          speedY = 0;
          lastX = e.clientX;
          lastY = e.clientY;
        };

        const onLeave = () => {
          gsap.to(card, {
            inertia: {
              x: { velocity: speedX * 20, end: startX },
              y: { velocity: speedY * 20, end: startY },
              rotation: { velocity: speedX * 1.5, end: startRotation },
            },
          });
        };

        card.addEventListener("mousemove", onMove);
        card.addEventListener("mouseenter", onEnter);
        card.addEventListener("mouseleave", onLeave);
      });

      const labels = document.querySelectorAll(".motion-card__floating-label");
      labels.forEach((label) => {
        let lastX = 0;
        let lastY = 0;
        let speedX = 0;
        let speedY = 0;

        const startRotation = gsap.getProperty(label, "rotation");
        const startX = gsap.getProperty(label, "x");
        const startY = gsap.getProperty(label, "y");

        const onMove = (e) => {
          speedX = e.clientX - lastX;
          speedY = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;
        };

        const onEnter = (e) => {
          speedX = 0;
          speedY = 0;
          lastX = e.clientX;
          lastY = e.clientY;
        };

        const onLeave = () => {
          gsap.to(label, {
            inertia: {
              x: { velocity: speedX * 25, end: startX },
              y: { velocity: speedY * 25, end: startY },
              rotation: { velocity: speedX * 2, end: startRotation },
            },
          });
        };

        label.addEventListener("mousemove", onMove);
        label.addEventListener("mouseenter", onEnter);
        label.addEventListener("mouseleave", onLeave);
      });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 70%",
          toggleActions: "play none none reverse",
        },
      });

      const topStickerImg = sectionRef.current.querySelector(
        ".motion-card__sticker--top img",
      );
      if (topStickerImg) {
        gsap.set(topStickerImg, { scale: 0, opacity: 0, rotation: -30 });
        tl.to(
          topStickerImg,
          {
            scale: 1,
            opacity: 1,
            rotation: 0,
            duration: 1.7,
            ease: "elastic.out(1, 0.4)",
          },
          0,
        );
      }

      const underlinePath = sectionRef.current.querySelector(
        ".motion-card__underline-path",
      );
      if (underlinePath) {
        const pathLen = underlinePath.getTotalLength();
        gsap.set(underlinePath, {
          strokeDasharray: pathLen,
          strokeDashoffset: pathLen,
        });
        tl.to(
          underlinePath,
          { strokeDashoffset: 0, duration: 1.5, ease: "power2.out" },
          0.2,
        );
      }
    });

    return () => mm.revert();
  }, [ready]);

  return (
    <section
      ref={sectionRef}
      className="motion-card-section"
      id="motion-card-section"
    >
      <div className="motion-card__heading">
        <h2 className="motion-card__title">
          a store built
          <br />
          for good pets.
        </h2>
        <p className="motion-card__subtitle">
          from pup &amp; kitten to senior.
          <span className="motion-card__sticker motion-card__sticker--top">
            <img
              loading="lazy"
              src="/assets/Footer-Sticker SVG/footer-sticker-hands.svg"
              alt="Green heart hands sticker"
              className="motion-card__sticker-img"
            />
          </span>
        </p>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          viewBox="0 0 634 28"
          fill="none"
          className="motion-card__underline-svg"
        >
          <path
            className="motion-card__underline-path"
            d="M2 26C41.0237 23.1556 79.9927 19.9419 118.634 15.5521C169.106 9.98633 227.314 2.42393 275.206 2C280.46 2.57436 264.768 4.99488 262.462 5.55556C257.837 6.43078 252.529 7.47009 247.317 8.59146C239.594 10.3556 212.496 15.8393 226.932 19.8051C239.594 22.6359 263.663 21.9521 280.978 21.3504C314.817 19.9829 349.311 16.7419 383.204 14.7863C465.931 9.5077 549.191 10.547 632 14.1436"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="motion-card__cards-area">
        <div className="motion-card__blob">
          <img
              loading="lazy"
            src="/assets/MotionCard SVG/motion-card-blob.svg"
            alt=""
            className="motion-card__blob-svg"
          />
        </div>

        <div ref={containerRef} className="motion-card__cards">
          <div className="motion-card__card motion-card__card--1">
            <div className="motion-card__card-image">
              <SmartImage
                src="/assets/pets/cover-image_1.png"
                loading="lazy"
                width={690}
                height={862}
                alt="Happy Birthday Poppins: Poppins the golden retriever, his little brother and his mum celebrating with a cake at The Nuzz Story"
                className="cover-image"
                sizes="(max-width: 768px) 150px, (max-width: 1024px) 22vw, min(17vw, 340px)"
              />
            </div>
          </div>

          <div className="motion-card__card motion-card__card--2">
            <div className="motion-card__card-image">
              <SmartImage
                src="/assets/pets/cover-image_2.png"
                loading="lazy"
                width={690}
                height={862}
                alt="Poppins and his biggest cheerleader: Poppins in birthday glasses next to his mum, with his cake"
                className="cover-image"
                sizes="(max-width: 768px) 150px, (max-width: 1024px) 22vw, min(17vw, 340px)"
              />
            </div>
          </div>

          <div className="motion-card__card motion-card__card--3">
            <div className="motion-card__card-image">
              <SmartImage
                src="/assets/pets/cover-image_3.png"
                loading="lazy"
                width={690}
                height={862}
                alt="Better together: Poppins hugging his mum in the store"
                className="cover-image"
                sizes="(max-width: 768px) 150px, (max-width: 1024px) 22vw, min(17vw, 340px)"
              />
            </div>
          </div>

          <div className="motion-card__card motion-card__card--4">
            <div className="motion-card__card-image">
              <SmartImage
                src="/assets/pets/cover-image_4.png"
                loading="lazy"
                width={690}
                height={862}
                alt="Today is all about him: Poppins in birthday glasses with his cake"
                className="cover-image"
                sizes="(max-width: 768px) 150px, (max-width: 1024px) 22vw, min(17vw, 340px)"
              />
            </div>
          </div>
        </div>

        <div ref={containerRef} className="motion-card__floating-labels">
          <div className="motion-card__floating-label motion-card__floating-label--pink">
            <p className="motion-card__floating-text">
              pets just wanna have fun!
            </p>
          </div>
          <div className="motion-card__floating-label motion-card__floating-label--orange">
            <p className="motion-card__floating-text">
              spoiled is not a dirty word
            </p>
          </div>
          <div className="motion-card__floating-label motion-card__floating-label--red">
            <p className="motion-card__floating-text">
              boring toys = old fashioned
            </p>
          </div>
        </div>
      </div>

      <div className="motion-card__footer-text">
        <p className="motion-card__description">
          To make a pet happy you need to know what makes them tick. We stock
          the whole spectrum — from crunchy treats to squeaky toys and from cozy
          beds to all-weather walking gear, for dogs and cats alike.
        </p>
      </div>
    </section>
  );
}
