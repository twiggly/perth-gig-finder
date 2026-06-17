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
  sourceDateKey?: string;
  stickyActivationScrollTop?: number;
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

interface HomepageDayScrollCaptureSnapshot {
  isDateHeaderStuck: boolean;
  scrollTop: number;
  stickySentinelTop: number | null;
}

interface HomepageDayScrollRestoration {
  captureDateChangeLayout: (
    targetDateKey?: string,
    snapshot?: HomepageDayScrollCaptureSnapshot
  ) => void;
  clearDateChangeLayout: () => void;
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
  sourceDateKey?: string;
  stickyActivationScrollTop?: number;
  targetDateKey: string;
  timestamp: number;
}

interface HomepageDayScrollReservePlan {
  dateKey: string | null;
  height: number;
  isPlanned: boolean;
  mode: HomepageDayScrollIntentMode | null;
  naturalMaxScrollTop: number | null;
  outgoingCompensationDateKey: string | null;
  outgoingCompensationOffset: number;
  scrollTarget: number | null;
}

interface HomepageDayScrollCarryoverReserve {
  dateKey: string | null;
  height: number;
}

interface HomepageDayScrollOutgoingCompensation {
  dateKey: string | null;
  offset: number;
}

type HomepageDayScrollIntentWindow = Window &
  typeof globalThis & {
    __gigRadarHomepageDayStickyScrollIntent?: HomepageDayScrollIntent | null;
  };

const ACTIVE_DAY_SCROLL_OFFSET_PX = 8;
const SCROLL_DEBT_SETTLE_IDLE_MS = 140;
const STICKY_ACTIVATION_OFFSET_PX = 1;
const STICKY_SCROLL_INTENT_STORAGE_KEY =
  "gig-radar:homepage-day-sticky-scroll-intent";
const STICKY_SCROLL_INTENT_TTL_MS = 30000;
const EMPTY_RESERVE_PLAN: HomepageDayScrollReservePlan = {
  dateKey: null,
  height: 0,
  isPlanned: false,
  mode: null,
  naturalMaxScrollTop: null,
  outgoingCompensationDateKey: null,
  outgoingCompensationOffset: 0,
  scrollTarget: null
};
const EMPTY_CARRYOVER_RESERVE: HomepageDayScrollCarryoverReserve = {
  dateKey: null,
  height: 0
};
const EMPTY_OUTGOING_COMPENSATION: HomepageDayScrollOutgoingCompensation = {
  dateKey: null,
  offset: 0
};

