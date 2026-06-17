"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject
} from "react";

interface HomepageDayScrollIntentInput {
  isDateHeaderStuck: boolean;
  scrollTop?: number;
  targetDateKey?: string;
}

interface HomepageDayScrollTargetInput {
  contentTop: number;
  currentScrollY: number;
  offset?: number;
  stickyHeaderHeight: number;
}

interface HomepageDayStickyScrollTargetInput
  extends HomepageDayScrollTargetInput {
  stickySentinelTop: number;
}

interface UseHomepageDayScrollRestorationOptions {
  activeDateKey: string;
  isContentAnimating: boolean;
  isDateTransitioning: boolean;
  isDateHeaderStuck: boolean;
  scrollTargetContentRef: RefObject<HTMLElement | null>;
  stickyHeaderRef: RefObject<HTMLElement | null>;
  stickySentinelRef: RefObject<HTMLElement | null>;
}

interface HomepageDayScrollRestoration {
  captureDateChangeLayout: (targetDateKey?: string) => void;
  clearDateChangeLayout: () => void;
  scrollAlignmentDateKey: string | null;
  scrollAlignmentOffset: number;
  scrollCarryoverDateKey: string | null;
  scrollCarryoverReserve: number;
  scrollReserveHeight: number;
  scrollReserveTargetDateKey: string | null;
}

type HomepageDayScrollIntentMode = "sticky" | "preserve-scroll";

interface HomepageDayScrollIntent {
  capturedScrollTop: number;
  mode: HomepageDayScrollIntentMode;
  targetDateKey: string;
  timestamp: number;
}

interface HomepageDayScrollReservePlan {
  alignmentOffset: number;
  dateKey: string | null;
  hasVisualAlignmentDebt: boolean;
  height: number;
  isPlanned: boolean;
  mode: HomepageDayScrollIntentMode | null;
  naturalMaxScrollTop: number | null;
  scrollTarget: number | null;
}

interface HomepageDayScrollCarryoverReserve {
  dateKey: string | null;
  height: number;
}

type HomepageDayScrollIntentWindow = Window &
  typeof globalThis & {
    __gigRadarHomepageDayStickyScrollIntent?: HomepageDayScrollIntent | null;
  };

const ACTIVE_DAY_SCROLL_OFFSET_PX = 8;
const STICKY_ACTIVATION_OFFSET_PX = 1;
const STICKY_SCROLL_INTENT_STORAGE_KEY =
  "gig-radar:homepage-day-sticky-scroll-intent";
const STICKY_SCROLL_INTENT_TTL_MS = 30000;
const EMPTY_RESERVE_PLAN: HomepageDayScrollReservePlan = {
  alignmentOffset: 0,
  dateKey: null,
  hasVisualAlignmentDebt: false,
  height: 0,
  isPlanned: false,
  mode: null,
  naturalMaxScrollTop: null,
  scrollTarget: null
};
const EMPTY_CARRYOVER_RESERVE: HomepageDayScrollCarryoverReserve = {
  dateKey: null,
  height: 0
};

export function getHomepageDayScrollIntent({
  isDateHeaderStuck,
  scrollTop = 0,
  targetDateKey
}: HomepageDayScrollIntentInput): HomepageDayScrollIntent | null {
  if (!targetDateKey) {
    return null;
  }

  const capturedScrollTop = Math.max(0, scrollTop);

  if (!isDateHeaderStuck && capturedScrollTop <= 0) {
    return null;
  }

  return {
    capturedScrollTop,
    mode: isDateHeaderStuck ? "sticky" : "preserve-scroll",
    targetDateKey,
    timestamp: Date.now()
  };
}

export function getNextHomepageDayScrollIntent({
  currentIntent,
  nextIntent
}: {
  currentIntent: HomepageDayScrollIntent | null;
  nextIntent: HomepageDayScrollIntent | null;
}): HomepageDayScrollIntent | null {
  if (!nextIntent) {
    return null;
  }

  if (
    !currentIntent ||
    currentIntent.targetDateKey !== nextIntent.targetDateKey
  ) {
    return nextIntent;
  }

  if (currentIntent.mode === "sticky") {
    return currentIntent;
  }

  if (nextIntent.mode === "sticky") {
    return nextIntent;
  }

  return nextIntent.capturedScrollTop > currentIntent.capturedScrollTop
    ? nextIntent
    : currentIntent;
}

