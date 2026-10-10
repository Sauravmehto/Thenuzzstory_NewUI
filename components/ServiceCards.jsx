"use client";

import { useEffect, useLayoutEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CARDS_DATA } from "@/lib/data";
import { useIdleReady } from "@/lib/hooks/useIdleReady";


const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;


const DESKTOP_MIN = 1441;

export default function ServiceCards() {
  // Below the fold: wire up animations once the browser is idle.
  const ready = useIdleReady();

  useIsomorphicLayoutEffect(() => {
    if (!ready) return;
    gsap.registerPlugin(ScrollTrigger);

    const mm = gsap.matchMedia();

    mm.add(
      {
        isDesktop: `(min-width: ${DESKTOP_MIN}px)`,
        reduceMotion: "(prefers-reduced-motion: reduce)",
      },
      (context) => {
        const { isDesktop, reduceMotion } = context.conditions;

        if (reduceMotion) {
          gsap.set(".title-underline-svg path", { strokeDashoffset: 0 });
          return;
        }

        gsap.to(".title-underline-svg path", {
          strokeDashoffset: 0,
          duration: 1.2,
          ease: "power3.out",
          stagger: 0.3,
          scrollTrigger: {
            trigger: ".title-container",
            start: "top 70%",
            once: true,
          },
        });

        if (isDesktop) return initDesktopHover();
      },
    );

    return () => mm.revert();
  }, [ready]);

  return (
    <>
      <div className="title-container">
        <h2 className="main-title">
          everything your pet <span className="italic-text">needs:</span>
        </h2>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="160"
          viewBox="0 0 159 17"
          fill="none"
          className="title-underline-svg"
        >
          <path
            d="M1 12.1515C53.0771 5.7187 105.529 2.30552 158 1.93652"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          ></path>
          <path
            d="M30.2672 15.9461C64.1899 12.8158 98.2663 11.3583 132.33 11.5735"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          ></path>
        </svg>
      </div>

      <div className="cards-wrapper" id="cards-wrapper">
        {CARDS_DATA.map((card) => (
          <div key={card.color} className={`card card-${card.color}`}>
            <div className={`card-sticker sticker-${card.sticker}`}>
              <img
                src={`/assets/Card-Sticker SVG/sticker-${card.sticker}.svg`}
                alt=""
                width="100%"
                loading="lazy"
                aria-hidden="true"
              />
            </div>
            <h3 className="card-title">{card.title}</h3>
            <svg
              width="100%"
              height="10"
              className="card-divider-svg"
              aria-hidden="true"
            >
              <use href="#card-divider" />
            </svg>
            <ul className="card-list">
              {card.services.map((service) => (
                <li key={service}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="13"
                    height="16"
                    className="services-card__bullet-svg"
                    aria-hidden="true"
                  >
                    <use href="#bullet-icon" />
                  </svg>
                  {service}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

function initDesktopHover() {
  const cards = gsap.utils.toArray(".card");
  if (!cards.length) return;

  const originalData = [
    { rotation: 4 },
    { rotation: -5 },
    { rotation: 5 },
    { rotation: -8 },
    { rotation: 5 },
  ];

  let leaveTimeout = null;
  const teardowns = [];

  cards.forEach((card, index) => {
    const onEnter = () => {
      if (leaveTimeout) {
        clearTimeout(leaveTimeout);
        leaveTimeout = null;
      }
      const hoverGap = 120;
      const clusterGap = 150;
      const cardWidth = 320;
      const hoveredLeft = cards[index].offsetLeft;
      const leftCards = [];
      const rightCards = [];

      cards.forEach((otherCard, otherIndex) => {
        if (otherIndex < index)
          leftCards.push({ card: otherCard, index: otherIndex });
        else if (otherIndex > index)
          rightCards.push({ card: otherCard, index: otherIndex });
      });

      const currentTop = cards[index].offsetTop;
      const targetCommonTop = 50;
      const moveY = targetCommonTop - currentTop;

      gsap.to(cards[index], {
        x: 0,
        y: moveY,
        rotation: 0,
        scale: 1.08,
        duration: 0.9,
        ease: "elastic.out(1, 0.5)",
        overwrite: true,
      });

      if (rightCards.length) {
        const clusterStart = hoveredLeft + cardWidth + hoverGap;
        rightCards.forEach((item, i) => {
          const targetAbsLeft = clusterStart + i * clusterGap;
          const targetX = Math.max(targetAbsLeft - item.card.offsetLeft, 10);
          const angleRad = originalData[item.index].rotation * (Math.PI / 180);
          const targetY = targetX * Math.tan(angleRad);
          gsap.to(item.card, {
            x: targetX,
            y: targetY,
            rotation: originalData[item.index].rotation,
            scale: 1,
            duration: 1.0,
            ease: "elastic.out(1, 0.5)",
            overwrite: true,
          });
        });
      }

      if (leftCards.length) {
        leftCards.reverse();
        const clusterStart = hoveredLeft - hoverGap - cardWidth;
        leftCards.forEach((item, i) => {
          const targetAbsLeft = clusterStart - i * clusterGap;
          const targetX = Math.min(targetAbsLeft - item.card.offsetLeft, -10);
          const angleRad = originalData[item.index].rotation * (Math.PI / 180);
          const targetY = targetX * Math.tan(angleRad);
          gsap.to(item.card, {
            x: targetX,
            y: targetY,
            rotation: originalData[item.index].rotation,
            scale: 1,
            duration: 1.0,
            ease: "elastic.out(1, 0.5)",
            overwrite: true,
          });
        });
      }
    };

    const onLeave = () => {
      leaveTimeout = setTimeout(() => {
        cards.forEach((c, i) => {
          gsap.to(c, {
            x: 0,
            y: 0,
            scale: 1,
            rotation: originalData[i].rotation,
            duration: 1.0,
            ease: "elastic.out(1, 0.5)",
            overwrite: true,
            zIndex: i + 1,
          });
        });
      }, 80);
    };

    card.addEventListener("mouseenter", onEnter);
    card.addEventListener("mouseleave", onLeave);
    teardowns.push(() => {
      card.removeEventListener("mouseenter", onEnter);
      card.removeEventListener("mouseleave", onLeave);
    });
  });

  return () => {
    if (leaveTimeout) clearTimeout(leaveTimeout);
    teardowns.forEach((teardown) => teardown());
  };
}
