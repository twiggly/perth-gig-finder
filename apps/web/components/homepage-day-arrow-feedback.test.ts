import { describe, expect, it } from "vitest";

import {
  createHomepageDayArrowButtonPressHandoff,
  getHomepageDayArrowAvailability,
  getHomepageDayArrowFeedbackPhase,
  getHomepageDayArrowVisualBindings,
  INITIAL_HOMEPAGE_DAY_ARROW_FEEDBACK_STATE,
  reduceHomepageDayArrowFeedback,
  shouldPrepareHomepageDayArrowButtonFeedback,
  startHomepageDayArrowNavigation,
  type HomepageDayArrowFeedbackAction,
  type HomepageDayArrowFeedbackFrameScheduler,
  type HomepageDayArrowFeedbackState
} from "./homepage-day-arrow-feedback";

const AVAILABLE_DATE_KEYS = [
  "2026-07-15",
  "2026-07-16",
  "2026-07-17"
];

function reduceActions(
  actions: HomepageDayArrowFeedbackAction[],
  initialState: HomepageDayArrowFeedbackState =
    INITIAL_HOMEPAGE_DAY_ARROW_FEEDBACK_STATE
) {
  return actions.reduce(reduceHomepageDayArrowFeedback, initialState);
}

function createFrameSchedulerHarness() {
  const frames = new Map<number, () => void>();
  let nextFrame = 1;
  const scheduler: HomepageDayArrowFeedbackFrameScheduler = {
    cancel: (frame) => {
      frames.delete(frame);
    },
    request: (callback) => {
      const frame = nextFrame;

      nextFrame += 1;
      frames.set(frame, callback);
      return frame;
    }
  };

  return {
    flushNext() {
      const entry = frames.entries().next().value;

      if (!entry) {
        throw new Error("No animation frame is pending.");
      }

      const [frame, callback] = entry;

      frames.delete(frame);
      callback();
    },
    get pendingFrameCount() {
      return frames.size;
    },
    scheduler
  };
}

describe("homepage day arrow availability", () => {
  it.each([
    ["2026-07-15", { next: false, previous: true }],
    ["2026-07-16", { next: false, previous: false }],
    ["2026-07-17", { next: true, previous: false }]
  ])(
    "derives boundary availability for %s",
    (activeDateKey, expected) => {
      expect(
        getHomepageDayArrowAvailability({
          activeDateKey,
          availableDateKeys: AVAILABLE_DATE_KEYS
        })
      ).toEqual(expected);
    }
  );

  it("uses the transition target before the active date commits", () => {
    expect(
      getHomepageDayArrowAvailability({
        activeDateKey: "2026-07-16",
        availableDateKeys: AVAILABLE_DATE_KEYS,
        transitionTargetDateKey: "2026-07-15"
      })
    ).toEqual({ next: false, previous: true });
  });
});

describe("homepage day arrow pointer handoff", () => {
  it("prepares supported primary pointer presses", () => {
    for (const pointerType of ["mouse", "pen", "touch"]) {
      expect(
        shouldPrepareHomepageDayArrowButtonFeedback({
          button: 0,
          isPrimary: true,
          pointerType
        })
      ).toBe(true);
    }
  });

  it("rejects unsupported, secondary, and non-primary pointer presses", () => {
    for (const input of [
      { button: 1, isPrimary: true, pointerType: "mouse" },
      { button: 0, isPrimary: false, pointerType: "mouse" },
      { button: 0, isPrimary: true, pointerType: "" }
    ]) {
      expect(shouldPrepareHomepageDayArrowButtonFeedback(input)).toBe(false);
    }
  });

  it("keeps prepared feedback active across pointer-up and click", () => {
    const frameHarness = createFrameSchedulerHarness();
    const handoff = createHomepageDayArrowButtonPressHandoff(
      frameHarness.scheduler
    );
    const calls: string[] = [];

    handoff.prepare("next", 7);
    handoff.release("next", 7, () => calls.push("abandoned"));

    expect(frameHarness.pendingFrameCount).toBe(1);
    expect(handoff.consume()).toBe("next");
    expect(frameHarness.pendingFrameCount).toBe(0);
    expect(calls).toEqual([]);
  });

  it("clears prepared feedback when pointer-up produces no click", () => {
    const frameHarness = createFrameSchedulerHarness();
    const handoff = createHomepageDayArrowButtonPressHandoff(
      frameHarness.scheduler
    );
    const calls: string[] = [];

    handoff.prepare("previous", 12);
    handoff.release("previous", 12, () => calls.push("abandoned"));
    frameHarness.flushNext();

    expect(calls).toEqual(["abandoned"]);
    expect(handoff.consume()).toBeNull();
  });

  it("lets gesture navigation take over without running button cleanup", () => {
    const frameHarness = createFrameSchedulerHarness();
    const calls: string[] = [];
    const handoff = createHomepageDayArrowButtonPressHandoff(
      frameHarness.scheduler
    );

    handoff.prepare("previous", 9);
    handoff.release("previous", 9, () => calls.push("abandoned"));
    const preparedDirection = handoff.consume();
    const didNavigate = startHomepageDayArrowNavigation({
      beginNavigationFeedback: (direction, origin) => {
        calls.push(`feedback:${direction}:${origin}`);
      },
      cancelNavigationFeedback: () => calls.push("cancel"),
      clearDateChangeLayout: () => calls.push("clear-layout"),
      direction: "next",
      feedbackPrepared: preparedDirection === "next",
      navigateAdjacentDate: (direction) => {
        calls.push(`navigate:${direction}`);
        return true;
      },
      origin: "gesture"
    });

    expect(didNavigate).toBe(true);
    expect(frameHarness.pendingFrameCount).toBe(0);
    expect(calls).toEqual(["feedback:next:gesture", "navigate:next"]);
  });

  it("cancels only the matching prepared pointer", () => {
    const frameHarness = createFrameSchedulerHarness();
    const handoff = createHomepageDayArrowButtonPressHandoff(
      frameHarness.scheduler
    );

    handoff.prepare("previous", 4);

    expect(handoff.cancel("next", 4)).toBe(false);
    expect(handoff.cancel("previous", 5)).toBe(false);
    expect(handoff.cancel("previous", 4)).toBe(true);
    expect(handoff.consume()).toBeNull();
  });
});

