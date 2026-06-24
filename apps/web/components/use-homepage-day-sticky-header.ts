"use client";

import { useEffect, useRef, useState } from "react";

type SetDateHeaderStuck = (isStuck: boolean) => void;

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
  onStuckChange: SetDateHeaderStuck;
  sentinel: HTMLElement;
}) {
  if (typeof IntersectionObserver === "undefined") {
    return observeHomepageDateHeaderStickinessWithScrollFallback(input);
  }

  input.onStuckChange(
    getHomepageDateHeaderStuck(input.sentinel.getBoundingClientRect().top)
  );

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry) {
        return;
      }

      input.onStuckChange(getHomepageDateHeaderStuckFromObserverEntry(entry));
    },
    {
      root: null,
      threshold: 0
    }
  );

  observer.observe(input.sentinel);

  return () => {
    observer.disconnect();
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
      onStuckChange: setDateHeaderStuck,
      sentinel
    });
  }, []);

  return {
    isDateHeaderStuck,
    stickySentinelRef
  };
}
