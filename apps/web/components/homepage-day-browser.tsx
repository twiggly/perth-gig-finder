"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { usePathname } from "next/navigation";
import { ActionIcon, Box, Title } from "@mantine/core";

import { GigCard } from "@/components/gig-card";
import {
  accumulateTrackpadSwipe,
  announceHomepageActiveDate,
  getAdjacentDateKey,
  getDayTransition,
  getRequestedDayTransition,
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
import {
  getAdjacentGigImagePreloadUrls,
  type GigCardRecord
} from "@/lib/gigs";

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

interface ContentPaneState {
  dateKey: string;
  motionRole: "active" | "from" | "to";
  phase: BrowserTransition["phase"] | null;
}

interface HeadingPaneState {
  dateKey: string;
  motionRole: "active" | "from" | "to";
  phase: BrowserTransition["phase"] | null;
}

const HEADING_TRANSITION_DURATION_MS = 240;
const HEADING_TRANSITION_EASING = "cubic-bezier(0.45, 0.05, 0.55, 0.95)";
const HEADING_TRANSITION_DISTANCE_PX = 36;
const CONTENT_TRANSITION_DURATION_MS = HEADING_TRANSITION_DURATION_MS;
const CONTENT_TRANSITION_EASING = HEADING_TRANSITION_EASING;
const CONTENT_TRANSITION_DISTANCE_PX = HEADING_TRANSITION_DISTANCE_PX;
const LOCAL_PREVIEW_ASSET_REVISION =
  process.env.NEXT_PUBLIC_LOCAL_PREVIEW_ASSET_REVISION ?? "0";
const ADJACENT_DAY_IMAGE_PRELOAD_LIMIT = 5;
const IMAGE_PRELOAD_TIMEOUT_MS = 120;

function shouldSkipAdjacentImagePreload(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return (
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData === true
  );
}

function scheduleAdjacentImagePreload(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  if (typeof window.requestIdleCallback === "function") {
    const idleCallbackId = window.requestIdleCallback(callback, {
      timeout: IMAGE_PRELOAD_TIMEOUT_MS
    });

    return () => {
      window.cancelIdleCallback(idleCallbackId);
    };
  }

  const timeoutId = window.setTimeout(callback, IMAGE_PRELOAD_TIMEOUT_MS);

  return () => {
    window.clearTimeout(timeoutId);
  };
}

export function HomepageDayBrowser({
  days,
  initialActiveDateKey
}: HomepageDayBrowserProps) {
  const previewAssetRevision = LOCAL_PREVIEW_ASSET_REVISION;
  const pathname = usePathname();
  const gestureRef = useRef<PointerGesture | null>(null);
  const preloadedImageUrlsRef = useRef<Set<string>>(new Set());
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
  const isContentAnimating = transition?.phase === "animating";
  const headingTrackStyle = {
    "--day-browser-heading-duration": `${HEADING_TRANSITION_DURATION_MS}ms`,
    "--day-browser-heading-easing": HEADING_TRANSITION_EASING,
    "--day-browser-heading-distance": `${HEADING_TRANSITION_DISTANCE_PX}px`
  } as CSSProperties;
  const renderedHeadingPanes: HeadingPaneState[] = transition
    ? [
        {
          dateKey: transition.fromDateKey,
          motionRole: "from",
          phase: transition.phase
        },
        {
          dateKey: transition.toDateKey,
          motionRole: "to",
          phase: transition.phase
        }
      ]
    : [
        {
          dateKey: activeDateKey,
          motionRole: "active",
          phase: null
        }
      ];
  const renderedContentPanes: ContentPaneState[] = transition
    ? [
        {
          dateKey: transition.fromDateKey,
          motionRole: "from",
          phase: transition.phase
        },
        {
          dateKey: transition.toDateKey,
          motionRole: "to",
          phase: transition.phase
        }
      ]
    : [
        {
          dateKey: activeDateKey,
          motionRole: "active",
          phase: null
        }
      ];
  const contentViewportStyle = {
    "--day-browser-content-duration": `${CONTENT_TRANSITION_DURATION_MS}ms`,
    "--day-browser-content-easing": CONTENT_TRANSITION_EASING,
    "--day-browser-content-distance": `${CONTENT_TRANSITION_DISTANCE_PX}px`
  } as CSSProperties;

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

      setOpenGigId(null);

      if (prefersReducedMotion) {
        setTransition(null);
        setActiveDateKey(nextDateKey);
        return;
      }

      const requestedTransition = getRequestedDayTransition(
        availableDateKeys,
        activeDateKey,
        nextDateKey
      );

      if (!requestedTransition) {
        setTransition(null);
        setActiveDateKey(nextDateKey);
        return;
      }

      wheelGestureRef.current.accumulatedDeltaX = 0;
      setTransition({
        ...requestedTransition,
        phase: "preparing"
      });
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
  }, [activeDateKey, availableDateKeys, prefersReducedMotion]);

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
    if (
      typeof window === "undefined" ||
      !activeDateKey ||
      shouldSkipAdjacentImagePreload()
    ) {
      return;
    }

    const preloadUrls = getAdjacentGigImagePreloadUrls(
      dayMap,
      [previousDateKey, nextDateKey].filter(
        (dateKey): dateKey is string => Boolean(dateKey)
      ),
      ADJACENT_DAY_IMAGE_PRELOAD_LIMIT
    ).filter((url) => !preloadedImageUrlsRef.current.has(url));

    if (preloadUrls.length === 0) {
      return;
    }

    return scheduleAdjacentImagePreload(() => {
      for (const preloadUrl of preloadUrls) {
        preloadedImageUrlsRef.current.add(preloadUrl);
        const image = new window.Image();

        image.decoding = "async";
        image.src = preloadUrl;
        void image.decode?.().catch(() => {});
      }
    });
  }, [activeDateKey, dayMap, nextDateKey, previousDateKey]);

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
    }, Math.max(HEADING_TRANSITION_DURATION_MS, CONTENT_TRANSITION_DURATION_MS) + 60);

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
    announceHomepageActiveDate(nextTransition.toDateKey);
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
      <Box className="day-browser__header">
        <ActionIcon
          aria-label="Previous date"
          className="day-browser__arrow"
          disabled={!previousDateKey || isAnimating}
          onClick={() => handleNavigate("previous")}
          type="button"
          variant="subtle"
        >
          <span aria-hidden="true">←</span>
        </ActionIcon>
        <Box className="day-browser__heading-viewport">
          <Box
            className="day-browser__heading-track"
            data-direction={transition?.direction}
            style={headingTrackStyle}
          >
            {renderedHeadingPanes.map(({ dateKey, motionRole, phase }) => (
              <Box
                className="day-browser__heading-pane"
                data-motion-role={motionRole}
                data-phase={phase ?? undefined}
                key={`heading-${dateKey}`}
              >
                <Title order={2}>{dayMap.get(dateKey)?.heading ?? activeDay.heading}</Title>
              </Box>
            ))}
          </Box>
        </Box>
        <ActionIcon
          aria-label="Next date"
          className="day-browser__arrow"
          disabled={!nextDateKey || isAnimating}
          onClick={() => handleNavigate("next")}
          type="button"
          variant="subtle"
        >
          <span aria-hidden="true">→</span>
        </ActionIcon>
      </Box>

      <Box
        className="day-browser__content-viewport"
        style={contentViewportStyle}
      >
        <Box
          className="day-browser__content-track"
          data-animating={isContentAnimating ? "true" : undefined}
          data-direction={transition?.direction}
        >
          {renderedContentPanes.map((pane) => {
            const { dateKey, motionRole, phase } = pane;
            const day = dayMap.get(dateKey);

            if (!day) {
              return null;
            }

            return (
              <Box
                aria-hidden={motionRole === "from"}
                className="day-browser__content-pane"
                data-motion-role={motionRole}
                data-phase={phase ?? undefined}
                key={dateKey}
              >
                <Box className="gig-grid" data-date={dateKey}>
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
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    </section>
  );
}