export function shouldRestoreHomepageDayScroll(
  intent: HomepageDayScrollIntent | null,
  activeDateKey: string,
  isContentAnimating: boolean,
  isDateTransitioning: boolean
): boolean {
  return (
    intent?.mode === "sticky" &&
    intent?.targetDateKey === activeDateKey &&
    !isContentAnimating &&
    !isDateTransitioning
  );
}

export function getHomepageDayScrollTarget({
  contentTop,
  currentScrollY,
  offset = ACTIVE_DAY_SCROLL_OFFSET_PX,
  stickyHeaderHeight
}: HomepageDayScrollTargetInput): number {
  return Math.max(
    0,
    currentScrollY + contentTop - stickyHeaderHeight - offset
  );
}

export function getHomepageDayStickyScrollTarget({
  stickySentinelTop,
  ...input
}: HomepageDayStickyScrollTargetInput): number {
  const contentScrollTarget = getHomepageDayScrollTarget(input);
  const stickyActivationTarget = Math.max(
    0,
    input.currentScrollY + stickySentinelTop + STICKY_ACTIVATION_OFFSET_PX
  );

  return Math.max(contentScrollTarget, stickyActivationTarget);
}

export function getHomepageDayScrollAlignmentOffset({
  currentScrollTop,
  mode,
  scrollTarget
}: {
  currentScrollTop: number;
  mode: HomepageDayScrollIntentMode | null;
  scrollTarget: number | null;
}): number {
  if (mode !== "sticky" || scrollTarget === null) {
    return 0;
  }

  return Math.max(0, currentScrollTop - scrollTarget);
}

export function shouldUseHomepageDayVisualAlignmentDebt({
  alignmentOffset,
  mode
}: {
  alignmentOffset: number;
  mode: HomepageDayScrollIntentMode | null;
}): boolean {
  return mode === "sticky" && alignmentOffset > 0;
}

export function getNextHomepageDayScrollAlignmentOffset({
  currentAlignmentOffset,
  scrollTarget,
  scrollTop
}: {
  currentAlignmentOffset: number;
  scrollTarget: number | null;
  scrollTop: number;
}): number {
  if (scrollTarget === null) {
    return 0;
  }

  return Math.min(
    currentAlignmentOffset,
    Math.max(0, scrollTop - scrollTarget)
  );
}

export function getHomepageDayNaturalMaxScrollTop({
  clientHeight,
  scrollHeight
}: {
  clientHeight: number;
  scrollHeight: number;
}): number {
  return scrollHeight - clientHeight;
}

export function getHomepageDayScrollDebt({
  naturalMaxScrollTop,
  scrollTop
}: {
  naturalMaxScrollTop: number;
  scrollTop: number;
}): number {
  return Math.max(0, scrollTop - naturalMaxScrollTop);
}

export function getHomepageDayPreservedScrollTarget({
  capturedScrollTop,
  currentScrollTop,
  naturalMaxScrollTop,
  reserveHeight
}: {
  capturedScrollTop: number;
  currentScrollTop: number;
  naturalMaxScrollTop: number;
  reserveHeight: number;
}): number | null {
  if (capturedScrollTop <= 0 || currentScrollTop >= capturedScrollTop) {
    return null;
  }

  const maxScrollTopWithReserve = Math.max(
    0,
    naturalMaxScrollTop + reserveHeight
  );
  const scrollTarget = Math.min(capturedScrollTop, maxScrollTopWithReserve);

  return scrollTarget > currentScrollTop ? scrollTarget : null;
}

export function getHomepageDayScrollCarryoverReserve({
  activeDateKey,
  reserveDateKey,
  reserveHeight
}: {
  activeDateKey: string;
  reserveDateKey: string | null;
  reserveHeight: number;
}): HomepageDayScrollCarryoverReserve {
  return reserveDateKey === activeDateKey && reserveHeight > 0
    ? {
        dateKey: activeDateKey,
        height: reserveHeight
      }
    : EMPTY_CARRYOVER_RESERVE;
}

export function getNextHomepageDayScrollDebtReserve({
  currentReserveHeight,
  naturalMaxScrollTop,
  scrollTop
}: {
  currentReserveHeight: number;
  naturalMaxScrollTop: number;
  scrollTop: number;
}): number {
  if (scrollTop <= Math.max(0, naturalMaxScrollTop)) {
    return 0;
  }

  return Math.min(
    currentReserveHeight,
    getHomepageDayScrollDebt({
      naturalMaxScrollTop,
      scrollTop
    })
  );
}

