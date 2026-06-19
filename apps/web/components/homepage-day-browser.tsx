"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { ActionIcon, Box, Popover, Text, UnstyledButton } from "@mantine/core";
import { flushSync } from "react-dom";

import {
  buildHomepageCalendarMonth,
  getInitialHomepageCalendarMonthKey
} from "@/lib/homepage-calendar";
import {
  getNextHomepageDayPrefetchDateKeys,
  type HomepageDayPayload
} from "@/lib/homepage-day-loading";
import {
  getPerthDateKey,
  type DateSummary,
  type SwipeDirection
} from "@/lib/homepage-dates";
import { useHomepageAdjacentImagePreload } from "./use-homepage-adjacent-image-preload";
import { HomepageDayCalendarDropdown } from "./homepage-day-calendar-dropdown";
import { HomepageDayContent } from "./homepage-day-content";
import { useHomepageDayCache } from "./use-homepage-day-cache";
import { useHomepageDayGestures } from "./use-homepage-day-gestures";
import { useHomepageDayNavigation } from "./use-homepage-day-navigation";
import { useHomepageDayScrollRestoration } from "./use-homepage-day-scroll-restoration";
import { useHomepageDayStickyHeader } from "./use-homepage-day-sticky-header";

interface HomepageDayBrowserProps {
  availableDays: DateSummary[];
  currentQuery: string;
  initialActiveDateKey: string;
  initialDays: HomepageDayPayload[];
  selectedVenueSlugs: string[];
}

interface StoredDateHeaderVisualHold {
  targetDateKey?: string;
  timestamp: number;
}

type HomepageDayBrowserWindow = Window &
  typeof globalThis & {
    __gigRadarHomepageDateHeaderVisualHold?: StoredDateHeaderVisualHold | null;
  };

const DATE_HEADER_VISUAL_HOLD_HISTORY_KEY =
  "__gigRadarHomepageDateHeaderVisualHold";
const LOCAL_PREVIEW_ASSET_REVISION =
  process.env.NEXT_PUBLIC_LOCAL_PREVIEW_ASSET_REVISION ?? "0";
const DATE_HEADER_VISUAL_HOLD_STORAGE_KEY =
  "gig-radar:homepage-date-header-visual-hold";
const DATE_HEADER_VISUAL_HOLD_TTL_MS = 30000;

function readStoredDateHeaderVisualHold(): StoredDateHeaderVisualHold | null {
  if (typeof window === "undefined") {
    return null;
  }

  const browserWindow = window as HomepageDayBrowserWindow;
  const inMemoryHold =
    browserWindow.__gigRadarHomepageDateHeaderVisualHold ?? null;

  if (inMemoryHold) {
    return inMemoryHold;
  }

  const historyHold =
    (window.history.state as Record<string, unknown> | null)?.[
      DATE_HEADER_VISUAL_HOLD_HISTORY_KEY
    ] ?? null;

  if (
    historyHold &&
    typeof historyHold === "object" &&
    "timestamp" in historyHold &&
    typeof historyHold.timestamp === "number"
  ) {
    const maybeHistoryHold = historyHold as Partial<StoredDateHeaderVisualHold>;

    return {
      targetDateKey:
        typeof maybeHistoryHold.targetDateKey === "string"
          ? maybeHistoryHold.targetDateKey
          : undefined,
      timestamp: historyHold.timestamp
    };
  }

  try {
    const rawHold = window.sessionStorage.getItem(
      DATE_HEADER_VISUAL_HOLD_STORAGE_KEY
    );

    if (!rawHold) {
      return null;
    }

    const maybeHold = JSON.parse(rawHold) as Partial<StoredDateHeaderVisualHold>;

    return typeof maybeHold.timestamp === "number"
      ? {
          targetDateKey: maybeHold.targetDateKey,
          timestamp: maybeHold.timestamp
        }
      : null;
  } catch {
    return null;
  }
}

