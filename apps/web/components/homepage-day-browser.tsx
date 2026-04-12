"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { GigCard } from "@/components/gig-card";
import {
  accumulateTrackpadSwipe,
  DAY_SWIPE_DURATION_MS,
  getAdjacentDateKey,
  getDayTransition,
  getHomepageRequestedDateKey,
  HOMEPAGE_REQUEST_ACTIVE_DATE_EVENT,
  getSwipeDirection,
  replaceHomepageDateInUrl,
  syncHomepageActiveDate,
  shouldConsumeLockedTrackpadMomentum,
  TRACKPAD_GESTURE_LOCK_MS,
  type DateGroup,
  type DayTransition,
  type SwipeDirection
} from "@/lib/homepage-dates";
import type { GigCardRecord } from "@/lib/gigs";

interface HomepageDayBrowserProps {
  days: Array<DateGroup<GigCardRecord>>;
  initialActiveDateKey: string;
}

interface PointerGesture {
  pointerId: number;
  startX: number;
  startY: number;
}

interface WheelGesture {
  accumulatedDeltaX: number;
  lastEventAt: number;
  lockedDirection: SwipeDirection | null;
  lockedUntil: number;
}

interface BrowserTransition extends DayTransition {
  phase: "preparing" | "animating";
}

const SWIPE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const LOCAL_PREVIEW_ASSET_REVISION =
  process.env.NEXT_PUBLIC_LOCAL_PREVIEW_ASSET_REVISION ?? "0";

function buildTrackLayout(
  activeDateKey: string,
  transition: BrowserTransition | null
): {
  dateKeys: string[];
  translatePct: number;
} {
  if (!transition) {
    return {
      dateKeys: [activeDateKey],
      translatePct: 0
    };
  }

  if (transition.direction === "next") {
    return {
      dateKeys: [transition.fromDateKey, transition.toDateKey],
      translatePct: transition.phase === "animating" ? -50 : 0
    };
  }

  return {
    dateKeys: [transition.toDateKey, transition.fromDateKey],
    translatePct: transition.phase === "animating" ? 0 : -50
  };
}

