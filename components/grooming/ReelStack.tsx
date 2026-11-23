"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";
import SmartImage from "@/components/SmartImage";
import { instagramEmbedUrl, instagramPermalink } from "@/lib/grooming/instagram";
import type { GroomingVideo } from "@/lib/grooming/types";
import { useIdleReady } from "@/lib/hooks/useIdleReady";

gsap.registerPlugin(ScrollTrigger);

/**
 * One Reel. Nothing from Instagram loads until the visitor presses play
 * (privacy + speed); then Instagram's own embed page is shown in an iframe.
 * A private or deleted Reel can't be detected from outside the iframe, so the
 * "Watch on Instagram" link is always there.
 */
export function ReelCard({ video, index }: { video: GroomingVideo; index: number }) {
  const [playing, setPlaying] = useState(false);
  const permalink = instagramPermalink(video.kind, video.shortcode);
  return (
    <article className="gr-reel" aria-labelledby={`gr-reel-${video.id}`} data-index={index}>
      <div className="gr-reel__media">
        {playing ? (
          <iframe
            className="gr-reel__frame"
            src={instagramEmbedUrl(video.kind, video.shortcode)}
            title={`Instagram video: ${video.title}`}
            loading="lazy"
            allow="encrypted-media; picture-in-picture; clipboard-write"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
          />
        ) : (
          <button type="button" className="gr-reel__facade" onClick={() => setPlaying(true)} aria-label={`Play video: ${video.title} (loads Instagram)`}>
            {video.coverSrc ? (
              <SmartImage src={video.coverSrc} alt="" width={600} height={750} sizes="(max-width: 768px) 80vw, 360px" loading="lazy" />
            ) : (
              <span className="gr-reel__placeholder" aria-hidden="true">
                <span className="gr-reel__paw">🐾</span>
                <span className="gr-reel__ph-name">{video.petName ?? "The Nuzz Story"}</span>
              </span>
            )}
            <span className="gr-reel__play" aria-hidden="true" />
            <span className="gr-reel__ig" aria-hidden="true">
              Reel
            </span>
          </button>
        )}
      </div>
      <div className="gr-reel__caption">
        <h3 id={`gr-reel-${video.id}`}>{video.title}</h3>
        {(video.petName || video.breed) && (
          <p className="gr-reel__pet">
            {video.petName}
            {video.petName && video.breed ? " · " : ""}
            {video.breed}
          </p>
        )}
        {video.description && <p className="gr-reel__desc">{video.description}</p>}
        {video.testimonial && <blockquote className="gr-reel__quote">“{video.testimonial}”</blockquote>}
        <a className="gr-reel__link" href={permalink} target="_blank" rel="noopener noreferrer">
          {playing ? "Video not loading? Open it on Instagram ↗" : "Watch on Instagram ↗"}
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      </div>
    </article>
  );
}

/**
 * "A Store Built for Happy Pets." Desktop (motion allowed): the section pins
 * and each Reel card slides up over the previous one. Phones: a swipeable
 * row. Reduced motion: a plain grid. Hidden when there are no videos.
 */
export default function ReelStack({ videos }: { videos: GroomingVideo[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const ready = useIdleReady();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!ready || videos.length < 2 || !sectionRef.current || !stackRef.current) return;
    const mm = gsap.matchMedia(sectionRef);
    mm.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
      const cards = gsap.utils.toArray<HTMLElement>(".gr-reel", stackRef.current);
      sectionRef.current?.setAttribute("data-stacked", "");
      gsap.set(cards.slice(1), { yPercent: 115, opacity: 0 });
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: () => `+=${(cards.length - 1) * window.innerHeight * 0.7}`,
          pin: true,
          pinType: "transform",
          scrub: 0.6,
          invalidateOnRefresh: true,
          onUpdate: (self) => setActive(Math.min(cards.length - 1, Math.round(self.progress * (cards.length - 1)))),
        },
      });
      cards.forEach((card, i) => {
        if (i === 0) return;
        tl.to(card, { yPercent: 0, opacity: 1, duration: 1 }, i - 1);
        tl.to(cards.slice(0, i), { scale: (j: number) => 1 - (i - j) * 0.05, y: (j: number) => -(i - j) * 18, filter: "brightness(0.85)", duration: 1 }, i - 1);
      });
      return () => sectionRef.current?.removeAttribute("data-stacked");
    });
    return () => mm.revert();
  }, [ready, videos.length]);

  if (videos.length === 0) return null;
  return (
    <section className="gr-section gr-reels" ref={sectionRef} aria-labelledby="gr-reels-title">
      <div className="gr-reels__inner">
        <div className="gr-reels__intro">
          <p className="gr-eyebrow">On Instagram</p>
          <h2 id="gr-reels-title" className="gr-title">
            A store built for <em>happy pets.</em>
          </h2>
          <p className="gr-section__lead">Real grooming sessions from our store. Tap a video to play it.</p>
          {videos.length > 1 && (
            <ol className="gr-reels__dots" aria-hidden="true">
              {videos.map((v, i) => (
                <li key={v.id} data-active={i === active || undefined} />
              ))}
            </ol>
          )}
        </div>
        <div className="gr-reels__stack" ref={stackRef}>
          {videos.map((v, i) => (
            <ReelCard key={v.id} video={v} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
