"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { usePathname } from "next/navigation";
import { ActionIcon, Box, Popover, Text, UnstyledButton } from "@mantine/core";

import { GigCard } from "@/components/gig-card";
import {
  buildHomepageCalendarMonth,
  CALENDAR_WEEKDAY_LABELS,
  getInitialHomepageCalendarMonthKey
} from "@/lib/homepage-calendar";
import {
  buildHomepageDayRequestPath,
  isHomepageDayPayload,
  mergeHomepageDayCache,
  type HomepageDayPayload
} from "@/lib/homepage-day-loading";
import {
  accumulateTrackpadSwipe,
  announceHomepageActiveDate,
  getAdjacentDateKey,
  getDayTransition,
  getRequestedDayTransition,
  getHomepageRequestedDateKey,
  HOMEPAGE_REQUEST_ACTIVE_DATE_EVENT,
  getPerthDateKey,
  getSwipeDirection,
  replaceHomepageDateInUrl,
  syncHomepageActiveDate,
  shouldConsumeLockedTrackpadMomentum,
  TRACKPAD_GESTURE_LOCK_MS,
  type DateSummary,
  type DayTransition,
  type SwipeDirection
} from "@/lib/homepage-dates";
import {
  getAdjacentGigImagePreloadUrls
} from "@/lib/gigs";

