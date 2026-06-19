"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { usePathname } from "next/navigation";

import type { HomepageDayPayload } from "@/lib/homepage-day-loading";
import {
  announceHomepageActiveDate,
  getAdjacentDateKey,
  getDayTransition,
  getHomepageRequestedDateKey,
  getRequestedDayTransition,
  HOMEPAGE_REQUEST_ACTIVE_DATE_EVENT,
  replaceHomepageDateInUrl,
  syncHomepageActiveDate,
  type DayTransition,
  type SwipeDirection
} from "@/lib/homepage-dates";

export interface BrowserTransition extends DayTransition {
  phase: "preparing" | "animating";
}

export interface DayBrowserPaneState {
  dateKey: string;
  motionRole: "active" | "from" | "to";
  phase: BrowserTransition["phase"] | null;
}

interface CompletedTransitionState {
  activeDateKey: string;
  transition: BrowserTransition | null;
}

interface HomepageDayTransitionCleanupFrames {
  firstFrame: number | null;
  secondFrame: number | null;
}

interface HomepageDayTransitionCleanupScheduler {
  cancelAnimationFrame: (handle: number) => void;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
}

interface UseHomepageDayNavigationOptions {
  availableDateKeys: string[];
  closeCalendar: () => void;
  closeOpenGig: () => void;
  ensureHomepageDayForNavigation: (dateKey: string) => Promise<boolean>;
  initialActiveDateKey: string;
  initialDays: HomepageDayPayload[];
  isLoadingDay: boolean;
  onDateChangeCancel?: () => void;
  onDateChangeStart?: (nextDateKey: string) => void;
  resetAdjacentImagePreloads: () => void;
  resetDayLoadError: () => void;
  resetDayWheelGesture: () => void;
  syncCalendarMonthForDate: (dateKey: string) => void;
}

interface RequestDateChangeOptions {
  announce?: boolean;
  replaceUrl?: boolean;
  revertUrlOnFailure?: boolean;
  transition?: DayTransition;
  urlAlreadyUpdated?: boolean;
}

const HEADING_TRANSITION_DURATION_MS = 240;
const HEADING_TRANSITION_EASING = "cubic-bezier(0.45, 0.05, 0.55, 0.95)";
const HEADING_TRANSITION_DISTANCE_PX = 36;
const CONTENT_TRANSITION_DURATION_MS = HEADING_TRANSITION_DURATION_MS;
const CONTENT_TRANSITION_EASING = HEADING_TRANSITION_EASING;
const CONTENT_TRANSITION_DISTANCE_PX = HEADING_TRANSITION_DISTANCE_PX;
const TRANSITION_COMMIT_BUFFER_MS = 20;

export function buildHomepageDayTransitionPanes(
  activeDateKey: string,
  transition: BrowserTransition | null
): DayBrowserPaneState[] {
  if (!transition) {
    return [
      {
        dateKey: activeDateKey,
        motionRole: "active",
        phase: null
      }
    ];
  }

  return [
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
  ];
}

export function completeHomepageDayTransition(
  activeDateKey: string,
  transition: BrowserTransition | null,
  dateKey: string
): CompletedTransitionState {
  if (!transition || transition.toDateKey !== dateKey) {
    return {
      activeDateKey,
      transition
    };
  }

  return {
    activeDateKey: dateKey,
    transition
  };
}

export function clearCompletedHomepageDayTransition(
  transition: BrowserTransition | null,
  dateKey: string
): BrowserTransition | null {
  return transition?.toDateKey === dateKey ? null : transition;
}

export function completeHomepageDayTransitionImmediately(
  dateKey: string
): CompletedTransitionState {
  return {
    activeDateKey: dateKey,
    transition: null
  };
}

export function scheduleHomepageDayTransitionCleanup({
  onCleanup,
  requestAnimationFrame
}: Pick<HomepageDayTransitionCleanupScheduler, "requestAnimationFrame"> & {
  onCleanup: () => void;
}): HomepageDayTransitionCleanupFrames {
  const frames: HomepageDayTransitionCleanupFrames = {
    firstFrame: null,
    secondFrame: null
  };

  frames.firstFrame = requestAnimationFrame(() => {
    frames.firstFrame = null;
    frames.secondFrame = requestAnimationFrame(() => {
      frames.secondFrame = null;
      onCleanup();
    });
  });

  return frames;
}

