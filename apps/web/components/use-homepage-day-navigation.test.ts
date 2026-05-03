import { describe, expect, it } from "vitest";

import {
  buildHomepageContentViewportStyle,
  buildHomepageDayTransitionPanes,
  buildHomepageHeadingTrackStyle,
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