export function getHomepageDayTargetDocumentHeight({
  currentContentHeight,
  documentHeight,
  targetContentHeight
}: {
  currentContentHeight: number;
  documentHeight: number;
  targetContentHeight: number;
}): number {
  return Math.max(0, documentHeight - currentContentHeight + targetContentHeight);
}

export function getInitialHomepageDayScrollReservePlan(
  intent: HomepageDayScrollIntent | null,
  provisionalReserveHeight = 0
): HomepageDayScrollReservePlan {
  const provisionalHeight =
    intent?.mode === "sticky" ? Math.max(0, provisionalReserveHeight) : 0;

  return {
    alignmentOffset: 0,
    dateKey: intent?.targetDateKey ?? null,
    hasVisualAlignmentDebt: false,
    height: intent ? provisionalHeight : 0,
    isPlanned: false,
    mode: intent?.mode ?? null,
    naturalMaxScrollTop: null,
    scrollTarget: null
  };
}

export function shouldPlanHomepageDayScrollReserve({
  intent,
  reserveIsPlanned,
  reserveDateKey,
  reserveMode
}: {
  intent: HomepageDayScrollIntent | null;
  reserveDateKey: string | null;
  reserveIsPlanned: boolean;
  reserveMode: HomepageDayScrollIntentMode | null;
}): boolean {
  return Boolean(
    intent &&
      intent.targetDateKey === reserveDateKey &&
      intent.mode === reserveMode &&
      !reserveIsPlanned
  );
}

export function isHomepageDayScrollIntentFresh(
  intent: HomepageDayScrollIntent | null,
  now = Date.now()
): boolean {
  return Boolean(
    intent &&
      now - intent.timestamp >= 0 &&
      now - intent.timestamp <= STICKY_SCROLL_INTENT_TTL_MS
  );
}

function readStoredHomepageDayScrollIntent(): HomepageDayScrollIntent | null {
  if (typeof window === "undefined") {
    return null;
  }

  const browserWindow = window as HomepageDayScrollIntentWindow;
  const inMemoryIntent =
    browserWindow.__gigRadarHomepageDayStickyScrollIntent ?? null;

  if (isHomepageDayScrollIntentFresh(inMemoryIntent)) {
    return inMemoryIntent;
  }

  browserWindow.__gigRadarHomepageDayStickyScrollIntent = null;

  try {
    const rawIntent = window.sessionStorage.getItem(
      STICKY_SCROLL_INTENT_STORAGE_KEY
    );

    if (!rawIntent) {
      return null;
    }

    const maybeIntent = JSON.parse(rawIntent) as Partial<HomepageDayScrollIntent>;
    const mode =
      maybeIntent.mode === "sticky" ||
      maybeIntent.mode === "preserve-scroll" ||
      maybeIntent.mode === undefined
        ? maybeIntent.mode ?? "sticky"
        : null;
    const intent =
      typeof maybeIntent.targetDateKey === "string" &&
      typeof maybeIntent.timestamp === "number" &&
      mode
        ? {
            capturedScrollTop:
              typeof maybeIntent.capturedScrollTop === "number"
                ? maybeIntent.capturedScrollTop
                : window.scrollY,
            mode,
            targetDateKey: maybeIntent.targetDateKey,
            timestamp: maybeIntent.timestamp
          }
        : null;

    if (!isHomepageDayScrollIntentFresh(intent)) {
      return null;
    }

    browserWindow.__gigRadarHomepageDayStickyScrollIntent = intent;

    return intent;
  } catch {
    return null;
  }
}

