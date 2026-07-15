import {
  getAdjacentDateKey,
  type SwipeDirection
} from "@/lib/homepage-dates";
import type { HomepageDayTransitionLifecyclePhase } from "./homepage-day-transition-lifecycle";

export type HomepageDayArrowFeedbackPhase =
  | "animating"
  | "pending"
  | "settled";

export type HomepageDayArrowNavigationOrigin = "button" | "gesture";

interface HomepageDayArrowNavigationFeedback {
  direction: SwipeDirection;
  origin: HomepageDayArrowNavigationOrigin;
}

export interface HomepageDayArrowFeedbackState {
  hasObservedTransition: boolean;
  keyboardFocusDirection: SwipeDirection | null;
  navigation: HomepageDayArrowNavigationFeedback | null;
}

export type HomepageDayArrowFeedbackAction =
  | {
      animate: boolean;
      direction: SwipeDirection;
      origin: HomepageDayArrowNavigationOrigin;
      type: "navigation-started";
    }
  | {
      isNavigationLocked: boolean;
      isStickyHoldActive: boolean;
      transitionPhase: HomepageDayTransitionLifecyclePhase;
      type: "lifecycle-changed";
    }
  | { type: "navigation-cancelled" }
  | { direction: SwipeDirection; type: "keyboard-focused" }
  | { direction: SwipeDirection; type: "keyboard-blurred" };

export interface HomepageDayArrowVisualProps {
  className: string;
  "data-keyboard-focus"?: "true";
  "data-navigation-feedback"?: HomepageDayArrowFeedbackPhase;
  "data-navigation-origin"?: HomepageDayArrowNavigationOrigin;
}

export interface HomepageDayArrowVisualBindings {
  buttonProps: HomepageDayArrowVisualProps;
  coverProps: HomepageDayArrowVisualProps;
}

interface HomepageDayArrowPreparedButtonPress {
  direction: SwipeDirection;
  pointerId: number;
}

export interface HomepageDayArrowFeedbackFrameScheduler {
  cancel: (frame: number) => void;
  request: (callback: () => void) => number;
}

export const INITIAL_HOMEPAGE_DAY_ARROW_FEEDBACK_STATE: HomepageDayArrowFeedbackState = {
  hasObservedTransition: false,
  keyboardFocusDirection: null,
  navigation: null
};

export function getHomepageDayArrowAvailability({
  activeDateKey,
  availableDateKeys,
  transitionTargetDateKey
}: {
  activeDateKey: string;
  availableDateKeys: string[];
  transitionTargetDateKey?: string;
}): Record<SwipeDirection, boolean> {
  const visualDateKey = transitionTargetDateKey ?? activeDateKey;

  return {
    next:
      getAdjacentDateKey(availableDateKeys, visualDateKey, "next") === null,
    previous:
      getAdjacentDateKey(availableDateKeys, visualDateKey, "previous") === null
  };
}

function clearNavigationFeedback(
  state: HomepageDayArrowFeedbackState
): HomepageDayArrowFeedbackState {
  const navigationDirection = state.navigation?.direction ?? null;

  return {
    ...state,
    hasObservedTransition: false,
    keyboardFocusDirection:
      state.keyboardFocusDirection === navigationDirection
        ? null
        : state.keyboardFocusDirection,
    navigation: null
  };
}

export function reduceHomepageDayArrowFeedback(
  state: HomepageDayArrowFeedbackState,
  action: HomepageDayArrowFeedbackAction
): HomepageDayArrowFeedbackState {
  switch (action.type) {
    case "navigation-started":
      return action.animate
        ? {
            ...state,
            hasObservedTransition: false,
            navigation: {
              direction: action.direction,
              origin: action.origin
            }
          }
        : {
            ...state,
            hasObservedTransition: false,
            navigation: null
          };
    case "lifecycle-changed": {
      if (!state.navigation) {
        return state;
      }

      if (action.transitionPhase !== "idle") {
        return state.hasObservedTransition
          ? state
          : {
              ...state,
              hasObservedTransition: true
            };
      }

      if (
        !state.hasObservedTransition ||
        action.isNavigationLocked ||
        action.isStickyHoldActive
      ) {
        return state;
      }

      return clearNavigationFeedback(state);
    }
    case "navigation-cancelled":
      return clearNavigationFeedback(state);
    case "keyboard-focused":
      return state.keyboardFocusDirection === action.direction
        ? state
        : {
            ...state,
            keyboardFocusDirection: action.direction
          };
    case "keyboard-blurred":
      if (
        state.keyboardFocusDirection !== action.direction ||
        state.navigation?.direction === action.direction
      ) {
        return state;
      }

      return {
        ...state,
        keyboardFocusDirection: null
      };
  }
}

