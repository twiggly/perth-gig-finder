import { describe, expect, it } from "vitest";

import {
  shouldClearHomepageDateHeaderStuckHold,
  shouldHoldHomepageDateHeaderStuck
} from "./use-homepage-day-sticky-header";

describe("homepage day sticky header helpers", () => {
  it("holds the stuck date header state when React sticky state is active", () => {
    expect(
      shouldHoldHomepageDateHeaderStuck({
        isDateHeaderStuck: true,
        stickySentinelTop: 12
      })
    ).toBe(true);
  });

  it("holds the stuck date header state when live sentinel geometry is stuck", () => {
    expect(
      shouldHoldHomepageDateHeaderStuck({
        isDateHeaderStuck: false,
        stickySentinelTop: -1
      })
    ).toBe(true);
  });

  it("does not hold the stuck date header state for non-sticky transitions", () => {
    expect(
      shouldHoldHomepageDateHeaderStuck({
        isDateHeaderStuck: false,
        stickySentinelTop: 0
      })
    ).toBe(false);
    expect(
      shouldHoldHomepageDateHeaderStuck({
        isDateHeaderStuck: false,
        stickySentinelTop: null
      })
    ).toBe(false);
  });

  it("clears the stuck date header hold after a transition settles", () => {
    expect(
      shouldClearHomepageDateHeaderStuckHold({
        isDateHeaderTransitionStuckHold: true,
        isDateTransitioning: false
      })
    ).toBe(true);
  });

  it("keeps the stuck date header hold while a transition is active", () => {
    expect(
      shouldClearHomepageDateHeaderStuckHold({
        isDateHeaderTransitionStuckHold: true,
        isDateTransitioning: true
      })
    ).toBe(false);
  });

  it("does not clear a stuck date header hold when no hold is active", () => {
    expect(
      shouldClearHomepageDateHeaderStuckHold({
        isDateHeaderTransitionStuckHold: false,
        isDateTransitioning: false
      })
    ).toBe(false);
  });
});