export function cancelHomepageDayTransitionCleanup({
  cancelAnimationFrame,
  frames
}: Pick<HomepageDayTransitionCleanupScheduler, "cancelAnimationFrame"> & {
  frames: HomepageDayTransitionCleanupFrames;
}) {
  if (frames.firstFrame !== null) {
    cancelAnimationFrame(frames.firstFrame);
  }

  if (frames.secondFrame !== null) {
    cancelAnimationFrame(frames.secondFrame);
  }

  frames.firstFrame = null;
  frames.secondFrame = null;
}

export function buildHomepageHeadingTrackStyle(): CSSProperties {
  return {
    "--day-browser-heading-duration": `${HEADING_TRANSITION_DURATION_MS}ms`,
    "--day-browser-heading-easing": HEADING_TRANSITION_EASING,
    "--day-browser-heading-distance": `${HEADING_TRANSITION_DISTANCE_PX}px`
  } as CSSProperties;
}

export function buildHomepageContentViewportStyle(): CSSProperties {
  return {
    "--day-browser-content-duration": `${CONTENT_TRANSITION_DURATION_MS}ms`,
    "--day-browser-content-easing": CONTENT_TRANSITION_EASING,
    "--day-browser-content-distance": `${CONTENT_TRANSITION_DISTANCE_PX}px`
  } as CSSProperties;
}

