"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const REEL_URL = "https://www.instagram.com/reel/DcgU1gRyi_z/";
const EMBED_URL = `${REEL_URL}embed/`;
const PREVIEW_SECONDS = 5;

/**
 * Play button for the "product review videos" card. Opens the Instagram reel
 * in a small player on the page, closes it after a 5 second preview, and
 * always offers the full reel on Instagram. Instagram controls its own embed,
 * so the preview is a timed window, not a guaranteed autoplay.
 */
export default function ReelPlayButton({ className, style, children }) {
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(PREVIEW_SECONDS);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Count down, then close on its own.
  useEffect(() => {
    if (!open) return;
    setLeft(PREVIEW_SECONDS);
    const tick = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    const stop = window.setTimeout(close, PREVIEW_SECONDS * 1000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(stop);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        style={style}
        aria-label="Play video"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div className="reel-modal" role="dialog" aria-modal="true" aria-label="Product review reel" onClick={close}>
            <div className="reel-modal__panel" onClick={(e) => e.stopPropagation()}>
              <iframe
                className="reel-modal__frame"
                src={EMBED_URL}
                title="Instagram reel"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                loading="eager"
              />
              <div className="reel-modal__bar">
                <span aria-live="off">closing in {left}s</span>
                <a href={REEL_URL} target="_blank" rel="noopener noreferrer">
                  watch full reel
                </a>
                <button ref={closeRef} type="button" onClick={close}>
                  close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
