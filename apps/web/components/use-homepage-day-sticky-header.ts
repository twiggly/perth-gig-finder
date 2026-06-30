"use client";

import { useEffect, useRef, useState } from "react";

type SetDateHeaderStuck = (isStuck: boolean) => void;

export const HOMEPAGE_DATE_HEADER_OBSERVER_THRESHOLDS: number[] = [0, 1];

export function getHomepageDateHeaderStuck(
  stickySentinelTop: number | null | undefined
) {
  return typeof stickySentinelTop === "number" && stickySentinelTop < 0;
}

export function getHomepageDateHeaderStuckFromObserverEntry(
  entry: Pick<IntersectionObserverEntry, "boundingClientRect">
) {
  return getHomepageDateHeaderStuck(entry.boundingClientRect.top);
}

export function shouldCorrectHomepageDateHeaderStuckOnScroll(
  isDateHeaderStuck: boolean
) {
  return isDateHeaderStuck;
}

function observeHomepageDateHeaderStickinessWithScrollFallback(input: {
  onStuckChange: SetDateHeaderStuck;
  sentinel: HTMLElement;
}) {
  let frame: number | null = null;

  function measureDateHeaderStickiness() {
    frame = null;
    input.onStuckChange(
      getHomepageDateHeaderStuck(input.sentinel.getBoundingClientRect().top)
    );
  }

  function scheduleDateHeaderStickinessMeasure() {
    if (frame !== null) {
      return;
    }

    frame = window.requestAnimationFrame(measureDateHeaderStickiness);
  }

  scheduleDateHeaderStickinessMeasure();
  window.addEventListener("scroll", scheduleDateHeaderStickinessMeasure, {
    passive: true
  });
  document.addEventListener("scroll", scheduleDateHeaderStickinessMeasure, {
    passive: true
  });
  window.addEventListener("resize", scheduleDateHeaderStickinessMeasure);

  return () => {
    window.removeEventListener("scroll", scheduleDateHeaderStickinessMeasure);
    document.removeEventListener("scroll", scheduleDateHeaderStickinessMeasure);
    window.removeEventListener("resize", scheduleDateHeaderStickinessMeasure);

    if (frame !== null) {
      window.cancelAnimationFrame(frame);
      frame = null;
    }
  };
}

function observeHomepageDateHeaderStickiness(input: {
  isDateHeaderStuck: () => boolean;
  onStuckChange: SetDateHeaderStuck;
  sentinel: HTMLElement;
}) {
  if (typeof IntersectionObserver === "undefined") {
    return observeHomepageDateHeaderStickinessWithScrollFallback(input);
  }

  input.onStuckChange(
    getHomepageDateHeaderStuck(input.sentinel.getBoundingClientRect().top)
  );

  let correctionFrame: number | null = null;

  function measureDateHeaderStickiness() {
    correctionFrame = null;
    input.onStuckChange(
      getHomepageDateHeaderStuck(input.sentinel.getBoundingClientRect().top)
    );
  }

  function scheduleDateHeaderStickinessCorrection() {
    if (
      !shouldCorrectHomepageDateHeaderStuckOnScroll(input.isDateHeaderStuck())
    ) {
      return;
    }

    if (correctionFrame !== null) {
      return;
    }

    correctionFrame = window.requestAnimationFrame(measureDateHeaderStickiness);
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry) {
        return;
      }

      input.onStuckChange(getHomepageDateHeaderStuckFromObserverEntry(entry));
    },
    {
      root: null,
      threshold: HOMEPAGE_DATE_HEADER_OBSERVER_THRESHOLDS
    }
  );

  observer.observe(input.sentinel);
  window.addEventListener("scroll", scheduleDateHeaderStickinessCorrection, {
    passive: true
  });
  document.addEventListener("scroll", scheduleDateHeaderStickinessCorrection, {
    passive: true
  });
  window.addEventListener("resize", scheduleDateHeaderStickinessCorrection);

  return () => {
    observer.disconnect();
    window.removeEventListener(
      "scroll",
      scheduleDateHeaderStickinessCorrection
    );
    document.removeEventListener(
      "scroll",
      scheduleDateHeaderStickinessCorrection
    );
    window.removeEventListener("resize", scheduleDateHeaderStickinessCorrection);

    if (correctionFrame !== null) {
      window.cancelAnimationFrame(correctionFrame);
      correctionFrame = null;
    }
  };
}

export function useHomepageDayStickyHeader() {
  const stickySentinelRef = useRef<HTMLSpanElement | null>(null);
  const isDateHeaderStuckRef = useRef(false);
  const [isDateHeaderStuck, setIsDateHeaderStuck] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function setDateHeaderStuck(nextIsStuck: boolean) {
      if (isDateHeaderStuckRef.current !== nextIsStuck) {
        isDateHeaderStuckRef.current = nextIsStuck;
        setIsDateHeaderStuck(nextIsStuck);
      }
    }

    const sentinel = stickySentinelRef.current;

    if (!sentinel) {
      return;
    }

    return observeHomepageDateHeaderStickiness({
      isDateHeaderStuck: () => isDateHeaderStuckRef.current,
      onStuckChange: setDateHeaderStuck,
      sentinel
    });
  }, []);

  return {
    isDateHeaderStuck,
    stickySentinelRef
  };
}
