"use client";

import React, { useEffect, useRef } from "react";

const EYEBROW_LABEL = "Perth and Boorloo Live Music";

function setMeasuredWidth(
  root: HTMLElement,
  propertyName: string,
  element: HTMLElement
) {
  const measuredWidth = Math.max(
    element.getBoundingClientRect().width,
    element.scrollWidth
  );

  if (measuredWidth > 0) {
    root.style.setProperty(propertyName, `${Math.ceil(measuredWidth)}px`);
  }
}

export function SiteHeaderEyebrow() {
  const rootRef = useRef<HTMLParagraphElement>(null);
  const perthMeasureRef = useRef<HTMLSpanElement>(null);
  const boorlooMeasureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const perthMeasure = perthMeasureRef.current;
    const boorlooMeasure = boorlooMeasureRef.current;

    if (!root || !perthMeasure || !boorlooMeasure) {
      return;
    }

    let cancelled = false;

    const syncMeasuredWidths = () => {
      if (cancelled) {
        return;
      }

      setMeasuredWidth(
        root,
        "--site-header-eyebrow-perth-width",
        perthMeasure
      );
      setMeasuredWidth(
        root,
        "--site-header-eyebrow-boorloo-width",
        boorlooMeasure
      );
    };

    syncMeasuredWidths();

    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } })
      .fonts;
    void fonts?.ready.then(syncMeasuredWidths).catch(() => {});

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncMeasuredWidths);

    resizeObserver?.observe(perthMeasure);
    resizeObserver?.observe(boorlooMeasure);
    window.addEventListener("resize", syncMeasuredWidths);

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncMeasuredWidths);
    };
  }, []);

  return (
    <p
      aria-label={EYEBROW_LABEL}
      className="site-header__eyebrow"
      ref={rootRef}
    >
      <span aria-hidden="true" className="site-header__eyebrow-location">
        <span className="site-header__eyebrow-word site-header__eyebrow-word--perth">
          Perth
        </span>
        <span className="site-header__eyebrow-word site-header__eyebrow-word--boorloo">
          Boorloo
        </span>
      </span>
      <span aria-hidden="true">Live</span>
      <span aria-hidden="true">Music</span>
      <span aria-hidden="true" className="site-header__eyebrow-measurements">
        <span
          className="site-header__eyebrow-measurement"
          ref={perthMeasureRef}
        >
          Perth
        </span>
        <span
          className="site-header__eyebrow-measurement"
          ref={boorlooMeasureRef}
        >
          Boorloo
        </span>
      </span>
    </p>
  );
}
