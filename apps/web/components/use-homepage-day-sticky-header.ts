"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface HomepageDateHeaderStuckHoldInput {
  isDateHeaderStuck: boolean;
  scrollTop?: number | null;
  stickySentinelTop?: number | null;
}

type HomepageDateHeaderStuckHoldRelease =
  | "clear"
  | "keep"
  | "retry"
  | "fallback-clear";

interface HomepageDateHeaderStuckHoldReleaseInput {
  isDateHeaderTransitionStuckHold: boolean;
  isDateTransitioning: boolean;
  maxRetryCount: number;
  retryCount: number;
  scrollTop?: number | null;
  stickySentinelTop?: number | null;
}

const DATE_HEADER_STUCK_HOLD_RELEASE_MAX_RETRIES = 3;

export function shouldHoldHomepageDateHeaderStuck({
  isDateHeaderStuck,
  scrollTop,
  stickySentinelTop
}: HomepageDateHeaderStuckHoldInput): boolean {
  if (typeof scrollTop === "number" && scrollTop <= 0) {
    return false;
  }

  return (
    isDateHeaderStuck ||
    (typeof stickySentinelTop === "number" && stickySentinelTop < 0)
  );
}

export function getHomepageDateHeaderStuckHoldRelease({
  isDateHeaderTransitionStuckHold,
  isDateTransitioning,
  maxRetryCount,
  retryCount,
  scrollTop,
  stickySentinelTop
}: HomepageDateHeaderStuckHoldReleaseInput): HomepageDateHeaderStuckHoldRelease {
  if (typeof scrollTop === "number" && scrollTop <= 0) {
    return isDateHeaderTransitionStuckHold ? "clear" : "keep";
  }

  if (!isDateHeaderTransitionStuckHold || isDateTransitioning) {
    return "keep";
  }

  if (typeof stickySentinelTop === "number" && stickySentinelTop < 0) {
    return "clear";
  }

  if (retryCount < maxRetryCount) {
    return "retry";
  }

  return "fallback-clear";
}

export function useHomepageDayStickyHeader({
  isDateTransitioning
}: {
  isDateTransitioning: boolean;
}) {
  const stickySentinelRef = useRef<HTMLSpanElement | null>(null);
  const stuckHoldReleaseFrameRef = useRef<number | null>(null);
  const stuckHoldReleaseRetryCountRef = useRef(0);
  const stickyFrameRef = useRef<number | null>(null);
  const isDateHeaderStuckRef = useRef(false);
  const [
    isDateHeaderTransitionStuckHold,
    setIsDateHeaderTransitionStuckHold
  ] = useState(false);
  const [stuckHoldReleaseRetryTick, setStuckHoldReleaseRetryTick] = useState(0);
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

      const nextIsStuck =
        window.scrollY > 0 && sentinel.getBoundingClientRect().top < 0;

      if (isDateHeaderStuckRef.current !== nextIsStuck) {
        isDateHeaderStuckRef.current = nextIsStuck;
        setIsDateHeaderStuck(nextIsStuck);
      }
    }

    function scheduleDateHeaderStickinessMeasure() {
      if (window.scrollY <= 0) {
        if (stickyFrameRef.current !== null) {
          window.cancelAnimationFrame(stickyFrameRef.current);
          stickyFrameRef.current = null;
        }

        stuckHoldReleaseRetryCountRef.current = 0;
        if (isDateHeaderStuckRef.current) {
          isDateHeaderStuckRef.current = false;
          setIsDateHeaderStuck(false);
        }
        setIsDateHeaderTransitionStuckHold(false);
        return;
      }

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

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      if (isDateHeaderTransitionStuckHold && !isDateTransitioning) {
        setIsDateHeaderTransitionStuckHold(false);
      }

      return;
    }

    if (stuckHoldReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(stuckHoldReleaseFrameRef.current);
      stuckHoldReleaseFrameRef.current = null;
    }

    const stickySentinelTop =
      stickySentinelRef.current?.getBoundingClientRect().top ?? null;
    const release = getHomepageDateHeaderStuckHoldRelease({
      isDateHeaderTransitionStuckHold,
      isDateTransitioning,
      maxRetryCount: DATE_HEADER_STUCK_HOLD_RELEASE_MAX_RETRIES,
      retryCount: stuckHoldReleaseRetryCountRef.current,
      scrollTop: window.scrollY,
      stickySentinelTop
    });

    if (release === "keep") {
      if (!isDateHeaderTransitionStuckHold) {
        stuckHoldReleaseRetryCountRef.current = 0;
      }

      return undefined;
    }

    if (release === "clear" || release === "fallback-clear") {
      const measuredIsStuck =
        window.scrollY > 0 &&
        typeof stickySentinelTop === "number" &&
        stickySentinelTop < 0;

      stuckHoldReleaseRetryCountRef.current = 0;
      if (isDateHeaderStuckRef.current !== measuredIsStuck) {
        isDateHeaderStuckRef.current = measuredIsStuck;
        setIsDateHeaderStuck(measuredIsStuck);
      }
      setIsDateHeaderTransitionStuckHold(false);
      return undefined;
    }

    stuckHoldReleaseFrameRef.current = window.requestAnimationFrame(() => {
      stuckHoldReleaseFrameRef.current = null;
      stuckHoldReleaseRetryCountRef.current += 1;
      setStuckHoldReleaseRetryTick((current) => current + 1);
    });

    return () => {
      if (stuckHoldReleaseFrameRef.current !== null) {
        window.cancelAnimationFrame(stuckHoldReleaseFrameRef.current);
        stuckHoldReleaseFrameRef.current = null;
      }
    };
  }, [
    isDateHeaderTransitionStuckHold,
    isDateTransitioning,
    stuckHoldReleaseRetryTick
  ]);

  function captureDateHeaderTransitionStuckHold() {
    const stickySentinelTop =
      stickySentinelRef.current?.getBoundingClientRect().top ?? null;

    setIsDateHeaderTransitionStuckHold(
      shouldHoldHomepageDateHeaderStuck({
        isDateHeaderStuck,
        scrollTop: typeof window === "undefined" ? null : window.scrollY,
        stickySentinelTop
      })
    );
    stuckHoldReleaseRetryCountRef.current = 0;
  }

  function clearDateHeaderTransitionStuckHold() {
    stuckHoldReleaseRetryCountRef.current = 0;

    if (typeof window !== "undefined" && stuckHoldReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(stuckHoldReleaseFrameRef.current);
      stuckHoldReleaseFrameRef.current = null;
    }

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