describe("homepage day arrow navigation ordering", () => {
  it("queues feedback before navigation can flush layout", () => {
    const calls: string[] = [];
    const didNavigate = startHomepageDayArrowNavigation({
      beginNavigationFeedback: (direction, origin) => {
        calls.push(`feedback:${direction}:${origin}`);
      },
      cancelNavigationFeedback: () => calls.push("cancel"),
      clearDateChangeLayout: () => calls.push("clear-layout"),
      direction: "next",
      navigateAdjacentDate: (direction) => {
        calls.push(`navigate:${direction}`);
        return true;
      },
      origin: "button"
    });

    expect(didNavigate).toBe(true);
    expect(calls).toEqual(["feedback:next:button", "navigate:next"]);
  });

  it("does not restart feedback prepared by a direct pointer press", () => {
    const calls: string[] = [];
    const didNavigate = startHomepageDayArrowNavigation({
      beginNavigationFeedback: () => calls.push("feedback"),
      cancelNavigationFeedback: () => calls.push("cancel"),
      clearDateChangeLayout: () => calls.push("clear-layout"),
      direction: "next",
      feedbackPrepared: true,
      navigateAdjacentDate: () => {
        calls.push("navigate");
        return true;
      },
      origin: "button"
    });

    expect(didNavigate).toBe(true);
    expect(calls).toEqual(["navigate"]);
  });

  it("cleans up feedback and layout when navigation is rejected", () => {
    const calls: string[] = [];
    const didNavigate = startHomepageDayArrowNavigation({
      beginNavigationFeedback: () => calls.push("feedback"),
      cancelNavigationFeedback: () => calls.push("cancel"),
      clearDateChangeLayout: () => calls.push("clear-layout"),
      direction: "previous",
      navigateAdjacentDate: () => {
        calls.push("navigate");
        return false;
      },
      origin: "gesture"
    });

    expect(didNavigate).toBe(false);
    expect(calls).toEqual([
      "feedback",
      "navigate",
      "cancel",
      "clear-layout"
    ]);
  });
});

