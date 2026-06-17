"use client";

import { useEffect, useRef, useState } from "react";

interface HomepageDateHeaderStuckHoldInput {
  isDateHeaderStuck: boolean;
  stickySentinelTop?: number | null;
}

interface HomepageDateHeaderStuckHoldClearInput {
  isDateHeaderTransitionStuckHold: boolean;
  isDateTransitioning: boolean;
}

export function shouldHoldHomepageDateHeaderStuck({
  isDateHeaderStuck,
  stickySentinelTop
}: HomepageDateHeaderStuckHoldInput): boolean {
  return (
    isDateHeaderStuck ||
    (typeof stickySentinelTop === "number" && stickySentinelTop < 0)
  );
}

export function shouldClearHomepageDateHeaderStuckHold({
  isDateHeaderTransitionStuckHold,
  isDateTransitioning
}: HomepageDateHeaderStuckHoldClearInput): boolean {
  return isDateHeaderTransitionStuckHold && !isDateTransitioning;
}

export function useHomepageDayStickyHeader({
  isDateTransitioning
}: {
  isDateTransitioning: boolean;
}) {
  const stickySentinelRef = useRef<HTMLSpanElement | null>(null);
  const stickyFrameRef = useRef<number | null>(null);
  const isDateHeaderStuckRef = useRef(false);
  const [
    isDateHeaderTransitionStuckHold,
    setIsDateHeaderTransitionStuckHold
  ] = useState(false);
  const [isDateHeaderStuck, setIsDateHeaderStuck] = useState(false);
  const isDateHeaderVisuallyStuck =
    isDateHeaderStuck || isDateHeaderTransitionStuckHold;

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
    document.addEventListener("scroll", scheduleDateHeaderStickinessMeasure, {
      passive: true
    });
    window.addEventListener("resize", scheduleDateHeaderStickinessMeasure);

    return () => {
      window.removeEventListener("scroll", scheduleDateHeaderStickinessMeasure);
      document.removeEventListener(
        "scroll",
        scheduleDateHeaderStickinessMeasure
      );
      window.removeEventListener("resize", scheduleDateHeaderStickinessMeasure);

      if (stickyFrameRef.current !== null) {
        window.cancelAnimationFrame(stickyFrameRef.current);
        stickyFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (
      !shouldClearHomepageDateHeaderStuckHold({
        isDateHeaderTransitionStuckHold,
        isDateTransitioning
      })
    ) {
      return;
    }

    if (typeof window === "undefined") {
      setIsDateHeaderTransitionStuckHold(false);
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsDateHeaderTransitionStuckHold(false);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isDateHeaderTransitionStuckHold, isDateTransitioning]);

  function captureDateHeaderTransitionStuckHold() {
    const stickySentinelTop =
      stickySentinelRef.current?.getBoundingClientRect().top ?? null;

    setIsDateHeaderTransitionStuckHold(
      shouldHoldHomepageDateHeaderStuck({
        isDateHeaderStuck,
        stickySentinelTop
      })
    );
  }

  function clearDateHeaderTransitionStuckHold() {
    setIsDateHeaderTransitionStuckHold(false);
  }

  return {
    captureDateHeaderTransitionStuckHold,
    clearDateHeaderTransitionStuckHold,
    isDateHeaderStuck,
    isDateHeaderVisuallyStuck,
    stickySentinelRef
  };
}
