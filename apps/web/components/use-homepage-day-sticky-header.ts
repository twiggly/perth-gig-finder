"use client";

import { useEffect, useRef, useState } from "react";

export function useHomepageDayStickyHeader() {
  const stickySentinelRef = useRef<HTMLSpanElement | null>(null);
  const stickyFrameRef = useRef<number | null>(null);
  const isDateHeaderStuckRef = useRef(false);
  const [isDateHeaderStuck, setIsDateHeaderStuck] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function measureDateHeaderStickiness() {
      stickyFrameRef.current = null;

      const sentinel = stickySentinelRef.current;

      if (!sentinel) {
        return;
      }

      const nextIsStuck = sentinel.getBoundingClientRect().top < 0;

      if (isDateHeaderStuckRef.current !== nextIsStuck) {
        isDateHeaderStuckRef.current = nextIsStuck;
        setIsDateHeaderStuck(nextIsStuck);
      }
    }

    function scheduleDateHeaderStickinessMeasure() {
      if (stickyFrameRef.current !== null) {
        return;
      }

      stickyFrameRef.current = window.requestAnimationFrame(
        measureDateHeaderStickiness
      );
    }

    scheduleDateHeaderStickinessMeasure();
    window.addEventListener("scroll", scheduleDateHeaderStickinessMeasure, {
      passive: true
    });
    window.addEventListener("resize", scheduleDateHeaderStickinessMeasure);

    return () => {
      window.removeEventListener("scroll", scheduleDateHeaderStickinessMeasure);
      window.removeEventListener("resize", scheduleDateHeaderStickinessMeasure);

      if (stickyFrameRef.current !== null) {
        window.cancelAnimationFrame(stickyFrameRef.current);
        stickyFrameRef.current = null;
      }
    };
  }, []);

  return {
    isDateHeaderStuck,
    stickySentinelRef
  };
}