describe("homepage day arrow feedback lifecycle", () => {
  it("waits for a real transition before allowing feedback to settle", () => {
    const pendingState = reduceActions([
      {
        animate: true,
        direction: "next",
        origin: "gesture",
        type: "navigation-started"
      },
      {
        isNavigationLocked: false,
        isStickyHoldActive: false,
        transitionPhase: "idle",
        type: "lifecycle-changed"
      }
    ]);

    expect(pendingState).toMatchObject({
      hasObservedTransition: false,
      navigation: {
        direction: "next",
        origin: "gesture"
      }
    });
    expect(
      getHomepageDayArrowFeedbackPhase({
        direction: "next",
        state: pendingState,
        transitionPhase: "idle"
      })
    ).toBe("pending");
  });

  it("tracks the visual phase of the page transition", () => {
    const pendingState = reduceActions([
      {
        animate: true,
        direction: "next",
        origin: "gesture",
        type: "navigation-started"
      }
    ]);
    const activeState = reduceHomepageDayArrowFeedback(pendingState, {
      isNavigationLocked: true,
      isStickyHoldActive: false,
      transitionPhase: "animating",
      type: "lifecycle-changed"
    });

    expect(
      getHomepageDayArrowFeedbackPhase({
        direction: "next",
        state: pendingState,
        transitionPhase: "preparing"
      })
    ).toBe("pending");
    expect(
      getHomepageDayArrowFeedbackPhase({
        direction: "next",
        state: activeState,
        transitionPhase: "animating"
      })
    ).toBe("animating");
    expect(
      getHomepageDayArrowFeedbackPhase({
        direction: "next",
        state: activeState,
        transitionPhase: "settling"
      })
    ).toBe("settled");
    expect(
      getHomepageDayArrowFeedbackPhase({
        direction: "previous",
        state: activeState,
        transitionPhase: "animating"
      })
    ).toBeNull();
  });

  it("keeps live and restoration-cover feedback attributes aligned", () => {
    const state = reduceActions([
      {
        animate: true,
        direction: "previous",
        origin: "gesture",
        type: "navigation-started"
      },
      {
        isNavigationLocked: true,
        isStickyHoldActive: false,
        transitionPhase: "animating",
        type: "lifecycle-changed"
      }
    ]);
    const bindings = getHomepageDayArrowVisualBindings({
      direction: "previous",
      state,
      transitionPhase: "animating"
    });

    expect(bindings.buttonProps["data-navigation-feedback"]).toBe(
      "animating"
    );
    expect(bindings.coverProps["data-navigation-feedback"]).toBe(
      "animating"
    );
    expect(bindings.buttonProps["data-navigation-origin"]).toBe("gesture");
    expect(bindings.coverProps["data-navigation-origin"]).toBe("gesture");
    expect(bindings.buttonProps.className).toBe(
      "day-browser__arrow day-browser__arrow--previous"
    );
    expect(bindings.coverProps.className).toBe(
      "day-browser__arrow day-browser__arrow--previous day-browser__header-cover-arrow"
    );
  });

  it("retains feedback while navigation or sticky restoration is active", () => {
    const activeState = reduceActions([
      {
        animate: true,
        direction: "previous",
        origin: "button",
        type: "navigation-started"
      },
      {
        isNavigationLocked: true,
        isStickyHoldActive: false,
        transitionPhase: "animating",
        type: "lifecycle-changed"
      },
      {
        isNavigationLocked: false,
        isStickyHoldActive: true,
        transitionPhase: "idle",
        type: "lifecycle-changed"
      }
    ]);

    expect(activeState).toMatchObject({
      hasObservedTransition: true,
      navigation: {
        direction: "previous",
        origin: "button"
      }
    });
    expect(
      getHomepageDayArrowFeedbackPhase({
        direction: "previous",
        state: activeState,
        transitionPhase: "idle"
      })
    ).toBe("settled");
  });

  it("clears feedback after transition and sticky restoration complete", () => {
    const settledState = reduceActions([
      {
        animate: true,
        direction: "next",
        origin: "button",
        type: "navigation-started"
      },
      { direction: "next", type: "keyboard-focused" },
      {
        isNavigationLocked: true,
        isStickyHoldActive: false,
        transitionPhase: "preparing",
        type: "lifecycle-changed"
      },
      { direction: "next", type: "keyboard-blurred" },
      {
        isNavigationLocked: false,
        isStickyHoldActive: false,
        transitionPhase: "idle",
        type: "lifecycle-changed"
      }
    ]);

    expect(settledState).toEqual(
      INITIAL_HOMEPAGE_DAY_ARROW_FEEDBACK_STATE
    );
  });

  it("clears cancelled navigation and its retained keyboard feedback", () => {
    const cancelledState = reduceActions([
      { direction: "next", type: "keyboard-focused" },
      {
        animate: true,
        direction: "next",
        origin: "button",
        type: "navigation-started"
      },
      { type: "navigation-cancelled" }
    ]);

    expect(cancelledState).toEqual(
      INITIAL_HOMEPAGE_DAY_ARROW_FEEDBACK_STATE
    );
    expect(
      getHomepageDayArrowFeedbackPhase({
        direction: "next",
        state: cancelledState,
        transitionPhase: "idle"
      })
    ).toBeNull();
  });

  it("does not retain animated navigation feedback for reduced motion", () => {
    const reducedMotionState = reduceActions([
      {
        animate: false,
        direction: "next",
        origin: "gesture",
        type: "navigation-started"
      }
    ]);

    expect(reducedMotionState.navigation).toBeNull();
    expect(
      getHomepageDayArrowFeedbackPhase({
        direction: "next",
        state: reducedMotionState,
        transitionPhase: "animating"
      })
    ).toBeNull();
  });

  it("clears keyboard focus normally when navigation is inactive", () => {
    const blurredState = reduceActions([
      { direction: "previous", type: "keyboard-focused" },
      { direction: "previous", type: "keyboard-blurred" }
    ]);

    expect(blurredState.keyboardFocusDirection).toBeNull();
  });
});