export function useHomepageDayNavigation({
  availableDateKeys,
  closeCalendar,
  closeOpenGig,
  ensureHomepageDayForNavigation,
  initialActiveDateKey,
  initialDays,
  isLoadingDay,
  onDateChangeCancel,
  onDateChangeStart,
  resetAdjacentImagePreloads,
  resetDayLoadError,
  resetDayWheelGesture,
  syncCalendarMonthForDate
}: UseHomepageDayNavigationOptions) {
  const pathname = usePathname();
  const transitionCleanupFrameRefs = useRef<HomepageDayTransitionCleanupFrames>({
    firstFrame: null,
    secondFrame: null
  });
  const transitionFrameRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const [activeDateKey, setActiveDateKey] = useState(initialActiveDateKey);
  const [transition, setTransition] = useState<BrowserTransition | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const previousDateKey = getAdjacentDateKey(
    availableDateKeys,
    activeDateKey,
    "previous"
  );
  const nextDateKey = getAdjacentDateKey(availableDateKeys, activeDateKey, "next");
  const isAnimating = transition !== null;
  const isNavigationLocked = isAnimating || isLoadingDay;
  const isContentAnimating = transition?.phase === "animating";
  const renderedHeadingPanes = buildHomepageDayTransitionPanes(
    activeDateKey,
    transition
  );
  const renderedContentPanes = buildHomepageDayTransitionPanes(
    activeDateKey,
    transition
  );
  const headingTrackStyle = buildHomepageHeadingTrackStyle();
  const contentViewportStyle = buildHomepageContentViewportStyle();

  const closeCalendarFromEffect = useEffectEvent(closeCalendar);
  const closeOpenGigFromEffect = useEffectEvent(closeOpenGig);
  const resetAdjacentImagePreloadsFromEffect = useEffectEvent(
    resetAdjacentImagePreloads
  );
  const requestDateChangeFromEffect = useEffectEvent((nextDateKey: string) => {
    void requestDateChange(nextDateKey, {
      revertUrlOnFailure: true,
      urlAlreadyUpdated: true
    });
  });
  const syncCalendarMonthForDateFromEffect = useEffectEvent(
    syncCalendarMonthForDate
  );

  function cancelTransitionCleanupFrames() {
    if (typeof window === "undefined") {
      transitionCleanupFrameRefs.current = {
        firstFrame: null,
        secondFrame: null
      };
      return;
    }

    cancelHomepageDayTransitionCleanup({
      cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
      frames: transitionCleanupFrameRefs.current
    });
  }

  useEffect(() => {
    setActiveDateKey(initialActiveDateKey);
    syncCalendarMonthForDateFromEffect(initialActiveDateKey);
    closeCalendarFromEffect();
    closeOpenGigFromEffect();
    setTransition(null);
    cancelTransitionCleanupFrames();
    resetAdjacentImagePreloadsFromEffect();
  }, [availableDateKeys, initialActiveDateKey, initialDays]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleRequestedActiveDate(event: Event) {
      const nextDateKey = getHomepageRequestedDateKey(event);

      if (!nextDateKey || !availableDateKeys.includes(nextDateKey)) {
        return;
      }

      requestDateChangeFromEffect(nextDateKey);
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
    if (transition) {
      closeCalendarFromEffect();
    }
  }, [transition]);

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
      transitionFrameRef.current = null;
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

    const transitionCommitDelay =
      Math.max(HEADING_TRANSITION_DURATION_MS, CONTENT_TRANSITION_DURATION_MS) +
      TRANSITION_COMMIT_BUFFER_MS;

    transitionTimeoutRef.current = window.setTimeout(() => {
      transitionTimeoutRef.current = null;
      finishTransition(transition.toDateKey);
    }, transitionCommitDelay);

    return () => {
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    };
  }, [transition]);

  useEffect(() => {
    return () => {
      cancelTransitionCleanupFrames();

      if (transitionFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionFrameRef.current);
      }

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  function commitActiveDate(dateKey: string) {
    setActiveDateKey(dateKey);
    syncCalendarMonthForDate(dateKey);
  }

  function finishTransition(dateKey: string) {
    setActiveDateKey((currentActiveDateKey) => {
      const completion = completeHomepageDayTransition(
        currentActiveDateKey,
        transition,
        dateKey
      );

      return completion.activeDateKey;
    });
    syncCalendarMonthForDate(dateKey);
    cancelTransitionCleanupFrames();
    transitionCleanupFrameRefs.current = scheduleHomepageDayTransitionCleanup({
      onCleanup: () => {
        setTransition((current) =>
          clearCompletedHomepageDayTransition(current, dateKey)
        );
      },
      requestAnimationFrame: window.requestAnimationFrame.bind(window)
    });
  }

  async function requestDateChange(
    nextDateKey: string,
    options: RequestDateChangeOptions = {}
  ): Promise<boolean> {
    if (isNavigationLocked || !availableDateKeys.includes(nextDateKey)) {
      return false;
    }

    if (nextDateKey !== activeDateKey) {
      onDateChangeStart?.(nextDateKey);
    }

    closeOpenGig();
    closeCalendar();
    resetDayLoadError();
    resetDayWheelGesture();

    if (nextDateKey === activeDateKey) {
      return true;
    }

    const hasDay = await ensureHomepageDayForNavigation(nextDateKey);

    if (!hasDay) {
      onDateChangeCancel?.();

      if (options.revertUrlOnFailure || options.urlAlreadyUpdated) {
        replaceHomepageDateInUrl(pathname, activeDateKey);
      }

      return false;
    }

    if (options.replaceUrl) {
      replaceHomepageDateInUrl(pathname, nextDateKey);
    }

    if (options.announce) {
      announceHomepageActiveDate(nextDateKey);
    }

    if (prefersReducedMotion) {
      const completion = completeHomepageDayTransitionImmediately(nextDateKey);

      cancelTransitionCleanupFrames();
      setTransition(completion.transition);
      commitActiveDate(completion.activeDateKey);

      return true;
    }

    const requestedTransition =
      options.transition ??
      getRequestedDayTransition(availableDateKeys, activeDateKey, nextDateKey);

    if (!requestedTransition) {
      const completion = completeHomepageDayTransitionImmediately(nextDateKey);

      cancelTransitionCleanupFrames();
      setTransition(completion.transition);
      commitActiveDate(completion.activeDateKey);

      return true;
    }

    cancelTransitionCleanupFrames();
    setTransition({
      ...requestedTransition,
      phase: "preparing"
    });

    return true;
  }

  function navigateAdjacentDate(direction: SwipeDirection): boolean {
    if (isNavigationLocked) {
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

    void requestDateChange(nextTransition.toDateKey, {
      announce: true,
      replaceUrl: true,
      transition: nextTransition
    });

    return true;
  }

  return {
    activeDateKey,
    contentViewportStyle,
    headingTrackStyle,
    isContentAnimating,
    isNavigationLocked,
    navigateAdjacentDate,
    nextDateKey,
    previousDateKey,
    renderedContentPanes,
    renderedHeadingPanes,
    requestDateChange,
    transition
  };
}
