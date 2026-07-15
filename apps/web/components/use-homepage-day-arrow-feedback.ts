"use client";

import {
  useEffect,
  useReducer,
  useRef,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type PointerEventHandler
} from "react";

import type { SwipeDirection } from "@/lib/homepage-dates";
import {
  createHomepageDayArrowButtonPressHandoff,
  getHomepageDayArrowVisualBindings,
  INITIAL_HOMEPAGE_DAY_ARROW_FEEDBACK_STATE,
  reduceHomepageDayArrowFeedback,
  shouldPrepareHomepageDayArrowButtonFeedback,
  startHomepageDayArrowNavigation,
  type HomepageDayArrowNavigationOrigin,
  type HomepageDayArrowVisualProps
} from "./homepage-day-arrow-feedback";
import type { HomepageDayTransitionLifecyclePhase } from "./homepage-day-transition-lifecycle";

interface UseHomepageDayArrowFeedbackOptions {
  clearDateChangeLayout: () => void;
  isNavigationLocked: boolean;
  isStickyHoldActive: boolean;
  navigateAdjacentDate: (direction: SwipeDirection) => boolean;
  prefersReducedMotion: boolean;
  transitionPhase: HomepageDayTransitionLifecyclePhase;
}

export interface HomepageDayArrowButtonBindings
  extends HomepageDayArrowVisualProps {
  onBlur: FocusEventHandler<HTMLButtonElement>;
  onClick: MouseEventHandler<HTMLButtonElement>;
  onFocus: FocusEventHandler<HTMLButtonElement>;
  onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  onPointerCancel: PointerEventHandler<HTMLButtonElement>;
  onPointerDown: PointerEventHandler<HTMLButtonElement>;
  onPointerLeave: PointerEventHandler<HTMLButtonElement>;
  onPointerUp: PointerEventHandler<HTMLButtonElement>;
}

export interface HomepageDayArrowBindings {
  buttonProps: HomepageDayArrowButtonBindings;
  coverProps: HomepageDayArrowVisualProps;
}

const browserAnimationFrameScheduler = {
  cancel: (frame: number) => window.cancelAnimationFrame(frame),
  request: (callback: () => void) => window.requestAnimationFrame(callback)
};

export function useHomepageDayArrowFeedback({
  clearDateChangeLayout,
  isNavigationLocked,
  isStickyHoldActive,
  navigateAdjacentDate,
  prefersReducedMotion,
  transitionPhase
}: UseHomepageDayArrowFeedbackOptions) {
  const [state, dispatch] = useReducer(
    reduceHomepageDayArrowFeedback,
    INITIAL_HOMEPAGE_DAY_ARROW_FEEDBACK_STATE
  );
  const buttonPressHandoffRef = useRef<ReturnType<
    typeof createHomepageDayArrowButtonPressHandoff
  > | null>(null);

  if (!buttonPressHandoffRef.current) {
    buttonPressHandoffRef.current =
      createHomepageDayArrowButtonPressHandoff(
        browserAnimationFrameScheduler
      );
  }

  useEffect(() => {
    dispatch({
      isNavigationLocked,
      isStickyHoldActive,
      transitionPhase,
      type: "lifecycle-changed"
    });
  }, [isNavigationLocked, isStickyHoldActive, transitionPhase]);

  useEffect(
    () => () => {
      buttonPressHandoffRef.current?.dispose();
    },
    []
  );

  function beginNavigationFeedback(
    direction: SwipeDirection,
    origin: HomepageDayArrowNavigationOrigin
  ) {
    dispatch({
      animate: !prefersReducedMotion,
      direction,
      origin,
      type: "navigation-started"
    });
  }

  function cancelNavigationFeedback() {
    buttonPressHandoffRef.current?.dispose();
    dispatch({ type: "navigation-cancelled" });
  }

  function navigateWithFeedback(
    direction: SwipeDirection,
    origin: HomepageDayArrowNavigationOrigin
  ): boolean {
    const preparedDirection = buttonPressHandoffRef.current?.consume() ?? null;

    return startHomepageDayArrowNavigation({
      beginNavigationFeedback,
      cancelNavigationFeedback,
      clearDateChangeLayout,
      direction,
      feedbackPrepared:
        origin === "button" && preparedDirection === direction,
      navigateAdjacentDate,
      origin
    });
  }

  function createArrowBindings(
    direction: SwipeDirection
  ): HomepageDayArrowBindings {
    const visualBindings = getHomepageDayArrowVisualBindings({
      direction,
      state,
      transitionPhase
    });

    return {
      buttonProps: {
        ...visualBindings.buttonProps,
        onBlur: () => {
          dispatch({ direction, type: "keyboard-blurred" });
        },
        onClick: () => {
          navigateWithFeedback(direction, "button");
        },
        onFocus: (event) => {
          if (event.currentTarget.matches(":focus-visible")) {
            dispatch({ direction, type: "keyboard-focused" });
          }
        },
        onKeyDown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            dispatch({ direction, type: "keyboard-focused" });
          }
        },
        onPointerCancel: (event) => {
          if (
            buttonPressHandoffRef.current?.cancel(
              direction,
              event.pointerId
            )
          ) {
            dispatch({ type: "navigation-cancelled" });
          }
        },
        onPointerDown: (event) => {
          if (
            event.currentTarget.disabled ||
            !shouldPrepareHomepageDayArrowButtonFeedback(event)
          ) {
            return;
          }

          buttonPressHandoffRef.current?.prepare(
            direction,
            event.pointerId
          );
          beginNavigationFeedback(direction, "button");
        },
        onPointerLeave: (event) => {
          if (
            event.buttons !== 0 &&
            buttonPressHandoffRef.current?.cancel(
              direction,
              event.pointerId
            )
          ) {
            dispatch({ type: "navigation-cancelled" });
          }
        },
        onPointerUp: (event) => {
          buttonPressHandoffRef.current?.release(
            direction,
            event.pointerId,
            () => dispatch({ type: "navigation-cancelled" })
          );
        }
      },
      coverProps: visualBindings.coverProps
    };
  }

  return {
    arrowBindings: {
      next: createArrowBindings("next"),
      previous: createArrowBindings("previous")
    },
    cancelNavigationFeedback,
    navigateWithFeedback
  };
}
