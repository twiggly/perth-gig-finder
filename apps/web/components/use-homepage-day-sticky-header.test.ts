import { describe, expect, it } from "vitest";

import {
  HOMEPAGE_DATE_HEADER_OBSERVER_THRESHOLDS,
  getHomepageDateHeaderStuck,
  getHomepageDateHeaderStuckFromObserverEntry,
  shouldCorrectHomepageDateHeaderStuckOnScroll
} from "./use-homepage-day-sticky-header";

describe("homepage day sticky header helpers", () => {
  it("treats the date header as stuck when the sentinel is above the viewport", () => {
    expect(getHomepageDateHeaderStuck(-1)).toBe(true);
  });

  it("does not treat the date header as stuck while the sentinel is visible", () => {
    expect(getHomepageDateHeaderStuck(0)).toBe(false);
    expect(getHomepageDateHeaderStuck(12)).toBe(false);
  });

  it("does not treat missing sentinel geometry as stuck", () => {
    expect(getHomepageDateHeaderStuck(null)).toBe(false);
    expect(getHomepageDateHeaderStuck(undefined)).toBe(false);
  });

  it("maps observer geometry above the viewport to stuck", () => {
    expect(
      getHomepageDateHeaderStuckFromObserverEntry({
        boundingClientRect: { top: -0.5 } as DOMRectReadOnly
      })
    ).toBe(true);
  });

  it("maps visible observer geometry to unstuck", () => {
    expect(
      getHomepageDateHeaderStuckFromObserverEntry({
        boundingClientRect: { top: 0 } as DOMRectReadOnly
      })
    ).toBe(false);
    expect(
      getHomepageDateHeaderStuckFromObserverEntry({
        boundingClientRect: { top: 12 } as DOMRectReadOnly
      })
    ).toBe(false);
  });

  it("observes both initial intersection and full visibility boundaries", () => {
    expect(HOMEPAGE_DATE_HEADER_OBSERVER_THRESHOLDS).toEqual([0, 1]);
  });

  it("only schedules scroll correction while the header is currently stuck", () => {
    expect(shouldCorrectHomepageDateHeaderStuckOnScroll(true)).toBe(true);
    expect(shouldCorrectHomepageDateHeaderStuckOnScroll(false)).toBe(false);
  });
});
