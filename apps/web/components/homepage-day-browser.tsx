"use client";

import React, {
  useEffect,
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

const LOCAL_PREVIEW_ASSET_REVISION =
  process.env.NEXT_PUBLIC_LOCAL_PREVIEW_ASSET_REVISION ?? "0";

export function shouldRenderHomepageDateHeaderStuck({
  hasActiveDateScrollReserve,
  isDateHeaderVisuallyStuck,
  isStickyScrollRestorationVisualHoldActive,
  isStickyStartedTransitionActive
}: {
  hasActiveDateScrollReserve: boolean;
  isDateHeaderVisuallyStuck: boolean;
  isStickyScrollRestorationVisualHoldActive: boolean;
  isStickyStartedTransitionActive: boolean;
}) {
  return (
    isDateHeaderVisuallyStuck ||
    isStickyScrollRestorationVisualHoldActive ||
    isStickyStartedTransitionActive ||
    hasActiveDateScrollReserve
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
    isDateHeaderStuck,
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
    scrollOutgoingCompensationDateKey,
    scrollOutgoingCompensationOffset,
    scrollReserveHeight,
    scrollReserveTargetDateKey
  } = useHomepageDayScrollRestoration({
    activeDateKey,
    isContentAnimating,
    isDateTransitionPreparing: transition?.phase === "preparing",
    isDateTransitioning: transition !== null,
    isDateTransitionSettling: transition?.phase === "settling",
    isDateHeaderStuck,
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
        "--day-browser-scroll-outgoing-y": `${scrollOutgoingCompensationOffset}px`,
        "--day-browser-scroll-reserve": `${scrollReserveHeight}px`
      }) as React.CSSProperties,
    [
      contentViewportStyle,
      scrollAlignmentOffset,
      scrollCarryoverReserve,
      scrollOutgoingCompensationOffset,
      scrollReserveHeight
    ]
  );
  const hasActiveDateScrollReserve =
    scrollReserveHeight > 0 && scrollReserveTargetDateKey === activeDateKey;
  const isStickyStartedTransitionActive =
    transition?.startedWithStickyHeader === true;
  const isDateHeaderRenderedStuck = shouldRenderHomepageDateHeaderStuck({
    hasActiveDateScrollReserve,
    isDateHeaderVisuallyStuck,
    isStickyScrollRestorationVisualHoldActive,
    isStickyStartedTransitionActive
  });

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
    const didNavigate = navigateAdjacentDate(direction);

    if (!didNavigate) {
      clearDateChangeLayout();
      clearDateHeaderTransitionStuckHold();
    }

    return didNavigate;
  }

  function isDateHeaderStuckAtTransitionStart() {
    const stickySentinelTop =
      stickySentinelRef.current?.getBoundingClientRect().top ?? null;

    return (
      isDateHeaderStuck ||
      (typeof stickySentinelTop === "number" && stickySentinelTop < 0)
    );
  }

  function captureDateChangeLayoutSynchronously(targetDateKey?: string) {
    let startedWithStickyHeader = false;

    flushSync(() => {
      startedWithStickyHeader = isDateHeaderStuckAtTransitionStart();
      captureDateHeaderTransitionStuckHold();
      captureDateChangeLayoutRef.current(targetDateKey);
    });

    return startedWithStickyHeader;
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
        scrollOutgoingCompensationDateKey={scrollOutgoingCompensationDateKey}
        scrollReserveTargetDateKey={scrollReserveTargetDateKey}
        scrollTargetContentRef={scrollTargetContentRef}
        transitionDirection={transition?.direction}
      />
    </section>
  );
}