function writeStoredHomepageDayScrollIntent(
  intent: HomepageDayScrollIntent | null
) {
  if (typeof window === "undefined") {
    return;
  }

  const browserWindow = window as HomepageDayScrollIntentWindow;
  browserWindow.__gigRadarHomepageDayStickyScrollIntent = intent;

  try {
    if (!intent) {
      window.sessionStorage.removeItem(STICKY_SCROLL_INTENT_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      STICKY_SCROLL_INTENT_STORAGE_KEY,
      JSON.stringify(intent)
    );
  } catch {
    // Storage can be unavailable in privacy modes; in-memory intent still works.
  }
}

function getDocumentHeight() {
  const body = document.body;
  const documentElement = document.documentElement;

  return Math.max(
    body.scrollHeight,
    body.offsetHeight,
    documentElement.clientHeight,
    documentElement.scrollHeight,
    documentElement.offsetHeight
  );
}

export function useHomepageDayScrollRestoration(
  options: UseHomepageDayScrollRestorationOptions
): HomepageDayScrollRestoration {
  const {
    activeDateKey,
    isContentAnimating,
    isDateTransitioning,
    isDateHeaderStuck,
    scrollTargetContentRef,
    stickyHeaderRef,
    stickySentinelRef
  } = options;
  const lastKnownStickyRef = useRef(false);
  const pendingScrollIntentRef = useRef<HomepageDayScrollIntent | null>(null);
  const pendingScrollTargetRef = useRef<number | null>(null);
  const previousActiveDateKeyRef = useRef(activeDateKey);
  const carryoverReserveRef =
    useRef<HomepageDayScrollCarryoverReserve>(EMPTY_CARRYOVER_RESERVE);
  const reservePlanRef =
    useRef<HomepageDayScrollReservePlan>(EMPTY_RESERVE_PLAN);
  const scrollRestoreFrameRef = useRef<number | null>(null);
  const [reservePlan, setReservePlan] =
    useState<HomepageDayScrollReservePlan>(EMPTY_RESERVE_PLAN);
  const [carryoverReserve, setCarryoverReserve] =
    useState<HomepageDayScrollCarryoverReserve>(EMPTY_CARRYOVER_RESERVE);
  const [pendingScrollIntent, setPendingScrollIntentState] =
    useState<HomepageDayScrollIntent | null>(null);
  const [pendingScrollTarget, setPendingScrollTargetState] =
    useState<number | null>(null);

  function cancelScrollFrames() {
    if (scrollRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollRestoreFrameRef.current);
      scrollRestoreFrameRef.current = null;
    }
  }

  function setPendingScrollIntent(nextIntent: HomepageDayScrollIntent | null) {
    pendingScrollIntentRef.current = nextIntent;
    writeStoredHomepageDayScrollIntent(nextIntent);
    setPendingScrollIntentState(nextIntent);
  }

  function setPendingScrollTarget(nextTarget: number | null) {
    pendingScrollTargetRef.current = nextTarget;
    setPendingScrollTargetState(nextTarget);
  }

  function clearReservePlan() {
    reservePlanRef.current = EMPTY_RESERVE_PLAN;
    setReservePlan(EMPTY_RESERVE_PLAN);
  }

  function clearCarryoverReserve() {
    carryoverReserveRef.current = EMPTY_CARRYOVER_RESERVE;
    setCarryoverReserve(EMPTY_CARRYOVER_RESERVE);
  }

  function updateReservePlan(nextReservePlan: HomepageDayScrollReservePlan) {
    reservePlanRef.current = nextReservePlan;
    setReservePlan(nextReservePlan);
  }

  function updateCarryoverReserve(
    nextCarryoverReserve: HomepageDayScrollCarryoverReserve
  ) {
    carryoverReserveRef.current = nextCarryoverReserve;
    setCarryoverReserve(nextCarryoverReserve);
  }

  function getStickySentinelTop() {
    const sentinel =
      stickySentinelRef.current ??
      document.querySelector<HTMLElement>(".day-browser__sticky-sentinel");

    return sentinel?.getBoundingClientRect().top ?? 0;
  }

  function getStickyHeaderHeight() {
    const header =
      stickyHeaderRef.current ??
      document.querySelector<HTMLElement>(".day-browser__header");

    return header?.getBoundingClientRect().height ?? 0;
  }

  function isDateHeaderStuckNow() {
    const nextIsStuck =
      isDateHeaderStuck ||
      lastKnownStickyRef.current ||
      getStickySentinelTop() < 0;

    lastKnownStickyRef.current = nextIsStuck;

    return nextIsStuck;
  }

  function getCurrentNaturalMaxScrollTop(): number | null {
    if (typeof window === "undefined") {
      return null;
    }

    const targetContent = scrollTargetContentRef.current;

    if (!targetContent) {
      return null;
    }

    const targetContentRect = targetContent.getBoundingClientRect();
    const contentViewport = targetContent.closest(
      ".day-browser__content-viewport"
    );
    const targetDocumentHeight = getHomepageDayTargetDocumentHeight({
      currentContentHeight:
        contentViewport?.getBoundingClientRect().height ??
        targetContentRect.height,
      documentHeight: getDocumentHeight(),
      targetContentHeight: targetContentRect.height
    });

    return getHomepageDayNaturalMaxScrollTop({
      clientHeight: window.innerHeight,
      scrollHeight: targetDocumentHeight
    });
  }

  function getCurrentStickyScrollTarget(): number | null {
    if (typeof window === "undefined") {
      return null;
    }

    const targetContent = scrollTargetContentRef.current;

    if (!targetContent) {
      return null;
    }

    return getHomepageDayStickyScrollTarget({
      contentTop: targetContent.getBoundingClientRect().top,
      currentScrollY: window.scrollY,
      stickySentinelTop: getStickySentinelTop(),
      stickyHeaderHeight: getStickyHeaderHeight()
    });
  }

  function shrinkScrollDebtReserve() {
    if (typeof window === "undefined") {
      return;
    }

    const hasPendingRestore =
      Boolean(pendingScrollIntentRef.current) ||
      pendingScrollTargetRef.current !== null ||
      scrollRestoreFrameRef.current !== null;

    if (hasPendingRestore) {
      return;
    }

    const currentReservePlan = reservePlanRef.current;

    if (!currentReservePlan.dateKey) {
      return;
    }

    const measuredNaturalMaxScrollTop = getCurrentNaturalMaxScrollTop();
    const naturalMaxScrollTop =
      measuredNaturalMaxScrollTop ?? currentReservePlan.naturalMaxScrollTop;
    const nextReserveHeight =
      currentReservePlan.height > 0 && naturalMaxScrollTop !== null
        ? getNextHomepageDayScrollDebtReserve({
            currentReserveHeight: currentReservePlan.height,
            naturalMaxScrollTop,
            scrollTop: window.scrollY
          })
        : currentReservePlan.height;
    const nextAlignmentOffset = currentReservePlan.hasVisualAlignmentDebt
      ? getNextHomepageDayScrollAlignmentOffset({
          currentAlignmentOffset: currentReservePlan.alignmentOffset,
          scrollTarget: currentReservePlan.scrollTarget,
          scrollTop: window.scrollY
        })
      : currentReservePlan.alignmentOffset;
    const nextHasVisualAlignmentDebt =
      currentReservePlan.hasVisualAlignmentDebt && nextAlignmentOffset > 0;

    if (nextReserveHeight <= 0 && !nextHasVisualAlignmentDebt) {
      clearReservePlan();
      return;
    }

    if (
      nextReserveHeight < currentReservePlan.height ||
      nextAlignmentOffset < currentReservePlan.alignmentOffset ||
      nextHasVisualAlignmentDebt !==
        currentReservePlan.hasVisualAlignmentDebt ||
      naturalMaxScrollTop !== currentReservePlan.naturalMaxScrollTop
    ) {
      updateReservePlan({
        ...currentReservePlan,
        alignmentOffset: nextAlignmentOffset,
        hasVisualAlignmentDebt: nextHasVisualAlignmentDebt,
        height: nextReserveHeight,
        naturalMaxScrollTop
      });
    }
  }

  function captureDateChangeLayout(targetDateKey?: string) {
    cancelScrollFrames();
    setPendingScrollTarget(null);

    const currentReservePlan = reservePlanRef.current;
    const nextIntent = getNextHomepageDayScrollIntent({
      currentIntent: pendingScrollIntentRef.current,
      nextIntent: getHomepageDayScrollIntent({
        isDateHeaderStuck: isDateHeaderStuckNow(),
        scrollTop: window.scrollY,
        targetDateKey
      })
    });
    const provisionalReserveHeight = nextIntent ? window.innerHeight : 0;

    setPendingScrollIntent(nextIntent);
    updateCarryoverReserve(
      getHomepageDayScrollCarryoverReserve({
        activeDateKey,
        reserveDateKey: currentReservePlan.dateKey,
        reserveHeight: currentReservePlan.height
      })
    );
    updateReservePlan(
      getInitialHomepageDayScrollReservePlan(
        nextIntent,
        provisionalReserveHeight
      )
    );
  }

  function getFallbackStickyIntent(): HomepageDayScrollIntent | null {
    if (
      typeof window === "undefined" ||
      previousActiveDateKeyRef.current === activeDateKey ||
      !lastKnownStickyRef.current
    ) {
      return null;
    }

    return {
      capturedScrollTop: window.scrollY,
      mode: "sticky",
      targetDateKey: activeDateKey,
      timestamp: Date.now()
    };
  }

  function getEffectiveScrollIntent(): HomepageDayScrollIntent | null {
    return (
      pendingScrollIntent ??
      readStoredHomepageDayScrollIntent() ??
      getFallbackStickyIntent()
    );
  }

  function clearDateChangeLayout() {
    setPendingScrollIntent(null);
    setPendingScrollTarget(null);
    cancelScrollFrames();
    clearCarryoverReserve();
    clearReservePlan();
  }

  useLayoutEffect(() => {
    const effectiveIntent = getEffectiveScrollIntent();

    if (
      typeof window === "undefined" ||
      !effectiveIntent
    ) {
      return undefined;
    }

    if (
      reservePlan.dateKey !== effectiveIntent.targetDateKey ||
      reservePlan.mode !== effectiveIntent.mode
    ) {
      updateReservePlan(
        getInitialHomepageDayScrollReservePlan(
          effectiveIntent,
          window.innerHeight
        )
      );
      return undefined;
    }

    if (
      !shouldPlanHomepageDayScrollReserve({
        intent: effectiveIntent,
        reserveIsPlanned: reservePlan.isPlanned,
        reserveDateKey: reservePlan.dateKey,
        reserveMode: reservePlan.mode
      })
    ) {
      return undefined;
    }

    const targetContent = scrollTargetContentRef.current;

    if (!targetContent) {
      return undefined;
    }

    const naturalMaxScrollTop = getCurrentNaturalMaxScrollTop();

    const scrollTarget =
      effectiveIntent.mode === "sticky"
        ? getCurrentStickyScrollTarget()
        : null;
    const capturedStickyScrollTop =
      effectiveIntent.mode === "sticky"
        ? Math.max(effectiveIntent.capturedScrollTop, window.scrollY)
        : window.scrollY;
    const alignmentOffset = getHomepageDayScrollAlignmentOffset({
      currentScrollTop: capturedStickyScrollTop,
      mode: effectiveIntent.mode,
      scrollTarget
    });
    const hasVisualAlignmentDebt = shouldUseHomepageDayVisualAlignmentDebt({
      alignmentOffset,
      mode: effectiveIntent.mode
    });
    const effectiveScrollTop =
      effectiveIntent.mode === "sticky"
        ? hasVisualAlignmentDebt
          ? capturedStickyScrollTop
          : scrollTarget ?? window.scrollY
        : effectiveIntent.capturedScrollTop;
    const scrollReserveHeight =
      naturalMaxScrollTop === null
        ? 0
        : getHomepageDayScrollDebt({
            naturalMaxScrollTop,
            scrollTop: effectiveScrollTop
          });

    updateReservePlan({
      alignmentOffset,
      dateKey: effectiveIntent.targetDateKey,
      hasVisualAlignmentDebt,
      height: scrollReserveHeight,
      isPlanned: true,
      mode: effectiveIntent.mode,
      naturalMaxScrollTop,
      scrollTarget
    });

    return undefined;
  }, [
    activeDateKey,
    isContentAnimating,
    isDateTransitioning,
    pendingScrollIntent,
    reservePlan.dateKey,
    reservePlan.isPlanned,
    reservePlan.mode,
    scrollTargetContentRef,
    stickyHeaderRef,
    stickySentinelRef
  ]);

  useLayoutEffect(() => {
    const effectiveIntent = getEffectiveScrollIntent();

    if (
      typeof window === "undefined" ||
      !effectiveIntent ||
      !shouldRestoreHomepageDayScroll(
        effectiveIntent,
        activeDateKey,
        isContentAnimating,
        isDateTransitioning
      ) ||
      reservePlan.scrollTarget === null
    ) {
      return undefined;
    }

    const scrollTarget = getCurrentStickyScrollTarget() ?? reservePlan.scrollTarget;
    const naturalMaxScrollTop = getCurrentNaturalMaxScrollTop();
    const restoreScrollTop = reservePlan.hasVisualAlignmentDebt
      ? Math.max(effectiveIntent.capturedScrollTop, window.scrollY)
      : scrollTarget;

    if (naturalMaxScrollTop !== null) {
      const requiredReserveHeight = getHomepageDayScrollDebt({
        naturalMaxScrollTop,
        scrollTop: restoreScrollTop
      });

      if (requiredReserveHeight > reservePlan.height) {
        updateReservePlan({
          ...reservePlan,
          height: requiredReserveHeight,
          naturalMaxScrollTop,
          scrollTarget
        });
        return undefined;
      }
    }

    setPendingScrollIntent(null);
    clearCarryoverReserve();
    if (reservePlan.hasVisualAlignmentDebt) {
      return undefined;
    }

    window.scrollTo({
      behavior: "auto",
      top: scrollTarget
    });

    return undefined;
  }, [
    activeDateKey,
    isContentAnimating,
    isDateTransitioning,
    pendingScrollIntent,
    reservePlan.hasVisualAlignmentDebt,
    reservePlan.height,
    reservePlan.isPlanned,
    reservePlan.naturalMaxScrollTop,
    reservePlan.scrollTarget
  ]);

  useLayoutEffect(() => {
    const effectiveIntent = getEffectiveScrollIntent();

    if (
      typeof window === "undefined" ||
      effectiveIntent?.mode !== "preserve-scroll" ||
      effectiveIntent.targetDateKey !== activeDateKey ||
      isContentAnimating ||
      isDateTransitioning ||
      !reservePlan.isPlanned ||
      reservePlan.naturalMaxScrollTop === null
    ) {
      return undefined;
    }

    const preservedScrollTarget = getHomepageDayPreservedScrollTarget({
      capturedScrollTop: effectiveIntent.capturedScrollTop,
      currentScrollTop: window.scrollY,
      naturalMaxScrollTop: reservePlan.naturalMaxScrollTop,
      reserveHeight: reservePlan.height
    });

    if (preservedScrollTarget !== null) {
      window.scrollTo({
        behavior: "auto",
        top: preservedScrollTarget
      });
    }

    setPendingScrollIntent(null);
    clearCarryoverReserve();

    return undefined;
  }, [
    activeDateKey,
    isContentAnimating,
    isDateTransitioning,
    pendingScrollIntent,
    reservePlan.height,
    reservePlan.isPlanned,
    reservePlan.naturalMaxScrollTop
  ]);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || pendingScrollTarget === null) {
      return undefined;
    }

    scrollRestoreFrameRef.current = window.requestAnimationFrame(() => {
      scrollRestoreFrameRef.current = null;
      window.scrollTo({
        behavior: "auto",
        top: pendingScrollTarget
      });
      setPendingScrollTarget(null);
    });

    return () => {
      if (scrollRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollRestoreFrameRef.current);
        scrollRestoreFrameRef.current = null;
      }
    };
  }, [pendingScrollTarget]);

  useLayoutEffect(() => {
    previousActiveDateKeyRef.current = activeDateKey;
  }, [activeDateKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function updateLastKnownStickyState() {
      const sentinelTop = getStickySentinelTop();

      lastKnownStickyRef.current = sentinelTop < 0;
      shrinkScrollDebtReserve();
    }

    updateLastKnownStickyState();
    window.addEventListener("scroll", updateLastKnownStickyState, {
      passive: true
    });
    document.addEventListener("scroll", updateLastKnownStickyState, {
      passive: true
    });
    window.addEventListener("resize", updateLastKnownStickyState);

    return () => {
      window.removeEventListener("scroll", updateLastKnownStickyState);
      document.removeEventListener("scroll", updateLastKnownStickyState);
      window.removeEventListener("resize", updateLastKnownStickyState);
    };
  }, [stickySentinelRef]);

  useEffect(() => {
    if (
      reservePlan.dateKey !== null &&
      reservePlan.dateKey !== activeDateKey &&
      !pendingScrollIntentRef.current
    ) {
      clearReservePlan();
    }
  }, [activeDateKey, reservePlan.dateKey]);

  return {
    captureDateChangeLayout,
    clearDateChangeLayout,
    scrollAlignmentDateKey:
      reservePlan.hasVisualAlignmentDebt && reservePlan.isPlanned
        ? reservePlan.dateKey
        : null,
    scrollAlignmentOffset:
      reservePlan.hasVisualAlignmentDebt && reservePlan.isPlanned
        ? reservePlan.alignmentOffset
        : 0,
    scrollCarryoverDateKey: carryoverReserve.dateKey,
    scrollCarryoverReserve: carryoverReserve.height,
    scrollReserveHeight: reservePlan.height,
    scrollReserveTargetDateKey: reservePlan.dateKey
  };
}