export function createHomepageDayArrowButtonPressHandoff(
  frameScheduler: HomepageDayArrowFeedbackFrameScheduler
) {
  let cleanupFrame: number | null = null;
  let preparedPress: HomepageDayArrowPreparedButtonPress | null = null;

  function clearCleanupFrame() {
    if (cleanupFrame !== null) {
      frameScheduler.cancel(cleanupFrame);
      cleanupFrame = null;
    }
  }

  function matches(direction: SwipeDirection, pointerId: number) {
    return (
      preparedPress?.direction === direction &&
      preparedPress.pointerId === pointerId
    );
  }

  return {
    cancel(direction: SwipeDirection, pointerId: number): boolean {
      if (!matches(direction, pointerId)) {
        return false;
      }

      clearCleanupFrame();
      preparedPress = null;
      return true;
    },
    consume(): SwipeDirection | null {
      const preparedDirection = preparedPress?.direction ?? null;

      clearCleanupFrame();
      preparedPress = null;
      return preparedDirection;
    },
    dispose() {
      clearCleanupFrame();
      preparedPress = null;
    },
    prepare(direction: SwipeDirection, pointerId: number) {
      clearCleanupFrame();
      preparedPress = { direction, pointerId };
    },
    release(
      direction: SwipeDirection,
      pointerId: number,
      onAbandoned: () => void
    ) {
      if (!matches(direction, pointerId)) {
        return;
      }

      clearCleanupFrame();
      cleanupFrame = frameScheduler.request(() => {
        cleanupFrame = null;

        if (matches(direction, pointerId)) {
          preparedPress = null;
          onAbandoned();
        }
      });
    }
  };
}

export function shouldPrepareHomepageDayArrowButtonFeedback({
  button,
  isPrimary,
  pointerType
}: {
  button: number;
  isPrimary: boolean;
  pointerType: string;
}): boolean {
  return (
    isPrimary &&
    button === 0 &&
    (pointerType === "mouse" ||
      pointerType === "pen" ||
      pointerType === "touch")
  );
}

export function getHomepageDayArrowFeedbackPhase({
  direction,
  state,
  transitionPhase
}: {
  direction: SwipeDirection;
  state: HomepageDayArrowFeedbackState;
  transitionPhase: HomepageDayTransitionLifecyclePhase;
}): HomepageDayArrowFeedbackPhase | null {
  if (state.navigation?.direction !== direction) {
    return null;
  }

  if (transitionPhase === "animating") {
    return "animating";
  }

  if (
    transitionPhase === "settling" ||
    (transitionPhase === "idle" && state.hasObservedTransition)
  ) {
    return "settled";
  }

  return "pending";
}

function getHomepageDayArrowVisualProps({
  direction,
  state,
  transitionPhase
}: {
  direction: SwipeDirection;
  state: HomepageDayArrowFeedbackState;
  transitionPhase: HomepageDayTransitionLifecyclePhase;
}): HomepageDayArrowVisualProps {
  const feedbackPhase = getHomepageDayArrowFeedbackPhase({
    direction,
    state,
    transitionPhase
  });

  return {
    className: `day-browser__arrow day-browser__arrow--${direction}`,
    "data-keyboard-focus":
      state.keyboardFocusDirection === direction ? "true" : undefined,
    "data-navigation-feedback": feedbackPhase ?? undefined,
    "data-navigation-origin": feedbackPhase
      ? state.navigation?.origin
      : undefined
  };
}

export function getHomepageDayArrowVisualBindings({
  direction,
  state,
  transitionPhase
}: {
  direction: SwipeDirection;
  state: HomepageDayArrowFeedbackState;
  transitionPhase: HomepageDayTransitionLifecyclePhase;
}): HomepageDayArrowVisualBindings {
  const buttonProps = getHomepageDayArrowVisualProps({
    direction,
    state,
    transitionPhase
  });

  return {
    buttonProps,
    coverProps: {
      ...buttonProps,
      className: `${buttonProps.className} day-browser__header-cover-arrow`
    }
  };
}

export function startHomepageDayArrowNavigation({
  beginNavigationFeedback,
  cancelNavigationFeedback,
  clearDateChangeLayout,
  direction,
  feedbackPrepared = false,
  navigateAdjacentDate,
  origin
}: {
  beginNavigationFeedback: (
    direction: SwipeDirection,
    origin: HomepageDayArrowNavigationOrigin
  ) => void;
  cancelNavigationFeedback: () => void;
  clearDateChangeLayout: () => void;
  direction: SwipeDirection;
  feedbackPrepared?: boolean;
  navigateAdjacentDate: (direction: SwipeDirection) => boolean;
  origin: HomepageDayArrowNavigationOrigin;
}): boolean {
  // Keyboard and gesture navigation still need feedback queued before layout flushes.
  if (!feedbackPrepared) {
    beginNavigationFeedback(direction, origin);
  }

  const didNavigate = navigateAdjacentDate(direction);

  if (!didNavigate) {
    cancelNavigationFeedback();
    clearDateChangeLayout();
  }

  return didNavigate;
}
