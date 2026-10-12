"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

function PawGlyph() {
  return (
    <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <ellipse cx="256" cy="352" rx="120" ry="96" />
      <ellipse cx="118" cy="220" rx="52" ry="70" />
      <ellipse cx="212" cy="140" rx="48" ry="66" />
      <ellipse cx="300" cy="140" rx="48" ry="66" />
      <ellipse cx="394" cy="220" rx="52" ry="70" />
    </svg>
  );
}

/* ── Brand-flat animal glyphs ──────────────────────────────────────────────
   Each animal nests: .animal__click > .animal__pose > .animal__bob so the CSS
   can drive bounce / hover-reaction / body-bob on separate wrappers, while
   legs + tail carry their own keyframes. Dog faces right, cat faces left.    */

function DogGlyph() {
  return (
    <div className="animal__click">
      <div className="animal__pose">
        <div className="animal__bob">
          <svg viewBox="0 0 200 130" aria-hidden="true">
            <rect
              className="animal__leg animal__leg--b"
              x="60"
              y="80"
              width="13"
              height="36"
              rx="6"
              fill="#e5ad00"
            />
            <rect
              className="animal__leg animal__leg--a"
              x="128"
              y="80"
              width="13"
              height="36"
              rx="6"
              fill="#e5ad00"
            />
            <path
              className="animal__tail"
              d="M44 60 C24 52 18 40 22 30 C30 40 40 46 50 52 Z"
              fill="var(--color-orange)"
            />
            <rect
              x="42"
              y="46"
              width="112"
              height="46"
              rx="23"
              fill="var(--color-orange)"
            />
            <circle cx="164" cy="54" r="25" fill="var(--color-orange)" />
            <path
              d="M150 34 q-6 -16 8 -18 q2 12 -2 22 Z"
              fill="var(--color-orange)"
            />
            <rect x="180" y="52" width="18" height="16" rx="7" fill="#e5ad00" />
            <circle cx="170" cy="50" r="3.4" fill="#3a1608" />
            <circle cx="195" cy="58" r="2.6" fill="#3a1608" />
            <rect
              className="animal__leg animal__leg--a"
              x="74"
              y="80"
              width="14"
              height="38"
              rx="7"
              fill="#c99700"
            />
            <rect
              className="animal__leg animal__leg--b"
              x="140"
              y="80"
              width="14"
              height="38"
              rx="7"
              fill="#c99700"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

function CatGlyph() {
  return (
    <div className="animal__click">
      <div className="animal__pose">
        <div className="animal__bob">
          <svg viewBox="0 0 200 130" aria-hidden="true">
            <rect
              className="animal__leg animal__leg--b"
              x="128"
              y="82"
              width="11"
              height="34"
              rx="5"
              fill="#6f8ce0"
            />
            <rect
              className="animal__leg animal__leg--a"
              x="66"
              y="82"
              width="11"
              height="34"
              rx="5"
              fill="#6f8ce0"
            />
            <path
              className="animal__tail"
              d="M156 66 C182 62 186 40 176 26 C190 40 190 66 168 78 Z"
              fill="var(--color-lightblue)"
            />
            <rect
              x="54"
              y="52"
              width="104"
              height="38"
              rx="19"
              fill="var(--color-lightblue)"
            />
            <circle cx="52" cy="58" r="22" fill="var(--color-lightblue)" />
            <path d="M36 40 L30 20 L48 34 Z" fill="var(--color-lightblue)" />
            <path d="M60 36 L64 16 L74 38 Z" fill="var(--color-lightblue)" />
            <circle cx="46" cy="56" r="3" fill="#20305e" />
            <circle cx="36" cy="60" r="2" fill="#20305e" />
            <rect
              className="animal__leg animal__leg--a"
              x="78"
              y="82"
              width="12"
              height="36"
              rx="6"
              fill="#4b69f0"
            />
            <rect
              className="animal__leg animal__leg--b"
              x="114"
              y="82"
              width="12"
              height="36"
              rx="6"
              fill="#4b69f0"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

function BirdGlyph() {
  return (
    <svg viewBox="0 0 62 46" aria-hidden="true">
      <ellipse cx="31" cy="26" rx="15" ry="10" fill="var(--color-pink)" />
      <circle cx="46" cy="20" r="7" fill="var(--color-pink)" />
      <path d="M52 18 l8 -2 l-7 5 Z" fill="var(--color-orange)" />
      <circle cx="47" cy="19" r="1.6" fill="#5a2740" />
      <path
        className="dio-bird__wing dio-bird__wing--left"
        d="M28 24 L6 12 L26 28 Z"
        fill="#e79ff2"
      />
      <path
        className="dio-bird__wing dio-bird__wing--right"
        d="M34 24 L56 12 L36 28 Z"
        fill="#e79ff2"
      />
    </svg>
  );
}

function TreesGlyph() {
  return (
    <svg
      viewBox="0 0 1200 300"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <path
        className="tree-fill--back"
        d="M0 300 V170 Q90 120 180 165 Q250 90 340 150 Q430 100 520 160 Q640 110 760 160 Q880 110 1000 165 Q1100 130 1200 170 V300 Z"
      />
      <path
        className="tree-fill"
        d="M0 300 V210 Q120 170 250 205 Q360 160 480 205 Q600 165 720 205 Q850 165 980 205 Q1100 175 1200 210 V300 Z"
      />
      <circle className="tree-fill" cx="150" cy="205" r="52" />
      <circle className="tree-fill" cx="470" cy="200" r="60" />
      <circle className="tree-fill" cx="820" cy="205" r="50" />
      <circle className="tree-fill" cx="1080" cy="210" r="46" />
    </svg>
  );
}

/* Deterministic (SSR-safe) scene data */
const CLOUDS = [1, 2, 3, 4];
const PAW_PRINTS = Array.from({ length: 7 }, (_, i) => ({
  id: i,
  left: 8 + i * 12,
  delay: i * 0.6,
  flip: i % 2 === 0,
}));
const STARS = Array.from({ length: 26 }, (_, i) => ({
  id: i,
  left: (i * 53.13) % 100,
  top: (i * 29.7 + 3) % 46,
  delay: (i % 6) * 0.5,
}));

export default function VimeoHero({ onAnimalClick } = {}) {
  const iframeRef = useRef(null);
  const playerRef = useRef(null);
  const bubbleRef = useRef(null);
  const titleRef = useRef(null);
  const controlsRef = useRef(null);
  const sceneRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  /* Diorama state: night flag (auto by clock) + per-animal click bounce.
     Both start at their SSR-safe defaults and are corrected on the client. */
  const [isNight, setIsNight] = useState(false);
  const [bounced, setBounced] = useState({});

  useEffect(() => {
    const applyTime = () => {
      const h = new Date().getHours();
      setIsNight(h < 6 || h >= 18);
    };
    applyTime();
    const id = setInterval(applyTime, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY || window.pageYOffset || 0;
      scene.style.setProperty("--p-sky", `${y * 0.08}px`);
      scene.style.setProperty("--p-clouds", `${y * 0.18}px`);
      scene.style.setProperty("--p-trees", `${y * 0.34}px`);
      scene.style.setProperty("--p-ground", `${y * 0.52}px`);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const activateAnimal = (category) => {
    setBounced((b) => ({ ...b, [category]: true }));
    window.setTimeout(
      () => setBounced((b) => ({ ...b, [category]: false })),
      600,
    );
    onAnimalClick?.(category);
  };

  const animalKeyDown = (category) => (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      activateAnimal(category);
    }
  };

  useEffect(() => {
    const bubble = bubbleRef.current;
    const hero = playerRef.current;
    const title = titleRef.current;
    const controls = controlsRef.current;
    if (!bubble || !hero) return;

    const xTo = gsap.quickTo(bubble, "x", { duration: 0.5, ease: "power3" });
    const yTo = gsap.quickTo(bubble, "y", { duration: 0.5, ease: "power3" });

    const onMove = (e) => {
      xTo(e.clientX + 13);
      yTo(e.clientY - 43);
    };

    const onEnter = () => {
      gsap.killTweensOf(bubble, "opacity,scale,rotation");
      gsap.to(bubble, {
        opacity: 1,
        scale: 1,
        rotation: 0,
        duration: 1.7,
        delay: 0.05,
        ease: "elastic.out(1, 0.4)",
      });
    };

    const onLeave = () => {
      gsap.killTweensOf(bubble, "opacity,scale,rotation");
      gsap.to(bubble, {
        opacity: 0,
        scale: 0,
        rotation: -30,
        duration: 0.3,
        ease: "sine.inOut",
      });
    };

    const hideBubbleForElement = () => {
      gsap.killTweensOf(bubble, "opacity,scale,rotation");
      gsap.to(bubble, {
        opacity: 0,
        scale: 0,
        rotation: -30,
        duration: 0.3,
        ease: "sine.inOut",
      });
    };

    const showBubbleForElement = () => {
      gsap.killTweensOf(bubble, "opacity,scale,rotation");
      gsap.to(bubble, {
        opacity: 1,
        scale: 1,
        rotation: 0,
        duration: 0.3,
        ease: "sine.inOut",
      });
    };

    const onTitleEnter = () => {
      hideBubbleForElement();
      if (controls)
        gsap.to(controls, { opacity: 0, duration: 0.3, pointerEvents: "none" });
    };

    const onTitleLeave = () => {
      showBubbleForElement();
      if (controls)
        gsap.to(controls, { opacity: 1, duration: 0.3, pointerEvents: "auto" });
    };

    window.addEventListener("mousemove", onMove);
    hero.addEventListener("mouseenter", onEnter);
    hero.addEventListener("mouseleave", onLeave);

    if (title) {
      title.addEventListener("mouseenter", onTitleEnter);
      title.addEventListener("mouseleave", onTitleLeave);
    }
    if (controls) {
      controls.addEventListener("mouseenter", hideBubbleForElement);
      controls.addEventListener("mouseleave", showBubbleForElement);
    }

    return () => {
      window.removeEventListener("mousemove", onMove);
      hero.removeEventListener("mouseenter", onEnter);
      hero.removeEventListener("mouseleave", onLeave);

      if (title) {
        title.removeEventListener("mouseenter", onTitleEnter);
        title.removeEventListener("mouseleave", onTitleLeave);
      }
      if (controls) {
        controls.removeEventListener("mouseenter", hideBubbleForElement);
        controls.removeEventListener("mouseleave", showBubbleForElement);
      }
    };
  }, []);

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (!iframeRef.current) return;
    if (isPlaying) {
      iframeRef.current.pause();
    } else {
      iframeRef.current.play();
    }
    setIsPlaying((p) => !p);
  };

  const toggleMute = (e) => {
    if (e) e.stopPropagation();
    if (!iframeRef.current) return;
    iframeRef.current.muted = !isMuted;
    setIsMuted((m) => !m);
  };

  const toggleFullscreen = (e) => {
    if (e) e.stopPropagation();
    if (!document.fullscreenElement) {
      playerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <>
      <div
        ref={bubbleRef}
        className={`vimeo-mute-bubble ${isMuted ? "is--muted" : "is--unmuted"}`}
        style={{ pointerEvents: "none" }}
      >
        <div className="vimeo-mute-bubble__blob">
          <img
            src="/assets/VimeoHero SVG/mute-bubble-blob.svg"
            alt=""
            className="vimeo-mute-bubble__blob-svg"
          />
          <div className="vimeo-mute-bubble__icon vimeo-mute-bubble__mute">
            <svg
              viewBox="0 0 54 54"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12.3818 8.50039C12.8934 7.92803 13.7447 7.84041 14.3584 8.26992C14.3696 8.28308 14.3799 8.29711 14.3916 8.30996L14.501 8.41738L52.001 41.9174L52.1201 42.0141C52.6204 42.5885 52.6243 43.4317 52.1182 43.9984C51.6007 44.5775 50.7353 44.6609 50.1201 44.2143L50.001 44.1176L44.999 39.6488C44.2681 40.687 43.4506 41.6601 42.5557 42.5551C41.9699 43.1407 41.0203 43.1408 40.4346 42.5551C39.8493 41.9693 39.8492 41.0197 40.4346 40.434C41.2902 39.5783 42.0647 38.6412 42.7451 37.6361L37.8271 33.2416C37.2776 34.1931 36.6101 35.068 35.8389 35.8393C35.2532 36.4247 34.3035 36.4246 33.7178 35.8393C33.1321 35.2534 33.132 34.3029 33.7178 33.7172C34.452 32.9828 35.0644 32.1286 35.5273 31.1879L29 25.3559V43.4994C28.9999 44.0475 28.7004 44.5517 28.2197 44.8148C27.7389 45.0778 27.1531 45.0583 26.6914 44.7631L14.6846 37.0785C14.6042 37.0272 14.5104 36.9995 14.415 36.9994H8.5C6.56706 36.9994 5.0001 35.4323 5 33.4994V20.4994C5.00017 18.5666 6.56711 16.9994 8.5 16.9994H14.415C14.5105 16.9994 14.6042 16.9718 14.6846 16.9203L17.5225 15.1029L12.501 10.6176L12.3916 10.5102C11.8788 9.94899 11.8646 9.07956 12.3818 8.50039Z"
                fill="currentColor"
              />
              <path
                d="M40.4346 11.4428C41.0203 10.8572 41.9699 10.8573 42.5557 11.4428C46.5351 15.4222 48.9998 20.924 49 26.9984C49 29.5023 48.5806 31.909 47.8096 34.1518L45.3447 31.9506C45.7703 30.3718 46 28.712 46 26.9984C45.9998 21.7516 43.8744 17.0037 40.4346 13.5639C39.8492 12.9782 39.8492 12.0285 40.4346 11.4428Z"
                fill="currentColor"
              />
              <path
                d="M33.7178 18.1615C34.3035 17.576 35.2531 17.576 35.8389 18.1615C38.0388 20.3616 39.4237 23.3831 39.4961 26.725L35.8018 23.4242C35.3201 22.2398 34.6083 21.1732 33.7178 20.2826C33.1321 19.6968 33.132 18.7472 33.7178 18.1615Z"
                fill="currentColor"
              />
              <path
                d="M26.6914 9.23574C27.153 8.94049 27.7389 8.92026 28.2197 9.18301C28.7004 9.44611 28.9999 9.95137 29 10.4994V17.348L22.7451 11.7602L26.6914 9.23574Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div className="vimeo-mute-bubble__icon vimeo-mute-bubble__unmute">
            <svg
              viewBox="0 0 54 54"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M29 10.5C29 9.95184 28.701 9.44732 28.2202 9.18416C27.7392 8.921 27.1532 8.9411 26.6914 9.2366L14.6843 16.9211C14.6039 16.9726 14.5103 17 14.4148 17H8.5C6.567 17 5 18.567 5 20.5V33.5C5 35.433 6.567 37 8.5 37H14.4148C14.5103 37 14.6039 37.0274 14.6843 37.0788L26.6914 44.7634C27.1532 45.0588 27.7392 45.079 28.2202 44.8158C28.701 44.5526 29 44.0482 29 43.5V10.5Z"
                fill="currentColor"
              />
              <path
                d="M40.435 11.4432C41.0208 10.8575 41.9704 10.8575 42.5562 11.4432C46.5358 15.4228 49 20.9249 49 26.9996C49 33.0744 46.5358 38.5764 42.5562 42.556C41.9704 43.1418 41.0208 43.1418 40.435 42.556C39.8492 41.9702 39.8492 41.0204 40.435 40.4346C43.875 36.9946 46 32.2468 46 26.9996C46 21.7525 43.875 17.0045 40.435 13.5646C39.8492 12.9788 39.8492 12.029 40.435 11.4432Z"
                fill="currentColor"
              />
              <path
                d="M35.8388 18.162C35.253 17.5762 34.3032 17.5762 33.7174 18.162C33.1316 18.7478 33.1316 19.6975 33.7174 20.2833C35.4382 22.0041 36.5 24.377 36.5 27.0008C36.5 29.6246 35.4382 31.9976 33.7174 33.7184C33.1316 34.3042 33.1316 35.2538 33.7174 35.8396C34.3032 36.4254 35.253 36.4254 35.8388 35.8396C38.0992 33.5792 39.5 30.4522 39.5 27.0008C39.5 23.5494 38.0992 20.4224 35.8388 18.162Z"
                fill="currentColor"
              />
            </svg>
          </div>
        </div>
      </div>

      <div
        className={`vimeo-hero ${isPlaying ? "is-playing" : "is-paused"} ${isMuted ? "is-muted" : "is-unmuted"}`}
        ref={playerRef}
        onClick={toggleMute}
      >
        <div
          className={`anim-hero ${isNight ? "is-night" : "is-day"}`}
          ref={sceneRef}
        >
          <div className="dio-layer dio-sky" aria-hidden="true">
            <div className="dio-celestial" />
            {STARS.map((s) => (
              <span
                key={s.id}
                className="dio-star"
                style={{
                  left: `${s.left}%`,
                  top: `${s.top}%`,
                  animationDelay: `${s.delay}s`,
                }}
              />
            ))}
          </div>

          <div className="dio-layer dio-clouds" aria-hidden="true">
            {CLOUDS.map((n) => (
              <span key={n} className={`dio-cloud dio-cloud--${n}`} />
            ))}
          </div>

          <div className="dio-layer dio-trees" aria-hidden="true">
            <TreesGlyph />
          </div>

          <div className="dio-layer dio-ground" aria-hidden="true">
            <div className="dio-path" />
          </div>

          <div className="dio-foreground">
            <div className="dio-bird" aria-hidden="true">
              <BirdGlyph />
            </div>

            {PAW_PRINTS.map((p) => (
              <span
                key={p.id}
                className="dio-paw"
                aria-hidden="true"
                style={{
                  left: `${p.left}%`,
                  animationDelay: `${p.delay}s`,
                  transform: p.flip ? "scaleX(-1)" : "none",
                }}
              >
                <PawGlyph />
              </span>
            ))}

            <div
              className={`animal animal--dog ${bounced.dogs ? "is-bounced" : ""}`}
              role="button"
              tabIndex={0}
              aria-label="Playful dog — shop for dogs"
              onClick={(e) => {
                e.stopPropagation();
                activateAnimal("dogs");
              }}
              onKeyDown={animalKeyDown("dogs")}
            >
              <DogGlyph />
            </div>

            <div
              className={`animal animal--cat ${bounced.cats ? "is-bounced" : ""}`}
              role="button"
              tabIndex={0}
              aria-label="Strolling cat — shop for cats"
              onClick={(e) => {
                e.stopPropagation();
                activateAnimal("cats");
              }}
              onKeyDown={animalKeyDown("cats")}
            >
              <CatGlyph />
            </div>
          </div>
        </div>

        {/*
                  Video Placeholder:
                  The animated scene above stands in for a video (loads instantly,
                  loops forever, no licensing). When you have a real video file in
                  `public/`, uncomment below and it will layer on top of the scene.
                */}
        {/*
        <video
          ref={iframeRef}
          src="/your-personal-video.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="vimeo-hero__iframe"
          style={{ objectFit: "cover", backgroundColor: "transparent" }}
        />
        */}

        <div className="vimeo-hero__fade" />

        <div className="home-header__title">
          <h1
            className="vimeo-hero__title"
            ref={titleRef}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="vimeo-hero__word">we </span>

            <span className="vimeo-hero__word is--relative">
              <span>make </span>
              <div className="home-header__smiley">
                <img
                  src="/assets/VimeoHero SVG/smiley-face.svg"
                  alt=""
                  className="home-header__smiley-svg"
                />
              </div>
            </span>

            <span className="vimeo-hero__word">
              <em>shopping </em>
            </span>

            <span className="vimeo-hero__word">fun </span>

            <div style={{ flexBasis: "100%", height: 0 }} />

            <span className="vimeo-hero__word">for </span>
            <span className="vimeo-hero__word">your </span>

            <span className="vimeo-hero__word is--relative">
              <div className="home-header__star">
                <div className="home-header__star-inner">
                  <img
                    src="/assets/VimeoHero SVG/pink-star.svg"
                    alt=""
                    className="home-header__star-svg"
                  />
                </div>
              </div>
              <img
                src="/assets/VimeoHero SVG/oval-underline.svg"
                alt=""
                className="home-header__title-line-svg"
              />
              <span>pet</span>
            </span>
          </h1>
        </div>

        <div
          className="vimeo-hero__controls"
          ref={controlsRef}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="vimeo-hero__btn"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M5.5 5.125H8.5C8.70711 5.125 8.875 5.29289 8.875 5.5V18.5C8.875 18.7071 8.70711 18.875 8.5 18.875H5.5C5.29289 18.875 5.125 18.7071 5.125 18.5V5.5C5.125 5.29289 5.29289 5.125 5.5 5.125Z"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeMiterlimit="10"
                />
                <path
                  d="M15.5 5.125H18.5C18.7071 5.125 18.875 5.29289 18.875 5.5V18.5C18.875 18.7071 18.7071 18.875 18.5 18.875H15.5C15.2929 18.875 15.125 18.7071 15.125 18.5V5.5C15.125 5.29289 15.2929 5.125 15.5 5.125Z"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeMiterlimit="10"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 12V5.20128C6 4.37664 6.89256 3.86113 7.60685 4.27322L19.3914 11.072C20.1061 11.4843 20.1061 12.5158 19.3914 12.9281L7.60685 19.7269C6.89256 20.139 6 19.6234 6 18.7988V12Z"
                  stroke="currentColor"
                  strokeWidth="1.33929"
                  strokeMiterlimit="10"
                />
              </svg>
            )}
          </button>

          <button
            className="vimeo-hero__btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {!isFullscreen ? (
              <svg viewBox="0 0 20 20" fill="none">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M2.5 3.95833C2.5 3.15292 3.15292 2.5 3.95833 2.5H6.875C7.22017 2.5 7.5 2.77983 7.5 3.125C7.5 3.47017 7.22017 3.75 6.875 3.75H3.95833C3.84327 3.75 3.75 3.84327 3.75 3.95833V6.875C3.75 7.22017 3.47017 7.5 3.125 7.5C2.77983 7.5 2.5 7.22017 2.5 6.875V3.95833ZM12.5 3.125C12.5 2.77983 12.7798 2.5 13.125 2.5H16.0417C16.8471 2.5 17.5 3.15292 17.5 3.95833V6.875C17.5 7.22017 17.2202 7.5 16.875 7.5C16.5298 7.5 16.25 7.22017 16.25 6.875V3.95833C16.25 3.84327 16.1567 3.75 16.0417 3.75H13.125C12.7798 3.75 12.5 3.47017 12.5 3.125ZM3.125 12.5C3.47017 12.5 3.75 12.7798 3.75 13.125V16.0417C3.75 16.1567 3.84327 16.25 3.95833 16.25H6.875C7.22017 16.25 7.5 16.5298 7.5 16.875C7.5 17.2202 7.22017 17.5 6.875 17.5H3.95833C3.15292 17.5 2.5 16.8471 2.5 16.0417V13.125C2.5 12.7798 2.77983 12.5 3.125 12.5ZM16.875 12.5C17.2202 12.5 17.5 12.7798 17.5 13.125V16.0417C17.5 16.8471 16.8471 17.5 16.0417 17.5H13.125C12.7798 17.5 12.5 17.2202 12.5 16.875C12.5 16.5298 12.7798 16.25 13.125 16.25H16.0417C16.1567 16.25 16.25 16.1567 16.25 16.0417V13.125C16.25 12.7798 16.5298 12.5 16.875 12.5Z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none">
                <path
                  d="M6.04167 7.5C6.84708 7.5 7.5 6.84708 7.5 6.04167L7.5 3.125C7.5 2.77983 7.22017 2.5 6.875 2.5C6.52982 2.5 6.25 2.77983 6.25 3.125L6.25 6.04167C6.25 6.15673 6.15672 6.25 6.04167 6.25L3.125 6.25C2.77983 6.25 2.5 6.52983 2.5 6.875C2.5 7.22018 2.77983 7.5 3.125 7.5L6.04167 7.5Z"
                  fill="currentColor"
                />
                <path
                  d="M16.875 7.5C17.2202 7.5 17.5 7.22017 17.5 6.875C17.5 6.52982 17.2202 6.25 16.875 6.25L13.9583 6.25C13.8433 6.25 13.75 6.15673 13.75 6.04167L13.75 3.125C13.75 2.77983 13.4702 2.5 13.125 2.5C12.7798 2.5 12.5 2.77983 12.5 3.125L12.5 6.04167C12.5 6.84708 13.1529 7.5 13.9583 7.5L16.875 7.5Z"
                  fill="currentColor"
                />
                <path
                  d="M12.5 16.875C12.5 17.2202 12.7798 17.5 13.125 17.5C13.4702 17.5 13.75 17.2202 13.75 16.875L13.75 13.9583C13.75 13.8433 13.8433 13.75 13.9583 13.75L16.875 13.75C17.2202 13.75 17.5 13.4702 17.5 13.125C17.5 12.7798 17.2202 12.5 16.875 12.5L13.9583 12.5C13.1529 12.5 12.5 13.1529 12.5 13.9583L12.5 16.875Z"
                  fill="currentColor"
                />
                <path
                  d="M6.25 16.875C6.25 17.2202 6.52982 17.5 6.875 17.5C7.22017 17.5 7.5 17.2202 7.5 16.875L7.5 13.9583C7.5 13.1529 6.84708 12.5 6.04167 12.5L3.125 12.5C2.77982 12.5 2.5 12.7798 2.5 13.125C2.5 13.4702 2.77982 13.75 3.125 13.75L6.04167 13.75C6.15672 13.75 6.25 13.8433 6.25 13.9583L6.25 16.875Z"
                  fill="currentColor"
                />
              </svg>
            )}
          </button>
        </div>

      </div>
    </>
  );
}