export function getHomepageDayScrollIntent({
  isDateHeaderStuck,
  scrollTop = 0,
  sourceDateKey,
  stickyActivationScrollTop,
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
    sourceDateKey,
    stickyActivationScrollTop: isDateHeaderStuck
      ? stickyActivationScrollTop
      : undefined,
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

export function getHomepageDayOutgoingCompensationOffset({
  capturedScrollTop,
  mode,
  scrollTarget
}: {
  capturedScrollTop: number;
  mode: HomepageDayScrollIntentMode | null;
  scrollTarget: number | null;
}): number {
  if (mode !== "sticky" || scrollTarget === null) {
    return 0;
  }

  return scrollTarget < capturedScrollTop
    ? scrollTarget - capturedScrollTop
    : 0;
}

export function getHomepageDayOutgoingCompensationTarget({
  capturedScrollTop,
  fallbackDateKey,
  isDateTransitioning,
  mode,
  scrollTarget,
  sourceDateKey
}: {
  capturedScrollTop: number;
  fallbackDateKey: string;
  isDateTransitioning: boolean;
  mode: HomepageDayScrollIntentMode | null;
  scrollTarget: number | null;
  sourceDateKey?: string;
}): HomepageDayScrollOutgoingCompensation {
  const offset = getHomepageDayOutgoingCompensationOffset({
    capturedScrollTop,
    mode,
    scrollTarget
  });

  return isDateTransitioning && offset !== 0
    ? {
        dateKey: sourceDateKey ?? fallbackDateKey,
        offset
      }
    : EMPTY_OUTGOING_COMPENSATION;
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

export function getHomepageDayScrollDebtSettlement({
  currentReserveHeight,
  naturalMaxScrollTop,
  scrollTop
}: {
  currentReserveHeight: number;
  naturalMaxScrollTop: number | null;
  scrollTop: number;
}): {
  reserveHeight: number;
  shouldClear: boolean;
} {
  const reserveHeight =
    currentReserveHeight > 0 && naturalMaxScrollTop !== null
      ? getNextHomepageDayScrollDebtReserve({
          currentReserveHeight,
          naturalMaxScrollTop,
          scrollTop
        })
      : currentReserveHeight;

  return {
    reserveHeight,
    shouldClear: reserveHeight <= 0
  };
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
    dateKey: intent?.targetDateKey ?? null,
    height: intent ? provisionalHeight : 0,
    isPlanned: false,
    mode: intent?.mode ?? null,
    naturalMaxScrollTop: null,
    outgoingCompensationDateKey: null,
    outgoingCompensationOffset: 0,
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
            sourceDateKey:
              typeof maybeIntent.sourceDateKey === "string"
                ? maybeIntent.sourceDateKey
                : undefined,
            stickyActivationScrollTop:
              typeof maybeIntent.stickyActivationScrollTop === "number"
                ? maybeIntent.stickyActivationScrollTop
                : undefined,
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
  const capturedStickyActivationScrollTopRef = useRef<number | null>(null);
  const isDateTransitioningRef = useRef(isDateTransitioning);
  const pendingScrollIntentRef = useRef<HomepageDayScrollIntent | null>(null);
  const previousActiveDateKeyRef = useRef(activeDateKey);
  const carryoverReserveRef =
    useRef<HomepageDayScrollCarryoverReserve>(EMPTY_CARRYOVER_RESERVE);
  const reservePlanRef =
    useRef<HomepageDayScrollReservePlan>(EMPTY_RESERVE_PLAN);
  const scrollSettleTimeoutRef = useRef<number | null>(null);
  const [reservePlan, setReservePlan] =
    useState<HomepageDayScrollReservePlan>(EMPTY_RESERVE_PLAN);
  const [carryoverReserve, setCarryoverReserve] =
    useState<HomepageDayScrollCarryoverReserve>(EMPTY_CARRYOVER_RESERVE);
  const [pendingScrollIntent, setPendingScrollIntentState] =
    useState<HomepageDayScrollIntent | null>(null);

  function cancelScrollDebtSettlementTimers() {
    if (scrollSettleTimeoutRef.current !== null) {
      window.clearTimeout(scrollSettleTimeoutRef.current);
      scrollSettleTimeoutRef.current = null;
    }
  }

  function setPendingScrollIntent(nextIntent: HomepageDayScrollIntent | null) {
    pendingScrollIntentRef.current = nextIntent;
    writeStoredHomepageDayScrollIntent(nextIntent);
    setPendingScrollIntentState(nextIntent);
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

  function settleScrollDebtReserve() {
    if (typeof window === "undefined") {
      return;
    }

    const hasPendingRestore =
      Boolean(pendingScrollIntentRef.current) || isDateTransitioningRef.current;

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
    const settlement = getHomepageDayScrollDebtSettlement({
      currentReserveHeight: currentReservePlan.height,
      naturalMaxScrollTop,
      scrollTop: window.scrollY
    });

    if (settlement.shouldClear) {
      clearReservePlan();
      return;
    }

    if (
      settlement.reserveHeight < currentReservePlan.height ||
      naturalMaxScrollTop !== currentReservePlan.naturalMaxScrollTop
    ) {
      updateReservePlan({
        ...currentReservePlan,
        height: settlement.reserveHeight,
        naturalMaxScrollTop
      });
    }
  }

  function scheduleScrollDebtSettlement() {
    if (typeof window === "undefined") {
      return;
    }

    if (scrollSettleTimeoutRef.current !== null) {
      window.clearTimeout(scrollSettleTimeoutRef.current);
    }

    scrollSettleTimeoutRef.current = window.setTimeout(() => {
      scrollSettleTimeoutRef.current = null;
      settleScrollDebtReserve();
    }, SCROLL_DEBT_SETTLE_IDLE_MS);
  }

  function captureDateChangeLayout(
    targetDateKey?: string,
    snapshot?: HomepageDayScrollCaptureSnapshot
  ) {
    cancelScrollDebtSettlementTimers();

    const currentReservePlan = reservePlanRef.current;
    const scrollTop = Math.max(0, snapshot?.scrollTop ?? window.scrollY);
    const stickySentinelTop = snapshot?.stickySentinelTop ?? getStickySentinelTop();
    const isStuck = snapshot?.isDateHeaderStuck ?? isDateHeaderStuckNow();
    const stickyActivationScrollTop = isStuck
      ? Math.max(
          0,
          scrollTop + stickySentinelTop + STICKY_ACTIVATION_OFFSET_PX
        )
      : null;
    capturedStickyActivationScrollTopRef.current = stickyActivationScrollTop;
    const nextIntent = getNextHomepageDayScrollIntent({
      currentIntent: pendingScrollIntentRef.current,
      nextIntent: getHomepageDayScrollIntent({
        isDateHeaderStuck: isStuck,
        scrollTop,
        sourceDateKey: activeDateKey,
        stickyActivationScrollTop: stickyActivationScrollTop ?? undefined,
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
      sourceDateKey: previousActiveDateKeyRef.current,
      stickyActivationScrollTop: Math.max(
        0,
        window.scrollY + getStickySentinelTop() + STICKY_ACTIVATION_OFFSET_PX
      ),
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
    capturedStickyActivationScrollTopRef.current = null;
    setPendingScrollIntent(null);
    cancelScrollDebtSettlementTimers();
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

    const measuredStickyScrollTarget =
      effectiveIntent.mode === "sticky" ? getCurrentStickyScrollTarget() : null;
    const stickyActivationScrollTop = Math.max(
      effectiveIntent.stickyActivationScrollTop ?? 0,
      capturedStickyActivationScrollTopRef.current ?? 0
    );
    const scrollTarget =
      measuredStickyScrollTarget === null
        ? null
        : Math.max(measuredStickyScrollTarget, stickyActivationScrollTop);
    const capturedStickyScrollTop =
      effectiveIntent.mode === "sticky" && scrollTarget !== null
        ? Math.max(effectiveIntent.capturedScrollTop, window.scrollY)
        : effectiveIntent.capturedScrollTop;
    const plannedOutgoingCompensation =
      getHomepageDayOutgoingCompensationTarget({
        capturedScrollTop: capturedStickyScrollTop,
        fallbackDateKey: activeDateKey,
        isDateTransitioning,
        mode: effectiveIntent.mode,
        scrollTarget,
        sourceDateKey: effectiveIntent.sourceDateKey
      });
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
    const stickyProvisionalReserveHeight =
      effectiveIntent.mode === "sticky" && !reservePlan.isPlanned
        ? window.innerHeight
        : 0;
    const plannedScrollReserveHeight =
      effectiveIntent.mode === "sticky"
        ? Math.max(
            reservePlan.height,
            scrollReserveHeight,
            stickyProvisionalReserveHeight
          )
        : scrollReserveHeight;

    const shouldRenderReserveBeforeScroll =
      plannedScrollReserveHeight > reservePlan.height ||
      (plannedScrollReserveHeight > 0 &&
        reservePlan.naturalMaxScrollTop === null);
    const shouldRenderCompensationBeforeScroll =
      effectiveIntent.mode === "sticky" &&
      (plannedOutgoingCompensation.dateKey !==
        reservePlan.outgoingCompensationDateKey ||
        plannedOutgoingCompensation.offset !==
          reservePlan.outgoingCompensationOffset);
    const nextReservePlan = {
      dateKey: effectiveIntent.targetDateKey,
      height: plannedScrollReserveHeight,
      isPlanned: false,
      mode: effectiveIntent.mode,
      naturalMaxScrollTop,
      outgoingCompensationDateKey: plannedOutgoingCompensation.dateKey,
      outgoingCompensationOffset: plannedOutgoingCompensation.offset,
      scrollTarget
    };

    if (shouldRenderReserveBeforeScroll || shouldRenderCompensationBeforeScroll) {
      updateReservePlan(nextReservePlan);
      return undefined;
    }

    if (effectiveIntent.mode === "sticky" && scrollTarget !== null) {
      if (scrollTarget < capturedStickyScrollTop) {
        window.scrollTo({
          behavior: "auto",
          top: scrollTarget
        });
      }
      setPendingScrollIntent(null);
      clearCarryoverReserve();
    }

    updateReservePlan({
      dateKey: effectiveIntent.targetDateKey,
      height: plannedScrollReserveHeight,
      isPlanned: true,
      mode: effectiveIntent.mode,
      naturalMaxScrollTop,
      outgoingCompensationDateKey: plannedOutgoingCompensation.dateKey,
      outgoingCompensationOffset: plannedOutgoingCompensation.offset,
      scrollTarget
    });

    return undefined;
  }, [
    activeDateKey,
    isContentAnimating,
    isDateTransitioning,
    pendingScrollIntent,
    reservePlan.dateKey,
    reservePlan.height,
    reservePlan.isPlanned,
    reservePlan.mode,
    reservePlan.outgoingCompensationDateKey,
    reservePlan.outgoingCompensationOffset,
    reservePlan.scrollTarget,
    scrollTargetContentRef,
    stickyHeaderRef,
    stickySentinelRef
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
    isDateTransitioningRef.current = isDateTransitioning;
  }, [isDateTransitioning]);

  useEffect(() => {
    if (!isDateTransitioning && reservePlan.dateKey !== null) {
      scheduleScrollDebtSettlement();
    }
  }, [isDateTransitioning, reservePlan.dateKey]);

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
      scheduleScrollDebtSettlement();
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
      cancelScrollDebtSettlementTimers();
    };
  }, [stickySentinelRef]);

  useEffect(() => {
    if (
      reservePlan.dateKey !== null &&
      reservePlan.dateKey !== activeDateKey &&
      !pendingScrollIntentRef.current &&
      !isDateTransitioning
    ) {
      clearReservePlan();
      return;
    }

    if (
      (reservePlan.outgoingCompensationDateKey !== null ||
        reservePlan.outgoingCompensationOffset !== 0) &&
      !isDateTransitioning
    ) {
      updateReservePlan({
        ...reservePlan,
        outgoingCompensationDateKey: null,
        outgoingCompensationOffset: 0
      });
    }
  }, [
    activeDateKey,
    isDateTransitioning,
    reservePlan.dateKey,
    reservePlan.outgoingCompensationDateKey,
    reservePlan.outgoingCompensationOffset
  ]);

  return {
    captureDateChangeLayout,
    clearDateChangeLayout,
    scrollCarryoverDateKey: carryoverReserve.dateKey,
    scrollCarryoverReserve: carryoverReserve.height,
    scrollOutgoingCompensationDateKey: reservePlan.outgoingCompensationDateKey,
    scrollOutgoingCompensationOffset: reservePlan.outgoingCompensationOffset,
    scrollReserveHeight: reservePlan.height,
    scrollReserveTargetDateKey: reservePlan.dateKey
  };
}
