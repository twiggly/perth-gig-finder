import { describe, expect, it } from "vitest";

import {
  buildHomepageContentViewportStyle,
  buildHomepageDayTransitionPanes,
  buildHomepageHeadingTrackStyle,
  cancelHomepageDayTransitionCleanup,
  clearCompletedHomepageDayTransition,
  completeHomepageDayTransition,
  completeHomepageDayTransitionImmediately,
  getInitialHomepageDayNavigationState,
  scheduleHomepageDayTransitionCleanup,
  shouldIgnoreHomepageInitialDateSync,
  type BrowserTransition
} from "./use-homepage-day-navigation";

describe("buildHomepageDayTransitionPanes", () => {
  it("returns one active pane when there is no transition", () => {
    expect(buildHomepageDayTransitionPanes("2026-04-29", null)).toEqual([
      {
        dateKey: "2026-04-29",
        motionRole: "active",
        phase: null
      }
    ]);
  });

  it("returns from and to panes for an active transition", () => {
    const transition: BrowserTransition = {
      direction: "next",
      fromDateKey: "2026-04-29",
      phase: "animating",
      toDateKey: "2026-04-30"
    };

    expect(buildHomepageDayTransitionPanes("2026-04-29", transition)).toEqual([
      {
        dateKey: "2026-04-29",
        motionRole: "from",
        phase: "animating"
      },
      {
        dateKey: "2026-04-30",
        motionRole: "to",
        phase: "animating"
      }
    ]);
  });

  it("keeps completed transition panes mounted after the active date commits", () => {
    const transition: BrowserTransition = {
      direction: "next",
      fromDateKey: "2026-04-29",
      phase: "animating",
      toDateKey: "2026-04-30"
    };
    const completion = completeHomepageDayTransition(
      "2026-04-29",
      transition,
      "2026-04-30"
    );

    expect(completion).toEqual({
      activeDateKey: "2026-04-30",
      transition: {
        ...transition,
        phase: "settling"
      }
    });
    expect(
      buildHomepageDayTransitionPanes(
        completion.activeDateKey,
        completion.transition
      )
    ).toEqual([
      {
        dateKey: "2026-04-29",
        motionRole: "from",
        phase: "settling"
      },
      {
        dateKey: "2026-04-30",
        motionRole: "to",
        phase: "settling"
      }
    ]);
  });

  it("clears completed transition only after the second animation frame", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 0;
    let didCleanup = false;
    const frames = scheduleHomepageDayTransitionCleanup({
      onCleanup: () => {
        didCleanup = true;
      },
      requestAnimationFrame: (callback) => {
        nextFrameId += 1;
        callbacks.set(nextFrameId, callback);
        return nextFrameId;
      }
    });

    expect(frames).toEqual({
      firstFrame: 1,
      secondFrame: null
    });
    expect(didCleanup).toBe(false);

    callbacks.get(1)?.(16);
    expect(frames).toEqual({
      firstFrame: null,
      secondFrame: 2
    });
    expect(didCleanup).toBe(false);

    callbacks.get(2)?.(32);
    expect(frames).toEqual({
      firstFrame: null,
      secondFrame: null
    });
    expect(didCleanup).toBe(true);
  });

  it("cancels both pending transition cleanup frames", () => {
    const frames = {
      firstFrame: 1,
      secondFrame: 2
    };
    const cancelledFrames: number[] = [];

    cancelHomepageDayTransitionCleanup({
      cancelAnimationFrame: (handle) => {
        cancelledFrames.push(handle);
      },
      frames
    });

    expect(cancelledFrames).toEqual([1, 2]);
    expect(frames).toEqual({
      firstFrame: null,
      secondFrame: null
    });
  });

  it("clears only the matching completed transition", () => {
    const transition: BrowserTransition = {
      direction: "next",
      fromDateKey: "2026-04-29",
      phase: "animating",
      toDateKey: "2026-04-30"
    };

    expect(clearCompletedHomepageDayTransition(transition, "2026-04-30")).toBe(
      null
    );
    expect(clearCompletedHomepageDayTransition(transition, "2026-05-01")).toBe(
      transition
    );
  });

  it("keeps reduced-motion completion immediate", () => {
    expect(completeHomepageDayTransitionImmediately("2026-04-30")).toEqual({
      activeDateKey: "2026-04-30",
      transition: null
    });
  });

  it("restores a pending client-owned transition across URL handoff", () => {
    expect(
      getInitialHomepageDayNavigationState({
        initialActiveDateKey: "2026-04-30",
        pendingTransition: {
          direction: "next",
          fromDateKey: "2026-04-29",
          toDateKey: "2026-04-30"
        },
        prefersReducedMotion: false
      })
    ).toEqual({
      activeDateKey: "2026-04-29",
        transition: {
          direction: "next",
          fromDateKey: "2026-04-29",
          phase: "preparing",
          toDateKey: "2026-04-30"
        }
    });
  });

  it("does not restore pending transitions in reduced-motion mode", () => {
    expect(
      getInitialHomepageDayNavigationState({
        initialActiveDateKey: "2026-04-30",
        pendingTransition: {
          direction: "next",
          fromDateKey: "2026-04-29",
          toDateKey: "2026-04-30"
        },
        prefersReducedMotion: true
      })
    ).toEqual({
      activeDateKey: "2026-04-30",
      transition: null
    });
  });

  it("ignores initial active date echoes from client-owned URL updates", () => {
    expect(
      shouldIgnoreHomepageInitialDateSync({
        initialActiveDateKey: "2026-04-30",
        pendingClientDateKey: "2026-04-30"
      })
    ).toBe(true);

    expect(
      shouldIgnoreHomepageInitialDateSync({
        initialActiveDateKey: "2026-05-01",
        pendingClientDateKey: "2026-04-30"
      })
    ).toBe(false);

    expect(
      shouldIgnoreHomepageInitialDateSync({
        initialActiveDateKey: "2026-04-30",
        pendingClientDateKey: null
      })
    ).toBe(false);
  });
});

describe("homepage day transition styles", () => {
  it("preserves the heading transition CSS variables", () => {
    expect(buildHomepageHeadingTrackStyle()).toEqual({
      "--day-browser-heading-distance": "36px",
      "--day-browser-heading-duration": "240ms",
      "--day-browser-heading-easing": "cubic-bezier(0.45, 0.05, 0.55, 0.95)"
    });
  });

  it("preserves the content transition CSS variables", () => {
    expect(buildHomepageContentViewportStyle()).toEqual({
      "--day-browser-content-distance": "36px",
      "--day-browser-content-duration": "240ms",
      "--day-browser-content-easing": "cubic-bezier(0.45, 0.05, 0.55, 0.95)"
    });
  });
});