function writeStoredDateHeaderVisualHold(
  hold: StoredDateHeaderVisualHold | null
) {
  if (typeof window === "undefined") {
    return;
  }

  const browserWindow = window as HomepageDayBrowserWindow;
  browserWindow.__gigRadarHomepageDateHeaderVisualHold = hold;

  const currentHistoryState =
    typeof window.history.state === "object" && window.history.state !== null
      ? window.history.state
      : {};
  const nextHistoryState = {
    ...currentHistoryState,
    [DATE_HEADER_VISUAL_HOLD_HISTORY_KEY]: hold
  };

  if (!hold) {
    delete nextHistoryState[DATE_HEADER_VISUAL_HOLD_HISTORY_KEY];
  }

  window.history.replaceState(nextHistoryState, "", window.location.href);

  try {
    if (!hold) {
      window.sessionStorage.removeItem(DATE_HEADER_VISUAL_HOLD_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      DATE_HEADER_VISUAL_HOLD_STORAGE_KEY,
      JSON.stringify(hold)
    );
  } catch {
    // Storage can be unavailable in privacy modes; the in-memory hold still covers SPA handoffs.
  }
}

function shouldUseStoredDateHeaderVisualHold({
  activeDateKey,
  hold,
  now = Date.now()
}: {
  activeDateKey: string;
  hold: StoredDateHeaderVisualHold | null;
  now?: number;
}) {
  return Boolean(
    hold &&
      hold.targetDateKey === activeDateKey &&
      now - hold.timestamp >= 0 &&
      now - hold.timestamp <= DATE_HEADER_VISUAL_HOLD_TTL_MS
  );
}

export function HomepageDayBrowser({
  availableDays,
  currentQuery,
  initialActiveDateKey,
  initialDays,
  selectedVenueSlugs
}: HomepageDayBrowserProps) {
  const previewAssetRevision = LOCAL_PREVIEW_ASSET_REVISION;
  const scrollTargetContentRef = useRef<HTMLDivElement | null>(null);
  const captureDateChangeLayoutRef = useRef<(targetDateKey?: string) => void>(
    () => {}
  );
  const clearDateChangeLayoutRef = useRef<() => void>(() => {});
  const dateHeaderRef = useRef<HTMLDivElement | null>(null);
  const resetAdjacentImagePreloadsRef = useRef<() => void>(() => {});
  const resetDayWheelGestureRef = useRef<() => void>(() => {});
  const [
    dateHeaderVisualHoldDateKey,
    setDateHeaderVisualHoldDateKey
  ] = useState<string | null>(null);
  const [calendarMonthKey, setCalendarMonthKey] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [openGigId, setOpenGigId] = useState<string | null>(null);
  const [todayDateKey] = useState(() => getPerthDateKey(new Date()));
  const selectedVenueSlugKey = selectedVenueSlugs.join("|");
  const availableDateKeys = useMemo(
    () => availableDays.map((day) => day.dateKey),
    [availableDays]
  );
  const {
    dayLoadError,
    ensureHomepageDayForNavigation,
    isLoadingDay,
    loadedDayMap,
    loadedDateKeys,
    prefetchHomepageDay,
    resetDayLoadError
  } = useHomepageDayCache({
    availableDateKeys,
    currentQuery,
    initialDays,
    selectedVenueSlugs
  });
  const availableDayMap = useMemo(
    () => new Map(availableDays.map((day) => [day.dateKey, day])),
    [availableDays]
  );
  const {
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
  } = useHomepageDayNavigation({
    availableDateKeys,
    closeCalendar: () => setIsCalendarOpen(false),
    closeOpenGig: () => setOpenGigId(null),
    ensureHomepageDayForNavigation,
    initialActiveDateKey,
    initialDays,
    isLoadingDay,
    onDateChangeCancel: () => {
      clearDateChangeLayoutRef.current();
      clearDateHeaderTransitionStuckHold();
      setDateHeaderVisualHoldDateKey(null);
      writeStoredDateHeaderVisualHold(null);
    },
    onDateChangeStart: (nextDateKey) =>
      captureDateChangeLayoutSynchronously(nextDateKey),
    resetAdjacentImagePreloads: () => resetAdjacentImagePreloadsRef.current(),
    resetDayLoadError,
    resetDayWheelGesture: () => resetDayWheelGestureRef.current(),
    syncCalendarMonthForDate: (dateKey) =>
      setCalendarMonthKey(
        getInitialHomepageCalendarMonthKey(dateKey, availableDateKeys)
      )
  });
  const activeDay = loadedDayMap.get(activeDateKey) ?? initialDays[0];
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
  const {
    calendarGestureHandlers,
    consumeCalendarSwipeSelection,
    dayGestureHandlers,
    resetDayWheelGesture
  } = useHomepageDayGestures({
    isNavigationLocked,
    onNavigateCalendarMonth: handleCalendarMonthNavigate,
    onNavigateDate: handleNavigateDate
  });
  resetDayWheelGestureRef.current = resetDayWheelGesture;
  const {
    captureDateHeaderTransitionStuckHold,
    clearDateHeaderTransitionStuckHold,
    isDateHeaderVisuallyStuck,
    stickySentinelRef
  } = useHomepageDayStickyHeader({
    isDateTransitioning: transition !== null
  });
  const { resetAdjacentImagePreloads } = useHomepageAdjacentImagePreload({
    activeDateKey,
    loadedDayMap,
    nextDateKey,
    previousDateKey
  });
  resetAdjacentImagePreloadsRef.current = resetAdjacentImagePreloads;
  const {
    captureDateChangeLayout,
    clearDateChangeLayout,
    isStickyScrollRestorationVisualHoldActive,
    scrollAlignmentDateKey,
    scrollAlignmentOffset,
    scrollCarryoverDateKey,
    scrollCarryoverReserve,
    scrollReserveHeight,
    scrollReserveTargetDateKey
  } = useHomepageDayScrollRestoration({
    activeDateKey,
    isContentAnimating,
    isDateTransitioning: transition !== null,
    isDateHeaderStuck: isDateHeaderVisuallyStuck,
    scrollTargetContentRef,
    stickyHeaderRef: dateHeaderRef,
    stickySentinelRef
  });
  captureDateChangeLayoutRef.current = captureDateChangeLayout;
  clearDateChangeLayoutRef.current = clearDateChangeLayout;
  const dayContentViewportStyle = useMemo(
    () =>
      ({
        ...contentViewportStyle,
        "--day-browser-scroll-align-y": `${scrollAlignmentOffset}px`,
        "--day-browser-scroll-carryover-reserve": `${scrollCarryoverReserve}px`,
        "--day-browser-scroll-reserve": `${scrollReserveHeight}px`
      }) as React.CSSProperties,
    [
      contentViewportStyle,
      scrollAlignmentOffset,
      scrollCarryoverReserve,
      scrollReserveHeight
    ]
  );
  const hasActiveDateScrollReserve =
    scrollReserveHeight > 0 && scrollReserveTargetDateKey === activeDateKey;
  const isDateHeaderRenderedStuck =
    isDateHeaderVisuallyStuck ||
    isStickyScrollRestorationVisualHoldActive ||
    dateHeaderVisualHoldDateKey === activeDateKey ||
    hasActiveDateScrollReserve;

  useLayoutEffect(() => {
    const storedHold = readStoredDateHeaderVisualHold();

    if (
      shouldUseStoredDateHeaderVisualHold({
        activeDateKey,
        hold: storedHold
      })
    ) {
      setDateHeaderVisualHoldDateKey(activeDateKey);
    }
  }, [activeDateKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeDateKey) {
      return;
    }

    const dateKeysToPrefetch = getNextHomepageDayPrefetchDateKeys({
      activeDateKey,
      availableDateKeys,
      loadedDateKeys
    });

    for (const dateKey of dateKeysToPrefetch) {
      if (dateKey) {
        prefetchHomepageDay(dateKey);
      }
    }
  }, [
    activeDateKey,
    availableDateKeys,
    currentQuery,
    loadedDateKeys,
    loadedDayMap,
    selectedVenueSlugKey
  ]);

  function handleCalendarDateSelect(dateKey: string) {
    if (isNavigationLocked) {
      return;
    }

    if (consumeCalendarSwipeSelection()) {
      return;
    }

    if (dateKey === activeDateKey) {
      setIsCalendarOpen(false);
      return;
    }

    setIsCalendarOpen(false);

    void requestDateChange(dateKey, {
      announce: true,
      replaceUrl: true
    });
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

  function handleNavigateDate(direction: SwipeDirection): boolean {
    captureDateHeaderVisualHold(
      direction === "next" ? nextDateKey : previousDateKey
    );

    const didNavigate = navigateAdjacentDate(direction);

    if (!didNavigate) {
      clearDateChangeLayout();
      clearDateHeaderTransitionStuckHold();
      setDateHeaderVisualHoldDateKey(null);
      writeStoredDateHeaderVisualHold(null);
    }

    return didNavigate;
  }

  function captureDateHeaderVisualHold(targetDateKey?: string | null) {
    const stickySentinelTop =
      stickySentinelRef.current?.getBoundingClientRect().top ?? null;
    const shouldHoldDateHeader =
      Boolean(targetDateKey) &&
      (isDateHeaderRenderedStuck ||
        (typeof stickySentinelTop === "number" && stickySentinelTop < 0));
    const nextVisualHoldDateKey =
      shouldHoldDateHeader && targetDateKey ? targetDateKey : null;

    setDateHeaderVisualHoldDateKey(nextVisualHoldDateKey);
    writeStoredDateHeaderVisualHold(
      nextVisualHoldDateKey
        ? {
            targetDateKey: nextVisualHoldDateKey,
            timestamp: Date.now()
          }
        : null
    );
  }

  function captureDateChangeLayoutSynchronously(targetDateKey?: string) {
    flushSync(() => {
      captureDateHeaderVisualHold(targetDateKey);
      captureDateHeaderTransitionStuckHold();
      captureDateChangeLayoutRef.current(targetDateKey);
    });
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
      {...dayGestureHandlers}
    >
      <h2 className="sr-only">{activeDay.heading}</h2>
      <span
        aria-hidden="true"
        className="day-browser__sticky-sentinel"
        ref={stickySentinelRef}
      />
      <Box
        className="day-browser__header"
        data-sticky-restoring={
          isStickyScrollRestorationVisualHoldActive ? "true" : undefined
        }
        data-stuck={isDateHeaderRenderedStuck ? "true" : undefined}
        ref={dateHeaderRef}
      >
        <ActionIcon
          aria-label="Previous date"
          className="day-browser__arrow"
          disabled={!previousDateKey || isNavigationLocked}
          onClick={() => handleNavigateDate("previous")}
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
          <HomepageDayCalendarDropdown
            calendarGestureHandlers={calendarGestureHandlers}
            calendarMonth={calendarMonth}
            onNextMonth={() => {
              if (calendarMonth?.nextMonthKey) {
                setCalendarMonthKey(calendarMonth.nextMonthKey);
              }
            }}
            onPreviousMonth={() => {
              if (calendarMonth?.previousMonthKey) {
                setCalendarMonthKey(calendarMonth.previousMonthKey);
              }
            }}
            onSelectDate={handleCalendarDateSelect}
          />
        </Popover>
        <ActionIcon
          aria-label="Next date"
          className="day-browser__arrow"
          disabled={!nextDateKey || isNavigationLocked}
          onClick={() => handleNavigateDate("next")}
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

      <HomepageDayContent
        activeDateKey={activeDateKey}
        contentViewportStyle={dayContentViewportStyle}
        isContentAnimating={isContentAnimating}
        loadedDayMap={loadedDayMap}
        onCloseGig={(gigId) =>
          setOpenGigId((current) => (current === gigId ? null : current))
        }
        onToggleGig={(gigId) =>
          setOpenGigId((current) => (current === gigId ? null : gigId))
        }
        openGigId={openGigId}
        renderedContentPanes={renderedContentPanes}
        scrollAlignmentDateKey={scrollAlignmentDateKey}
        scrollCarryoverDateKey={scrollCarryoverDateKey}
        scrollReserveTargetDateKey={scrollReserveTargetDateKey}
        scrollTargetContentRef={scrollTargetContentRef}
        transitionDirection={transition?.direction}
      />
    </section>
  );
}
