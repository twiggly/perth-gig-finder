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
  isDateTransitionPreparing: boolean;
  isDateTransitioning: boolean;
  isDateTransitionSettling: boolean;
  isDateHeaderStuck: boolean;
  scrollTargetContentRef: RefObject<HTMLElement | null>;
  stickyHeaderRef: RefObject<HTMLElement | null>;
  stickySentinelRef: RefObject<HTMLElement | null>;
}

interface HomepageDayScrollRestoration {
  captureDateChangeLayout: (targetDateKey?: string) => void;
  clearDateChangeLayout: () => void;
  isStickyScrollRestorationVisualHoldActive: boolean;
  scrollAlignmentDateKey: string | null;
  scrollAlignmentOffset: number;
  scrollCarryoverDateKey: string | null;
  scrollCarryoverReserve: number;
  scrollOutgoingCompensationDateKey: string | null;
  scrollOutgoingCompensationOffset: number;
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

interface HomepageDayOutgoingScrollCompensation {
  dateKey: string | null;
  hasScrolled: boolean;
  offset: number;
  scrollTarget: number | null;
  targetDateKey: string | null;
}

interface HomepageDayStickyScrollRestorationHold {
  hasScrolled: boolean;
  retryCount: number;
  scrollTarget: number;
}

type HomepageDayStickyScrollRestorationHoldRelease =
  | "clear"
  | "keep"
  | "retry"
  | "fallback-clear";

type HomepageDayScrollIntentWindow = Window &
  typeof globalThis & {
    __gigRadarHomepageDayStickyScrollIntent?: HomepageDayScrollIntent | null;
  };

const ACTIVE_DAY_SCROLL_OFFSET_PX = 8;
const STICKY_ACTIVATION_OFFSET_PX = 1;
const STICKY_SCROLL_RESTORATION_HOLD_RELEASE_MAX_RETRIES = 3;
const STICKY_SCROLL_INTENT_STORAGE_KEY =
  "gig-radar:homepage-day-sticky-scroll-intent";
const STICKY_SCROLL_INTENT_TTL_MS = 30000;
const EMPTY_RESERVE_PLAN: HomepageDayScrollReservePlan = {
  alignmentOffset: 0,
  dateKey: null,
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
const EMPTY_OUTGOING_COMPENSATION: HomepageDayOutgoingScrollCompensation = {
  dateKey: null,
  hasScrolled: false,
  offset: 0,
  scrollTarget: null,
  targetDateKey: null
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

  if (capturedScrollTop <= 0) {
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
  isDateTransitioning: boolean,
  isDateTransitionSettling = false
): boolean {
  return (
    intent?.mode === "sticky" &&
    intent?.targetDateKey === activeDateKey &&
    !isContentAnimating &&
    (!isDateTransitioning || isDateTransitionSettling)
  );
}

export function getHomepageDayStickyScrollRestorationHoldRelease({
  currentScrollTop,
  hasScrolled,
  isHoldActive,
  maxRetryCount,
  retryCount,
  scrollTarget,
  stickySentinelTop
}: {
  currentScrollTop?: number | null;
  hasScrolled: boolean;
  isHoldActive: boolean;
  maxRetryCount: number;
  retryCount: number;
  scrollTarget?: number | null;
  stickySentinelTop?: number | null;
}): HomepageDayStickyScrollRestorationHoldRelease {
  if (!isHoldActive || !hasScrolled) {
    return "keep";
  }

  if (
    typeof currentScrollTop === "number" &&
    typeof scrollTarget === "number" &&
    currentScrollTop < scrollTarget - STICKY_ACTIVATION_OFFSET_PX
  ) {
    return "clear";
  }

  if (retryCount <= 0) {
    return "retry";
  }

  if (typeof stickySentinelTop === "number" && stickySentinelTop < 0) {
    return "clear";
  }

  if (retryCount < maxRetryCount) {
    return "retry";
  }

  return "fallback-clear";
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

export function getHomepageDayOutgoingCompensationOffset({
  capturedScrollTop,
  scrollTarget
}: {
  capturedScrollTop: number;
  scrollTarget: number | null;
}): number {
  if (scrollTarget === null || scrollTarget >= capturedScrollTop) {
    return 0;
  }

  return scrollTarget - capturedScrollTop;
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
    isDateTransitionPreparing,
    isDateTransitioning,
    isDateTransitionSettling,
    isDateHeaderStuck,
    scrollTargetContentRef,
    stickyHeaderRef,
    stickySentinelRef
  } = options;
  const lastKnownStickyRef = useRef(false);
  const pendingScrollIntentRef = useRef<HomepageDayScrollIntent | null>(null);
  const pendingScrollTargetRef = useRef<number | null>(null);
  const previousActiveDateKeyRef = useRef(activeDateKey);
  const stickyRestorationHoldReleaseFrameRef = useRef<number | null>(null);
  const stickyRestorationHoldRef =
    useRef<HomepageDayStickyScrollRestorationHold | null>(null);
  const carryoverReserveRef =
    useRef<HomepageDayScrollCarryoverReserve>(EMPTY_CARRYOVER_RESERVE);
  const outgoingCompensationRef =
    useRef<HomepageDayOutgoingScrollCompensation>(
      EMPTY_OUTGOING_COMPENSATION
    );
  const reservePlanRef =
    useRef<HomepageDayScrollReservePlan>(EMPTY_RESERVE_PLAN);
  const scrollRestoreFrameRef = useRef<number | null>(null);
  const [reservePlan, setReservePlan] =
    useState<HomepageDayScrollReservePlan>(EMPTY_RESERVE_PLAN);
  const [carryoverReserve, setCarryoverReserve] =
    useState<HomepageDayScrollCarryoverReserve>(EMPTY_CARRYOVER_RESERVE);
  const [outgoingCompensation, setOutgoingCompensationState] =
    useState<HomepageDayOutgoingScrollCompensation>(
      EMPTY_OUTGOING_COMPENSATION
    );
  const [pendingScrollIntent, setPendingScrollIntentState] =
    useState<HomepageDayScrollIntent | null>(null);
  const [pendingScrollTarget, setPendingScrollTargetState] =
    useState<number | null>(null);
  const [stickyRestorationHold, setStickyRestorationHoldState] =
    useState<HomepageDayStickyScrollRestorationHold | null>(null);

  function cancelScrollFrames() {
    if (scrollRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollRestoreFrameRef.current);
      scrollRestoreFrameRef.current = null;
    }
  }

  function cancelStickyRestorationHoldReleaseFrame() {
    if (
      typeof window !== "undefined" &&
      stickyRestorationHoldReleaseFrameRef.current !== null
    ) {
      window.cancelAnimationFrame(stickyRestorationHoldReleaseFrameRef.current);
      stickyRestorationHoldReleaseFrameRef.current = null;
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

  function setStickyRestorationHold(
    nextHold: HomepageDayStickyScrollRestorationHold | null
  ) {
    stickyRestorationHoldRef.current = nextHold;
    setStickyRestorationHoldState(nextHold);
  }

  function clearStickyRestorationHold() {
    cancelStickyRestorationHoldReleaseFrame();
    setStickyRestorationHold(null);
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

  function updateOutgoingCompensation(
    nextCompensation: HomepageDayOutgoingScrollCompensation
  ) {
    outgoingCompensationRef.current = nextCompensation;
    setOutgoingCompensationState(nextCompensation);
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
    if (typeof window !== "undefined" && window.scrollY <= 0) {
      lastKnownStickyRef.current = false;
      return false;
    }

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

  function getStickyScrollTargetForContent(
    targetContent: HTMLElement | null | undefined
  ): number | null {
    if (typeof window === "undefined") {
      return null;
    }

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

  function getCurrentStickyScrollTarget(): number | null {
    return getStickyScrollTargetForContent(scrollTargetContentRef.current);
  }

  function getCurrentActiveStickyScrollTarget(): number | null {
    if (typeof document === "undefined") {
      return null;
    }

    return getStickyScrollTargetForContent(
      document.querySelector<HTMLElement>(".gig-grid[data-active-date='true']")
    );
  }

  function shrinkScrollDebtReserve() {
    if (typeof window === "undefined") {
      return;
    }

    const hasPendingRestore =
      Boolean(pendingScrollIntentRef.current) ||
      pendingScrollTargetRef.current !== null ||
      scrollRestoreFrameRef.current !== null ||
      stickyRestorationHoldRef.current !== null;

    if (hasPendingRestore) {
      return;
    }

    const currentReservePlan = reservePlanRef.current;

    if (
      !currentReservePlan.dateKey ||
      currentReservePlan.height <= 0 ||
      currentReservePlan.naturalMaxScrollTop === null
    ) {
      return;
    }

    const measuredNaturalMaxScrollTop = getCurrentNaturalMaxScrollTop();
    const naturalMaxScrollTop =
      measuredNaturalMaxScrollTop ?? currentReservePlan.naturalMaxScrollTop;
    const nextReserveHeight = getNextHomepageDayScrollDebtReserve({
      currentReserveHeight: currentReservePlan.height,
      naturalMaxScrollTop,
      scrollTop: window.scrollY
    });

    if (nextReserveHeight <= 0) {
      clearReservePlan();
      return;
    }

    if (
      nextReserveHeight < currentReservePlan.height ||
      naturalMaxScrollTop !== currentReservePlan.naturalMaxScrollTop
    ) {
      updateReservePlan({
        ...currentReservePlan,
        height: nextReserveHeight,
        naturalMaxScrollTop
      });
    }
  }

  function captureDateChangeLayout(targetDateKey?: string) {
    cancelScrollFrames();
    clearStickyRestorationHold();
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
    const preScrollTarget =
      nextIntent?.mode === "sticky" ? getCurrentActiveStickyScrollTarget() : null;
    const outgoingCompensationOffset =
      nextIntent?.mode === "sticky"
        ? getHomepageDayOutgoingCompensationOffset({
            capturedScrollTop: window.scrollY,
            scrollTarget: preScrollTarget
          })
        : 0;
    const provisionalReserveHeight = nextIntent ? window.innerHeight : 0;

    setPendingScrollIntent(nextIntent);
    updateCarryoverReserve(
      getHomepageDayScrollCarryoverReserve({
        activeDateKey,
        reserveDateKey: currentReservePlan.dateKey,
        reserveHeight: currentReservePlan.height
      })
    );
    updateOutgoingCompensation(
      nextIntent?.mode === "sticky" && outgoingCompensationOffset < 0
        ? {
            dateKey: activeDateKey,
            hasScrolled: false,
            offset: outgoingCompensationOffset,
            scrollTarget: preScrollTarget,
            targetDateKey: nextIntent.targetDateKey
          }
        : EMPTY_OUTGOING_COMPENSATION
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
    clearStickyRestorationHold();
    clearCarryoverReserve();
    updateOutgoingCompensation(EMPTY_OUTGOING_COMPENSATION);
    clearReservePlan();
  }

  function clearDateChangeLayoutAtPageTop() {
    lastKnownStickyRef.current = false;

    const hasRestorationState =
      Boolean(pendingScrollIntentRef.current) ||
      pendingScrollTargetRef.current !== null ||
      scrollRestoreFrameRef.current !== null ||
      stickyRestorationHoldRef.current !== null ||
      reservePlanRef.current.dateKey !== null ||
      reservePlanRef.current.height > 0 ||
      carryoverReserveRef.current.dateKey !== null ||
      carryoverReserveRef.current.height > 0 ||
      outgoingCompensationRef.current.dateKey !== null ||
      outgoingCompensationRef.current.offset !== 0;

    if (hasRestorationState) {
      clearDateChangeLayout();
    }
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
    const effectiveScrollTop =
      effectiveIntent.mode === "sticky"
        ? scrollTarget ?? window.scrollY
        : effectiveIntent.capturedScrollTop;
    const scrollReserveHeight =
      naturalMaxScrollTop === null
        ? 0
        : getHomepageDayScrollDebt({
            naturalMaxScrollTop,
            scrollTop: effectiveScrollTop
          });
    const alignmentOffset = getHomepageDayScrollAlignmentOffset({
      currentScrollTop: window.scrollY,
      mode: effectiveIntent.mode,
      scrollTarget
    });

    updateReservePlan({
      alignmentOffset,
      dateKey: effectiveIntent.targetDateKey,
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
    if (
      typeof window === "undefined" ||
      !isDateTransitionPreparing ||
      outgoingCompensation.hasScrolled ||
      outgoingCompensation.offset >= 0 ||
      outgoingCompensation.scrollTarget === null
    ) {
      return undefined;
    }

    const compensationTarget = document.querySelector(
      ".day-browser__content-align[data-scroll-compensate-outgoing='true']"
    );

    if (!compensationTarget) {
      return undefined;
    }

    window.scrollTo({
      behavior: "auto",
      top: outgoingCompensation.scrollTarget
    });
    updateOutgoingCompensation({
      ...outgoingCompensation,
      hasScrolled: true
    });

    return undefined;
  }, [
    isDateTransitionPreparing,
    outgoingCompensation.dateKey,
    outgoingCompensation.hasScrolled,
    outgoingCompensation.offset,
    outgoingCompensation.scrollTarget
  ]);

  useLayoutEffect(() => {
    const effectiveIntent = getEffectiveScrollIntent();

    if (
      typeof window === "undefined" ||
      !shouldRestoreHomepageDayScroll(
        effectiveIntent,
        activeDateKey,
        isContentAnimating,
        isDateTransitioning,
        isDateTransitionSettling
      ) ||
      reservePlan.scrollTarget === null
    ) {
      return undefined;
    }

    if (
      outgoingCompensation.hasScrolled &&
      outgoingCompensation.targetDateKey === activeDateKey
    ) {
      setPendingScrollIntent(null);
      clearCarryoverReserve();
      return undefined;
    }

    const scrollTarget = getCurrentStickyScrollTarget() ?? reservePlan.scrollTarget;
    const naturalMaxScrollTop = getCurrentNaturalMaxScrollTop();

    if (naturalMaxScrollTop !== null) {
      const requiredReserveHeight = getHomepageDayScrollDebt({
        naturalMaxScrollTop,
        scrollTop: scrollTarget
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

    const currentHold = stickyRestorationHoldRef.current;

    if (!currentHold || currentHold.scrollTarget !== scrollTarget) {
      setStickyRestorationHold({
        hasScrolled: false,
        retryCount: 0,
        scrollTarget
      });
      return undefined;
    }

    if (!currentHold.hasScrolled) {
      setPendingScrollIntent(null);
      clearCarryoverReserve();
      window.scrollTo({
        behavior: "auto",
        top: scrollTarget
      });
      setStickyRestorationHold({
        hasScrolled: true,
        retryCount: 0,
        scrollTarget
      });
      return undefined;
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
    reservePlan.naturalMaxScrollTop,
    reservePlan.scrollTarget,
    isDateTransitionSettling,
    stickyRestorationHold
  ]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      if (stickyRestorationHold !== null) {
        clearStickyRestorationHold();
      }

      return undefined;
    }

    if (stickyRestorationHoldReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(stickyRestorationHoldReleaseFrameRef.current);
      stickyRestorationHoldReleaseFrameRef.current = null;
    }

    const release = getHomepageDayStickyScrollRestorationHoldRelease({
      currentScrollTop: window.scrollY,
      hasScrolled: stickyRestorationHold?.hasScrolled ?? false,
      isHoldActive: stickyRestorationHold !== null,
      maxRetryCount: STICKY_SCROLL_RESTORATION_HOLD_RELEASE_MAX_RETRIES,
      retryCount: stickyRestorationHold?.retryCount ?? 0,
      scrollTarget: stickyRestorationHold?.scrollTarget ?? null,
      stickySentinelTop:
        stickyRestorationHold === null ? null : getStickySentinelTop()
    });

    if (release === "keep") {
      return undefined;
    }

    if (release === "clear" || release === "fallback-clear") {
      clearStickyRestorationHold();
      return undefined;
    }

    stickyRestorationHoldReleaseFrameRef.current = window.requestAnimationFrame(
      () => {
        stickyRestorationHoldReleaseFrameRef.current = null;

        const currentHold = stickyRestorationHoldRef.current;

        if (!currentHold) {
          return;
        }

        setStickyRestorationHold({
          ...currentHold,
          retryCount: currentHold.retryCount + 1
        });
      }
    );

    return () => {
      if (stickyRestorationHoldReleaseFrameRef.current !== null) {
        window.cancelAnimationFrame(stickyRestorationHoldReleaseFrameRef.current);
        stickyRestorationHoldReleaseFrameRef.current = null;
      }
    };
  }, [stickyRestorationHold, stickySentinelRef]);

  useLayoutEffect(() => {
    const effectiveIntent = getEffectiveScrollIntent();

    if (
      typeof window === "undefined" ||
      effectiveIntent?.mode !== "preserve-scroll" ||
      effectiveIntent.targetDateKey !== activeDateKey ||
      isContentAnimating ||
      (isDateTransitioning && !isDateTransitionSettling) ||
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
    isDateTransitionSettling,
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
      if (window.scrollY <= 0) {
        clearDateChangeLayoutAtPageTop();
        return;
      }

      const currentHold = stickyRestorationHoldRef.current;

      if (
        currentHold?.hasScrolled &&
        window.scrollY <
          currentHold.scrollTarget - STICKY_ACTIVATION_OFFSET_PX
      ) {
        clearStickyRestorationHold();
      }

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

  useLayoutEffect(() => {
    if (!isDateTransitioning && outgoingCompensation.dateKey !== null) {
      updateOutgoingCompensation(EMPTY_OUTGOING_COMPENSATION);
    }
  }, [isDateTransitioning, outgoingCompensation.dateKey]);

  const hasOutgoingCompensation = outgoingCompensation.dateKey !== null;

  return {
    captureDateChangeLayout,
    clearDateChangeLayout,
    isStickyScrollRestorationVisualHoldActive: stickyRestorationHold !== null,
    scrollAlignmentDateKey:
      reservePlan.mode === "sticky" &&
      reservePlan.isPlanned &&
      !hasOutgoingCompensation
        ? reservePlan.dateKey
        : null,
    scrollAlignmentOffset:
      reservePlan.mode === "sticky" &&
      reservePlan.isPlanned &&
      !hasOutgoingCompensation
        ? reservePlan.alignmentOffset
        : 0,
    scrollCarryoverDateKey: carryoverReserve.dateKey,
    scrollCarryoverReserve: carryoverReserve.height,
    scrollOutgoingCompensationDateKey: outgoingCompensation.dateKey,
    scrollOutgoingCompensationOffset: outgoingCompensation.offset,
    scrollReserveHeight: reservePlan.height,
    scrollReserveTargetDateKey: reservePlan.dateKey
  };
}