interface HomepageDayBrowserProps {
  availableDays: DateSummary[];
  currentQuery: string;
  initialActiveDateKey: string;
  initialDay: HomepageDayPayload;
  selectedVenueSlugs: string[];
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
  availableDays,
  currentQuery,
  initialActiveDateKey,
  initialDay,
  selectedVenueSlugs
}: HomepageDayBrowserProps) {
  const previewAssetRevision = LOCAL_PREVIEW_ASSET_REVISION;
  const pathname = usePathname();
  const gestureRef = useRef<PointerGesture | null>(null);
  const calendarGestureRef = useRef<PointerGesture | null>(null);
  const calendarSwipeConsumedRef = useRef(false);
  const pendingDayLoadsRef = useRef<Map<string, Promise<HomepageDayPayload>>>(
    new Map()
  );
  const isMountedRef = useRef(true);
  const preloadedImageUrlsRef = useRef<Set<string>>(new Set());
  const stickySentinelRef = useRef<HTMLSpanElement | null>(null);
  const stickyFrameRef = useRef<number | null>(null);
  const isDateHeaderStuckRef = useRef(false);
  const transitionFrameRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const wheelGestureRef = useRef<WheelGesture>({
    accumulatedDeltaX: 0,
    lastEventAt: 0,
    lockedDirection: null,
    lockedUntil: 0
  });
  const calendarWheelGestureRef = useRef<WheelGesture>({
    accumulatedDeltaX: 0,
    lastEventAt: 0,
    lockedDirection: null,
    lockedUntil: 0
  });
  const [activeDateKey, setActiveDateKey] = useState(initialActiveDateKey);
  const [loadedDays, setLoadedDays] = useState<HomepageDayPayload[]>(() => [
    initialDay
  ]);
  const [loadingDateKey, setLoadingDateKey] = useState<string | null>(null);
  const [dayLoadError, setDayLoadError] = useState<string | null>(null);
  const [calendarMonthKey, setCalendarMonthKey] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDateHeaderStuck, setIsDateHeaderStuck] = useState(false);
  const [openGigId, setOpenGigId] = useState<string | null>(null);
  const [transition, setTransition] = useState<BrowserTransition | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [todayDateKey] = useState(() => getPerthDateKey(new Date()));
  const selectedVenueSlugKey = selectedVenueSlugs.join("|");
  const availableDateKeys = useMemo(
    () => availableDays.map((day) => day.dateKey),
    [availableDays]
  );
  const availableDayMap = useMemo(
    () => new Map(availableDays.map((day) => [day.dateKey, day])),
    [availableDays]
  );
  const loadedDayMap = useMemo(
    () => new Map(loadedDays.map((day) => [day.dateKey, day])),
    [loadedDays]
  );
  const activeDay = loadedDayMap.get(activeDateKey) ?? initialDay;
  const previousDateKey = getAdjacentDateKey(
    availableDateKeys,
    activeDateKey,
    "previous"
  );
  const nextDateKey = getAdjacentDateKey(availableDateKeys, activeDateKey, "next");
  const isAnimating = transition !== null;
  const isLoadingDay = loadingDateKey !== null;
  const isNavigationLocked = isAnimating || isLoadingDay;
  const isContentAnimating = transition?.phase === "animating";
  const activeCalendarMonthKey = getInitialHomepageCalendarMonthKey(
    activeDateKey,
    availableDateKeys
  );
  const visibleCalendarMonthKey = calendarMonthKey ?? activeCalendarMonthKey;
  const calendarMonth = visibleCalendarMonthKey
    ? buildHomepageCalendarMonth({
        activeDateKey,
        availableDateKeys,
        monthKey: visibleCalendarMonthKey,
        todayDateKey
      })
    : null;
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
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      pendingDayLoadsRef.current.clear();
    };
  }, []);

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

  useEffect(() => {
    setActiveDateKey(initialActiveDateKey);
    setLoadedDays([initialDay]);
    setLoadingDateKey(null);
    setDayLoadError(null);
    setCalendarMonthKey(
      getInitialHomepageCalendarMonthKey(initialActiveDateKey, availableDateKeys)
    );
    setIsCalendarOpen(false);
    setOpenGigId(null);
    setTransition(null);
    pendingDayLoadsRef.current.clear();
    preloadedImageUrlsRef.current.clear();
  }, [availableDateKeys, initialActiveDateKey, initialDay]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleRequestedActiveDate(event: Event) {
      const nextDateKey = getHomepageRequestedDateKey(event);

      if (!nextDateKey || !availableDateKeys.includes(nextDateKey)) {
        return;
      }

      void startDateChange(nextDateKey, {
        revertUrlOnFailure: true,
        urlAlreadyUpdated: true
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
  }, [
    activeDateKey,
    availableDateKeys,
    currentQuery,
    isNavigationLocked,
    loadedDayMap,
    pathname,
    prefersReducedMotion,
    selectedVenueSlugKey
  ]);

  useEffect(() => {
    if (transition) {
      setIsCalendarOpen(false);
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
    if (typeof window === "undefined" || !activeDateKey) {
      return;
    }

    for (const dateKey of [previousDateKey, nextDateKey]) {
      if (dateKey) {
        prefetchHomepageDay(dateKey);
      }
    }
  }, [
    activeDateKey,
    currentQuery,
    loadedDayMap,
    nextDateKey,
    previousDateKey,
    selectedVenueSlugKey
  ]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !activeDateKey ||
      shouldSkipAdjacentImagePreload()
    ) {
      return;
    }

    const preloadUrls = getAdjacentGigImagePreloadUrls(
      loadedDayMap,
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
  }, [activeDateKey, loadedDayMap, nextDateKey, previousDateKey]);

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

  function clearCalendarGesture() {
    calendarGestureRef.current = null;
  }

  function cacheHomepageDay(day: HomepageDayPayload) {
    setLoadedDays((currentDays) =>
      mergeHomepageDayCache(currentDays, day, availableDateKeys)
    );
  }

  async function fetchHomepageDay(
    dateKey: string
  ): Promise<HomepageDayPayload | null> {
    if (!availableDateKeys.includes(dateKey)) {
      return null;
    }

    const cachedDay = loadedDayMap.get(dateKey);

    if (cachedDay) {
      return cachedDay;
    }

    const pendingLoad = pendingDayLoadsRef.current.get(dateKey);

    if (pendingLoad) {
      return pendingLoad;
    }

    const requestPath = buildHomepageDayRequestPath({
      dateKey,
      query: currentQuery,
      venueSlugs: selectedVenueSlugs
    });
    const request = fetch(requestPath, {
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error("Could not load gigs for that date.");
      }

      const payload: unknown = await response.json();

      if (!isHomepageDayPayload(payload)) {
        throw new Error("The date payload was malformed.");
      }

      if (isMountedRef.current) {
        cacheHomepageDay(payload);
      }

      return payload;
    });

    pendingDayLoadsRef.current.set(dateKey, request);

    try {
      return await request;
    } finally {
      pendingDayLoadsRef.current.delete(dateKey);
    }
  }

  function prefetchHomepageDay(dateKey: string) {
    if (
      loadedDayMap.has(dateKey) ||
      pendingDayLoadsRef.current.has(dateKey)
    ) {
      return;
    }

    void fetchHomepageDay(dateKey).catch(() => {});
  }

  async function ensureHomepageDayForNavigation(dateKey: string): Promise<boolean> {
    if (loadedDayMap.has(dateKey)) {
      return true;
    }

    setLoadingDateKey(dateKey);

    try {
      const day = await fetchHomepageDay(dateKey);

      return Boolean(day);
    } catch (error) {
      console.error(error);
      setDayLoadError("Could not load that date. Try again.");

      return false;
    } finally {
      setLoadingDateKey((currentDateKey) =>
        currentDateKey === dateKey ? null : currentDateKey
      );
    }
  }

  function finishTransition(dateKey: string) {
    setActiveDateKey(dateKey);
    setCalendarMonthKey(
      getInitialHomepageCalendarMonthKey(dateKey, availableDateKeys)
    );
    setTransition((current) =>
      current?.toDateKey === dateKey ? null : current
    );
  }

  async function startDateChange(
    nextDateKey: string,
    options: {
      announce?: boolean;
      replaceUrl?: boolean;
      revertUrlOnFailure?: boolean;
      transition?: DayTransition;
      urlAlreadyUpdated?: boolean;
    } = {}
  ): Promise<boolean> {
    if (isNavigationLocked || !availableDateKeys.includes(nextDateKey)) {
      return false;
    }

    setOpenGigId(null);
    setIsCalendarOpen(false);
    setDayLoadError(null);
    wheelGestureRef.current.accumulatedDeltaX = 0;

    if (nextDateKey === activeDateKey) {
      return true;
    }

    const hasDay = await ensureHomepageDayForNavigation(nextDateKey);

    if (!hasDay) {
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
      setTransition(null);
      setActiveDateKey(nextDateKey);
      setCalendarMonthKey(
        getInitialHomepageCalendarMonthKey(nextDateKey, availableDateKeys)
      );

      return true;
    }

    const requestedTransition =
      options.transition ??
      getRequestedDayTransition(availableDateKeys, activeDateKey, nextDateKey);

    if (!requestedTransition) {
      setTransition(null);
      setActiveDateKey(nextDateKey);
      setCalendarMonthKey(
        getInitialHomepageCalendarMonthKey(nextDateKey, availableDateKeys)
      );

      return true;
    }

    setTransition({
      ...requestedTransition,
      phase: "preparing"
    });

    return true;
  }

  function handleNavigate(direction: SwipeDirection): boolean {
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

    void startDateChange(nextTransition.toDateKey, {
      announce: true,
      replaceUrl: true,
      transition: nextTransition
    });

    return true;
  }

  function handleCalendarDateSelect(dateKey: string) {
    if (isNavigationLocked) {
      return;
    }

    if (calendarSwipeConsumedRef.current) {
      calendarSwipeConsumedRef.current = false;
      return;
    }

    setIsCalendarOpen(false);

    if (dateKey === activeDateKey) {
      return;
    }

    void startDateChange(dateKey, {
      announce: true,
      replaceUrl: true
    });
  }

  function markCalendarSwipeConsumed() {
    calendarSwipeConsumedRef.current = true;

    window.setTimeout(() => {
      calendarSwipeConsumedRef.current = false;
    }, 0);
  }

  function handleCalendarMonthNavigate(direction: SwipeDirection): boolean {
    if (!calendarMonth) {
      return false;
    }

    const nextMonthKey =
      direction === "next"
        ? calendarMonth.nextMonthKey
        : calendarMonth.previousMonthKey;

    if (!nextMonthKey) {
      return false;
    }

    setCalendarMonthKey(nextMonthKey);

    return true;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (
      isNavigationLocked ||
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

    if (!gesture || gesture.pointerId !== event.pointerId || isNavigationLocked) {
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

  function handleCalendarPointerDown(event: React.PointerEvent<HTMLElement>) {
    event.stopPropagation();

    if (
      isNavigationLocked ||
      (event.pointerType !== "touch" && event.pointerType !== "pen")
    ) {
      return;
    }

    calendarGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCalendarPointerUp(event: React.PointerEvent<HTMLElement>) {
    event.stopPropagation();

    const gesture = calendarGestureRef.current;

    clearCalendarGesture();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!gesture || gesture.pointerId !== event.pointerId || isNavigationLocked) {
      return;
    }

    const direction = getSwipeDirection(
      event.clientX - gesture.startX,
      event.clientY - gesture.startY
    );

    if (!direction || !handleCalendarMonthNavigate(direction)) {
      return;
    }

    event.preventDefault();
    markCalendarSwipeConsumed();
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

    if (isNavigationLocked) {
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

  function handleCalendarWheel(event: React.WheelEvent<HTMLElement>) {
    event.stopPropagation();

    const now = Date.now();
    const currentGesture = calendarWheelGestureRef.current;

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

    if (isNavigationLocked) {
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
    if (handleCalendarMonthNavigate(direction)) {
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
      aria-busy={isLoadingDay ? "true" : undefined}
      data-preview-revision={previewAssetRevision}
      data-calendar-open={isCalendarOpen ? "true" : undefined}
      className="day-browser"
      onPointerCancel={clearGesture}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      <h2 className="sr-only">{activeDay.heading}</h2>
      <span
        aria-hidden="true"
        className="day-browser__sticky-sentinel"
        ref={stickySentinelRef}
      />
      <Box
        className="day-browser__header"
        data-stuck={isDateHeaderStuck ? "true" : undefined}
      >
        <ActionIcon
          aria-label="Previous date"
          className="day-browser__arrow"
          disabled={!previousDateKey || isNavigationLocked}
          onClick={() => handleNavigate("previous")}
          type="button"
          variant="subtle"
        >
          <span aria-hidden="true">&lt;</span>
        </ActionIcon>
        <Popover
          middlewares={{ flip: true, shift: true }}
          onChange={setIsCalendarOpen}
          opened={isCalendarOpen}
          position="bottom"
          shadow="xl"
          width="auto"
          withArrow
        >
          <Popover.Target>
            <UnstyledButton
              aria-expanded={isCalendarOpen}
              aria-haspopup="dialog"
              aria-label={`Choose date, currently ${activeDay.heading}`}
              className="day-browser__heading-button"
              disabled={isNavigationLocked || !calendarMonth}
              onClick={() => setIsCalendarOpen((current) => !current)}
              type="button"
            >
              <span className="sr-only">{activeDay.heading}</span>
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
                      <span className="day-browser__heading-title">
                        {loadedDayMap.get(dateKey)?.heading ??
                          availableDayMap.get(dateKey)?.heading ??
                          activeDay.heading}
                      </span>
                    </Box>
                  ))}
                </Box>
              </Box>
            </UnstyledButton>
          </Popover.Target>
          <Popover.Dropdown
            aria-label="Choose date"
            className="day-calendar"
            onPointerCancel={clearCalendarGesture}
            onPointerDown={handleCalendarPointerDown}
            onPointerUp={handleCalendarPointerUp}
            onWheel={handleCalendarWheel}
            role="dialog"
          >
            {calendarMonth ? (
              <>
                <div className="day-calendar__header">
                  <ActionIcon
                    aria-label="Previous calendar month"
                    className="day-calendar__month-button"
                    disabled={!calendarMonth.previousMonthKey}
                    onClick={() =>
                      setCalendarMonthKey(calendarMonth.previousMonthKey)
                    }
                    type="button"
                    variant="subtle"
                  >
                    <span aria-hidden="true">&lt;</span>
                  </ActionIcon>
                  <Text className="day-calendar__month-label" component="p">
                    {calendarMonth.label}
                  </Text>
                  <ActionIcon
                    aria-label="Next calendar month"
                    className="day-calendar__month-button"
                    disabled={!calendarMonth.nextMonthKey}
                    onClick={() => setCalendarMonthKey(calendarMonth.nextMonthKey)}
                    type="button"
                    variant="subtle"
                  >
                    <span aria-hidden="true">&gt;</span>
                  </ActionIcon>
                </div>
                <div className="day-calendar__weekdays" aria-hidden="true">
                  {CALENDAR_WEEKDAY_LABELS.map((weekday) => (
                    <span key={weekday}>{weekday}</span>
                  ))}
                </div>
                <div
                  aria-label={`${calendarMonth.label} gig dates`}
                  className="day-calendar__grid"
                  role="group"
                >
                  {calendarMonth.weeks.flatMap((week) =>
                    week.map((day) => {
                      const className = [
                        "day-calendar__day",
                        day.isCurrentMonth ? "" : "day-calendar__day--outside",
                        day.isEnabled ? "day-calendar__day--enabled" : "",
                        day.isActive ? "day-calendar__day--active" : "",
                        day.isToday ? "day-calendar__day--today" : ""
                      ]
                        .filter(Boolean)
                        .join(" ");

                      return (
                        <UnstyledButton
                          aria-current={day.isActive ? "date" : undefined}
                          aria-disabled={!day.isEnabled}
                          aria-label={`${day.dateKey}${
                            day.isEnabled ? "" : ", no gigs"
                          }`}
                          className={className}
                          disabled={!day.isEnabled}
                          key={day.dateKey}
                          onClick={() => handleCalendarDateSelect(day.dateKey)}
                          style={
                            day.gridColumnStart
                              ? { gridColumnStart: day.gridColumnStart }
                              : undefined
                          }
                          type="button"
                        >
                          {day.dayOfMonth}
                        </UnstyledButton>
                      );
                    })
                  )}
                </div>
              </>
            ) : null}
          </Popover.Dropdown>
        </Popover>
        <ActionIcon
          aria-label="Next date"
          className="day-browser__arrow"
          disabled={!nextDateKey || isNavigationLocked}
          onClick={() => handleNavigate("next")}
          type="button"
          variant="subtle"
        >
          <span aria-hidden="true">&gt;</span>
        </ActionIcon>
      </Box>
      {isLoadingDay ? (
        <span className="sr-only" role="status">
          Loading gigs for the selected date.
        </span>
      ) : null}
      {dayLoadError ? (
        <Text className="sr-only" component="p" role="status">
          {dayLoadError}
        </Text>
      ) : null}

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
            const day = loadedDayMap.get(dateKey);

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
