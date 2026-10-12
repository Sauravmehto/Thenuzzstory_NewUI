"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes, type Ref } from "react";
import Image from "next/image";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  ref?: Ref<HTMLImageElement>;
  /** Rendered width at each breakpoint, so the browser picks a right-sized file. */
  sizes?: string;
};

/**
 * An <img> that fades in once it has loaded, over a shimmer placed
 * on its wrapper (see .img-slot in flow.css). No layout shift: callers pass
 * width/height. Falls back to a paw placeholder if the file fails to load.
 *
 * With width/height it renders next/image, which serves a resized AVIF/WebP
 * per screen size (a 390px phone no longer downloads the 800px original).
 * fetchPriority="high" maps to next/image's `priority` (preloaded LCP image).
 */
export default function SmartImage({ ref, onLoad, onError, ...props }: Props) {
  const localRef = useRef<HTMLImageElement | null>(null);
  // No state in the server HTML: before JS runs, images load and show
  // normally (so the main photo never waits on hydration to become visible).
  // After mount, anything still downloading fades in when it's ready.
  const [state, setState] = useState<"loading" | "loaded" | "error" | undefined>(undefined);

  useEffect(() => {
    const img = localRef.current;
    if (!img) return;
    if (img.complete) setState(img.naturalWidth > 0 ? "loaded" : "error");
    else setState("loading");
  }, [props.src]);

  const setRef = (node: HTMLImageElement | null) => {
    localRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLImageElement | null }).current = node;
  };

  const { src, alt = "", width, height, sizes, fetchPriority, loading, style, className } = props;
  if (typeof src === "string" && width && height) {
    return (
      <Image
        ref={setRef}
        src={src}
        alt={alt}
        width={Number(width)}
        height={Number(height)}
        sizes={sizes}
        priority={fetchPriority === "high"}
        loading={fetchPriority === "high" ? undefined : loading}
        style={style}
        className={className}
        data-img-state={state}
        onLoad={(e) => {
          setState("loaded");
          onLoad?.(e);
        }}
        onError={(e) => {
          setState("error");
          onError?.(e);
        }}
      />
    );
  }

  return (
    <img
      {...props}
      ref={setRef}
      data-img-state={state}
      decoding="async"
      onLoad={(e) => {
        setState("loaded");
        onLoad?.(e);
      }}
      onError={(e) => {
        setState("error");
        onError?.(e);
      }}
    />
  );
}