export function HomepageDayBrowser({
  days,
  initialActiveDateKey
}: HomepageDayBrowserProps) {
  const previewAssetRevision = LOCAL_PREVIEW_ASSET_REVISION;
  const pathname = usePathname();
  const gestureRef = useRef<PointerGesture | null>(null);
  const transitionFrameRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const wheelGestureRef = useRef<WheelGesture>({
    accumulatedDeltaX: 0,
    lastEventAt: 0,
    lockedDirection: null,
    lockedUntil: 0
  });
  const [activeDateKey, setActiveDateKey] = useState(initialActiveDateKey);
  const [openGigId, setOpenGigId] = useState<string | null>(null);
  const [transition, setTransition] = useState<BrowserTransition | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const availableDateKeys = useMemo(
    () => days.map((day) => day.dateKey),
    [days]
  );
  const dayMap = useMemo(
    () => new Map(days.map((day) => [day.dateKey, day])),
    [days]
  );
  const activeDay = dayMap.get(activeDateKey) ?? days[0];
  const previousDateKey = getAdjacentDateKey(
    availableDateKeys,
    activeDateKey,
    "previous"
  );
  const nextDateKey = getAdjacentDateKey(availableDateKeys, activeDateKey, "next");
  const isAnimating = transition !== null;
  const { dateKeys: renderedDateKeys, translatePct } = buildTrackLayout(
    activeDateKey,
    transition
  );
  const paneBasis = `${100 / renderedDateKeys.length}%`;
  const trackStyle = {
    transform: `translate3d(${translatePct}%, 0, 0)`,
    transition:
      transition?.phase === "animating"
        ? `transform ${DAY_SWIPE_DURATION_MS}ms ${SWIPE_EASING}`
        : "none",
    width: `${renderedDateKeys.length * 100}%`
  };

  useEffect(() => {
    setActiveDateKey(initialActiveDateKey);
    setOpenGigId(null);
    setTransition(null);
  }, [initialActiveDateKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleRequestedActiveDate(event: Event) {
      const nextDateKey = getHomepageRequestedDateKey(event);

      if (!nextDateKey || !availableDateKeys.includes(nextDateKey)) {
        return;
      }

      setTransition(null);
      setOpenGigId(null);
      setActiveDateKey(nextDateKey);
    }

    window.addEventListener(
      HOMEPAGE_REQUEST_ACTIVE_DATE_EVENT,
      handleRequestedActiveDate
    );

    return () => {
      window.removeEventListener(
        HOMEPAGE_REQUEST_ACTIVE_DATE_EVENT,
        handleRequestedActiveDate
      );
    };
  }, [availableDateKeys]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = (matches: boolean) => {
      setPrefersReducedMotion(matches);
    };
    const handleChange = (event: MediaQueryListEvent) => {
      updateMotionPreference(event.matches);
    };

    updateMotionPreference(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);

      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }

    mediaQuery.addListener(handleChange);

    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !activeDateKey) {
      return;
    }

    syncHomepageActiveDate(pathname, activeDateKey);
  }, [activeDateKey, pathname]);

  useEffect(() => {
    if (!transition || transition.phase !== "preparing" || prefersReducedMotion) {
      return;
    }

    transitionFrameRef.current = window.requestAnimationFrame(() => {
      setTransition((current) =>
        current && current.phase === "preparing"
          ? { ...current, phase: "animating" }
          : current
      );
    });

    return () => {
      if (transitionFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionFrameRef.current);
        transitionFrameRef.current = null;
      }
    };
  }, [prefersReducedMotion, transition]);

  useEffect(() => {
    if (!transition || transition.phase !== "animating") {
      return;
    }

    transitionTimeoutRef.current = window.setTimeout(() => {
      finishTransition(transition.toDateKey);
    }, DAY_SWIPE_DURATION_MS + 60);

    return () => {
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    };
  }, [transition]);

  useEffect(() => {
    return () => {
      if (transitionFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionFrameRef.current);
      }

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  function clearGesture() {
    gestureRef.current = null;
  }

  function finishTransition(dateKey: string) {
    setActiveDateKey(dateKey);
    setTransition((current) =>
      current?.toDateKey === dateKey ? null : current
    );
  }

  function handleNavigate(direction: SwipeDirection): boolean {
    if (isAnimating) {
      return false;
    }

    const nextTransition = getDayTransition(
      availableDateKeys,
      activeDateKey,
      direction
    );

    if (!nextTransition) {
      return false;
    }

    replaceHomepageDateInUrl(pathname, nextTransition.toDateKey);
    setOpenGigId(null);
    wheelGestureRef.current.accumulatedDeltaX = 0;

    if (prefersReducedMotion) {
      setActiveDateKey(nextTransition.toDateKey);
      return true;
    }

    setTransition({
      ...nextTransition,
      phase: "preparing"
    });

    return true;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (
      isAnimating ||
      (event.pointerType !== "touch" && event.pointerType !== "pen")
    ) {
      return;
    }

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
  }

  function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    const gesture = gestureRef.current;

    clearGesture();

    if (!gesture || gesture.pointerId !== event.pointerId || isAnimating) {
      return;
    }

    const direction = getSwipeDirection(
      event.clientX - gesture.startX,
      event.clientY - gesture.startY
    );

    if (!direction) {
      return;
    }

    handleNavigate(direction);
  }

  function handleWheel(event: React.WheelEvent<HTMLElement>) {
    const now = Date.now();
    const currentGesture = wheelGestureRef.current;

    if (currentGesture.lockedUntil > now) {
      if (
        shouldConsumeLockedTrackpadMomentum(
          event.deltaX,
          event.deltaY,
          currentGesture.lockedDirection
        )
      ) {
        event.preventDefault();
        currentGesture.lockedUntil = now + TRACKPAD_GESTURE_LOCK_MS;
        currentGesture.lastEventAt = now;
      } else if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        currentGesture.accumulatedDeltaX = 0;
        currentGesture.lastEventAt = 0;
        currentGesture.lockedDirection = null;
        currentGesture.lockedUntil = 0;
      }

      return;
    }

    if (isAnimating) {
      return;
    }

    if (currentGesture.lastEventAt > 0 && now - currentGesture.lastEventAt > 200) {
      currentGesture.accumulatedDeltaX = 0;
    }

    currentGesture.lastEventAt = now;

    const { direction, nextDelta } = accumulateTrackpadSwipe(
      currentGesture.accumulatedDeltaX,
      event.deltaX,
      event.deltaY
    );

    currentGesture.accumulatedDeltaX = nextDelta;

    if (!direction) {
      return;
    }

    event.preventDefault();
    if (handleNavigate(direction)) {
      currentGesture.accumulatedDeltaX = 0;
      currentGesture.lockedDirection = direction;
      currentGesture.lockedUntil = now + TRACKPAD_GESTURE_LOCK_MS;
    } else {
      currentGesture.lockedDirection = null;
    }
  }

  function handleContentTransitionEnd(
    event: React.TransitionEvent<HTMLDivElement>
  ) {
    if (
      event.target !== event.currentTarget ||
      event.propertyName !== "transform" ||
      !transition ||
      transition.phase !== "animating"
    ) {
      return;
    }

    finishTransition(transition.toDateKey);
  }

  if (!activeDay) {
    return null;
  }

  return (
    <section
      data-preview-revision={previewAssetRevision}
      className="day-browser"
      onPointerCancel={clearGesture}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      <div className="day-browser__header">
        <button
          aria-label="Previous date"
          className="day-browser__arrow"
          disabled={!previousDateKey || isAnimating}
          onClick={() => handleNavigate("previous")}
          type="button"
        >
          <span aria-hidden="true">←</span>
        </button>
        <div className="day-browser__heading-viewport">
          <div
            className="day-browser__heading-track"
            style={trackStyle}
          >
            {renderedDateKeys.map((dateKey) => (
              <div
                className="day-browser__heading-pane"
                key={`heading-${dateKey}`}
                style={{ flexBasis: paneBasis }}
              >
                <h2>{dayMap.get(dateKey)?.heading ?? activeDay.heading}</h2>
              </div>
            ))}
          </div>
        </div>
        <button
          aria-label="Next date"
          className="day-browser__arrow"
          disabled={!nextDateKey || isAnimating}
          onClick={() => handleNavigate("next")}
          type="button"
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className="day-browser__content-viewport">
        <div
          className="day-browser__content-track"
          onTransitionEnd={handleContentTransitionEnd}
          style={trackStyle}
        >
          {renderedDateKeys.map((dateKey) => {
            const day = dayMap.get(dateKey);

            if (!day) {
              return null;
            }

            return (
              <div
                className="day-browser__content-pane"
                key={dateKey}
                style={{ flexBasis: paneBasis }}
              >
                <div className="gig-grid" data-date={dateKey}>
                  {day.items.map((gig) => (
                    <GigCard
                      gig={gig}
                      isOpen={openGigId === gig.id}
                      key={gig.id}
                      onClose={() =>
                        setOpenGigId((current) => (current === gig.id ? null : current))
                      }
                      onToggle={() =>
                        setOpenGigId((current) => (current === gig.id ? null : gig.id))
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
