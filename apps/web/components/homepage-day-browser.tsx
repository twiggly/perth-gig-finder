"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Box, Popover, Text, UnstyledButton } from "@mantine/core";
import { flushSync } from "react-dom";

import {
  buildHomepageCalendarMonth,
  getInitialHomepageCalendarMonthKey
} from "@/lib/homepage-calendar";
import {
  getHydratedHomepageDayDateKeys,
  getNextHomepageDayPrefetchDateKeys,
  type HomepageDayPayload
} from "@/lib/homepage-day-loading";
import {
  getPerthDateKey,
  type DateSummary,
  type SwipeDirection
} from "@/lib/homepage-dates";
import { useHomepageAdjacentImagePreload } from "./use-homepage-adjacent-image-preload";
import { HomepageDayArrow } from "./homepage-day-arrow";
import { getHomepageDayArrowAvailability } from "./homepage-day-arrow-feedback";
import { HomepageDayCalendarDropdown } from "./homepage-day-calendar-dropdown";
import { HomepageDayContent } from "./homepage-day-content";
import { useHomepageDayCache } from "./use-homepage-day-cache";
import { useHomepageDayArrowFeedback } from "./use-homepage-day-arrow-feedback";
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
  const cancelArrowFeedbackRef = useRef<() => void>(() => {});
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
    prefersReducedMotion,
    previousDateKey,
    renderedContentPanes,
    renderedHeadingPanes,
    requestDateChange,
    transition,
    transitionPhase
  } = useHomepageDayNavigation({
    availableDateKeys,
    closeCalendar: () => setIsCalendarOpen(false),
    closeOpenGig: () => setOpenGigId(null),
    ensureHomepageDayForNavigation,
    initialActiveDateKey,
    initialDays,
    isLoadingDay,
    onDateChangeCancel: () => {
      cancelArrowFeedbackRef.current();
      clearDateChangeLayoutRef.current();
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
  const { isDateHeaderStuck, stickySentinelRef } =
    useHomepageDayStickyHeader();
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
    stickyScrollRestorationCoverRect,
    stickyScrollRestorationPhase,
    scrollAlignmentDateKey,
    scrollAlignmentOffset,
    scrollCarryoverDateKey,
    scrollCarryoverReserve,
    scrollOutgoingCompensationDateKey,
    scrollOutgoingCompensationOffset,
    scrollRestorationAlignmentDateKey,
    scrollReserveHeight,
    scrollReserveTargetDateKey
  } = useHomepageDayScrollRestoration({
    activeDateKey,
    dateTransitionPhase: transitionPhase,
    isDateHeaderStuck,
    scrollTargetContentRef,
    stickyHeaderRef: dateHeaderRef,
    stickySentinelRef
  });
  captureDateChangeLayoutRef.current = captureDateChangeLayout;
  clearDateChangeLayoutRef.current = clearDateChangeLayout;
  const {
    arrowBindings,
    cancelNavigationFeedback,
    navigateWithFeedback
  } = useHomepageDayArrowFeedback({
    clearDateChangeLayout,
    isNavigationLocked,
    isStickyHoldActive: isStickyScrollRestorationVisualHoldActive,
    navigateAdjacentDate,
    prefersReducedMotion,
    transitionPhase
  });
  cancelArrowFeedbackRef.current = cancelNavigationFeedback;
  const {
    calendarGestureHandlers,
    consumeCalendarSwipeSelection,
    dayGestureHandlers,
    resetDayWheelGesture
  } = useHomepageDayGestures({
    isNavigationLocked,
    onNavigateCalendarMonth: handleCalendarMonthNavigate,
    onNavigateDate: (direction) =>
      navigateWithFeedback(direction, "gesture")
  });
  resetDayWheelGestureRef.current = resetDayWheelGesture;
  const stickyRestorationCoverStyle = useMemo(
    () =>
      stickyScrollRestorationCoverRect
        ? ({
            columnGap: stickyScrollRestorationCoverRect.columnGap,
            gridTemplateColumns:
              stickyScrollRestorationCoverRect.gridTemplateColumns,
            height: `${stickyScrollRestorationCoverRect.height}px`,
            left: `${stickyScrollRestorationCoverRect.left}px`,
            paddingBottom: stickyScrollRestorationCoverRect.paddingBottom,
            paddingLeft: stickyScrollRestorationCoverRect.paddingLeft,
            paddingRight: stickyScrollRestorationCoverRect.paddingRight,
            paddingTop: stickyScrollRestorationCoverRect.paddingTop,
            top: `${stickyScrollRestorationCoverRect.top}px`,
            width: `${stickyScrollRestorationCoverRect.width}px`
          }) as React.CSSProperties
        : undefined,
    [
      stickyScrollRestorationCoverRect?.height,
      stickyScrollRestorationCoverRect?.left,
      stickyScrollRestorationCoverRect?.paddingBottom,
      stickyScrollRestorationCoverRect?.paddingLeft,
      stickyScrollRestorationCoverRect?.paddingRight,
      stickyScrollRestorationCoverRect?.paddingTop,
      stickyScrollRestorationCoverRect?.top,
      stickyScrollRestorationCoverRect?.width,
      stickyScrollRestorationCoverRect?.columnGap,
      stickyScrollRestorationCoverRect?.gridTemplateColumns
    ]
  );
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

  useEffect(() => {
    if (typeof window === "undefined" || !activeDateKey) {
      return;
    }

    const dateKeysToPrefetch = [
      ...getHydratedHomepageDayDateKeys({
        activeDateKey,
        availableDateKeys,
        now: new Date()
      }),
      ...getNextHomepageDayPrefetchDateKeys({
        activeDateKey,
        availableDateKeys,
        loadedDateKeys
      })
    ];

    for (const dateKey of new Set(dateKeysToPrefetch)) {
      if (dateKey && !loadedDayMap.has(dateKey)) {
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

  function captureDateChangeLayoutSynchronously(targetDateKey?: string) {
    flushSync(() => {
      captureDateChangeLayoutRef.current(targetDateKey);
    });
  }

  if (!activeDay) {
    return null;
  }

  const arrowAvailability = getHomepageDayArrowAvailability({
    activeDateKey,
    availableDateKeys,
    transitionTargetDateKey: transition?.toDateKey
  });

  return (
    <section
      aria-busy={isLoadingDay ? "true" : undefined}
      data-preview-revision={previewAssetRevision}
      data-calendar-open={isCalendarOpen ? "true" : undefined}
      className="day-browser"
      style={headingTrackStyle}
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
        data-stuck={isDateHeaderStuck ? "true" : undefined}
        ref={dateHeaderRef}
      >
        <HomepageDayArrow
          bindings={arrowBindings.previous.buttonProps}
          direction="previous"
          disabled={!previousDateKey || isNavigationLocked}
          unavailable={arrowAvailability.previous}
          variant="button"
        />
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
        <HomepageDayArrow
          bindings={arrowBindings.next.buttonProps}
          direction="next"
          disabled={!nextDateKey || isNavigationLocked}
          unavailable={arrowAvailability.next}
          variant="button"
        />
      </Box>
      {isStickyScrollRestorationVisualHoldActive ? (
        <Box
          aria-hidden="true"
          className="day-browser__header-cover"
          data-sticky-restoration-phase={
            stickyScrollRestorationPhase ?? undefined
          }
          style={stickyRestorationCoverStyle}
        >
          <HomepageDayArrow
            bindings={arrowBindings.previous.coverProps}
            direction="previous"
            unavailable={arrowAvailability.previous}
            variant="cover"
          />
          <Box className="day-browser__heading-button day-browser__header-cover-heading">
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
                    key={`heading-cover-${dateKey}`}
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
          </Box>
          <HomepageDayArrow
            bindings={arrowBindings.next.coverProps}
            direction="next"
            unavailable={arrowAvailability.next}
            variant="cover"
          />
        </Box>
      ) : null}
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
        scrollRestorationAlignmentDateKey={scrollRestorationAlignmentDateKey}
        scrollReserveTargetDateKey={scrollReserveTargetDateKey}
        scrollTargetContentRef={scrollTargetContentRef}
        transitionDirection={transition?.direction}
      />
    </section>
  );
}
