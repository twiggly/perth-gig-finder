"use client";

import { useRef, type PointerEvent, type WheelEvent } from "react";

import {
  accumulateTrackpadSwipe,
  getSwipeDirection,
  shouldConsumeLockedTrackpadMomentum,
  TRACKPAD_GESTURE_LOCK_MS,
  type SwipeDirection
} from "@/lib/homepage-dates";

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

interface UseHomepageDayGesturesOptions {
  isNavigationLocked: boolean;
  onNavigateCalendarMonth: (direction: SwipeDirection) => boolean;
  onNavigateDate: (direction: SwipeDirection) => boolean;
}

function createWheelGesture(): WheelGesture {
  return {
    accumulatedDeltaX: 0,
    lastEventAt: 0,
    lockedDirection: null,
    lockedUntil: 0
  };
}

export function useHomepageDayGestures({
  isNavigationLocked,
  onNavigateCalendarMonth,
  onNavigateDate
}: UseHomepageDayGesturesOptions) {
  const dayPointerGestureRef = useRef<PointerGesture | null>(null);
  const calendarPointerGestureRef = useRef<PointerGesture | null>(null);
  const calendarSwipeConsumedRef = useRef(false);
  const dayWheelGestureRef = useRef<WheelGesture>(createWheelGesture());
  const calendarWheelGestureRef = useRef<WheelGesture>(createWheelGesture());

  function clearDayPointerGesture() {
    dayPointerGestureRef.current = null;
  }

  function clearCalendarPointerGesture() {
    calendarPointerGestureRef.current = null;
  }

  function markCalendarSwipeConsumed() {
    calendarSwipeConsumedRef.current = true;

    window.setTimeout(() => {
      calendarSwipeConsumedRef.current = false;
    }, 0);
  }

  function consumeCalendarSwipeSelection(): boolean {
    if (!calendarSwipeConsumedRef.current) {
      return false;
    }

    calendarSwipeConsumedRef.current = false;
    return true;
  }

  function resetDayWheelGesture() {
    dayWheelGestureRef.current.accumulatedDeltaX = 0;
  }

  function handleDayPointerDown(event: PointerEvent<HTMLElement>) {
    if (
      isNavigationLocked ||
      (event.pointerType !== "touch" && event.pointerType !== "pen")
    ) {
      return;
    }

    dayPointerGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
  }

  function handleDayPointerUp(event: PointerEvent<HTMLElement>) {
    const gesture = dayPointerGestureRef.current;

    clearDayPointerGesture();

    if (!gesture || gesture.pointerId !== event.pointerId || isNavigationLocked) {
      return;
    }

    const direction = getSwipeDirection(
      event.clientX - gesture.startX,
      event.clientY - gesture.startY
    );

    if (direction) {
      onNavigateDate(direction);
    }
  }

  function handleCalendarPointerDown(event: PointerEvent<HTMLElement>) {
    event.stopPropagation();

    if (
      isNavigationLocked ||
      (event.pointerType !== "touch" && event.pointerType !== "pen")
    ) {
      return;
    }

    calendarPointerGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCalendarPointerUp(event: PointerEvent<HTMLElement>) {
    event.stopPropagation();

    const gesture = calendarPointerGestureRef.current;

    clearCalendarPointerGesture();

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

    if (!direction || !onNavigateCalendarMonth(direction)) {
      return;
    }

    event.preventDefault();
    markCalendarSwipeConsumed();
  }

  function handleWheelGesture({
    event,
    gesture,
    onNavigate
  }: {
    event: WheelEvent<HTMLElement>;
    gesture: WheelGesture;
    onNavigate: (direction: SwipeDirection) => boolean;
  }) {
    const now = Date.now();

    if (gesture.lockedUntil > now) {
      if (
        shouldConsumeLockedTrackpadMomentum(
          event.deltaX,
          event.deltaY,
          gesture.lockedDirection
        )
      ) {
        event.preventDefault();
        gesture.lockedUntil = now + TRACKPAD_GESTURE_LOCK_MS;
        gesture.lastEventAt = now;
      } else if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        gesture.accumulatedDeltaX = 0;
        gesture.lastEventAt = 0;
        gesture.lockedDirection = null;
        gesture.lockedUntil = 0;
      }

      return;
    }

    if (isNavigationLocked) {
      return;
    }

    if (gesture.lastEventAt > 0 && now - gesture.lastEventAt > 200) {
      gesture.accumulatedDeltaX = 0;
    }

    gesture.lastEventAt = now;

    const { direction, nextDelta } = accumulateTrackpadSwipe(
      gesture.accumulatedDeltaX,
      event.deltaX,
      event.deltaY
    );

    gesture.accumulatedDeltaX = nextDelta;

    if (!direction) {
      return;
    }

    event.preventDefault();

    if (onNavigate(direction)) {
      gesture.accumulatedDeltaX = 0;
      gesture.lockedDirection = direction;
      gesture.lockedUntil = now + TRACKPAD_GESTURE_LOCK_MS;
    } else {
      gesture.lockedDirection = null;
    }
  }

  function handleDayWheel(event: WheelEvent<HTMLElement>) {
    handleWheelGesture({
      event,
      gesture: dayWheelGestureRef.current,
      onNavigate: onNavigateDate
    });
  }

  function handleCalendarWheel(event: WheelEvent<HTMLElement>) {
    event.stopPropagation();

    handleWheelGesture({
      event,
      gesture: calendarWheelGestureRef.current,
      onNavigate: onNavigateCalendarMonth
    });
  }

  return {
    calendarGestureHandlers: {
      onPointerCancel: clearCalendarPointerGesture,
      onPointerDown: handleCalendarPointerDown,
      onPointerUp: handleCalendarPointerUp,
      onWheel: handleCalendarWheel
    },
    consumeCalendarSwipeSelection,
    dayGestureHandlers: {
      onPointerCancel: clearDayPointerGesture,
      onPointerDown: handleDayPointerDown,
      onPointerUp: handleDayPointerUp,
      onWheel: handleDayWheel
    },
    resetDayWheelGesture
  };
}
