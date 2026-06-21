import { describe, expect, it } from "vitest";

import {
  getHomepageDateHeaderStuckHoldRelease,
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

  it("does not hold stale stuck geometry at the top of the page", () => {
    expect(
      shouldHoldHomepageDateHeaderStuck({
        isDateHeaderStuck: true,
        scrollTop: 0,
        stickySentinelTop: -1
      })
    ).toBe(false);
  });

  it("does not release the stuck hold merely because a transition settled", () => {
    expect(
      getHomepageDateHeaderStuckHoldRelease({
        isDateHeaderTransitionStuckHold: true,
        isDateTransitioning: false,
        maxRetryCount: 3,
        retryCount: 0,
        stickySentinelTop: 0
      })
    ).toBe("retry");
  });

  it("keeps the stuck date header hold while a transition is active", () => {
    expect(
      getHomepageDateHeaderStuckHoldRelease({
        isDateHeaderTransitionStuckHold: true,
        isDateTransitioning: true,
        maxRetryCount: 3,
        retryCount: 0,
        stickySentinelTop: -1
      })
    ).toBe("keep");
  });

  it("releases the stuck hold immediately at the top of the page", () => {
    expect(
      getHomepageDateHeaderStuckHoldRelease({
        isDateHeaderTransitionStuckHold: true,
        isDateTransitioning: true,
        maxRetryCount: 3,
        retryCount: 0,
        scrollTop: 0,
        stickySentinelTop: -1
      })
    ).toBe("clear");
  });

  it("does not clear a stuck date header hold when no hold is active", () => {
    expect(
      getHomepageDateHeaderStuckHoldRelease({
        isDateHeaderTransitionStuckHold: false,
        isDateTransitioning: false,
        maxRetryCount: 3,
        retryCount: 0,
        stickySentinelTop: -1
      })
    ).toBe("keep");
  });

  it("releases the stuck hold when final sentinel geometry is stuck", () => {
    expect(
      getHomepageDateHeaderStuckHoldRelease({
        isDateHeaderTransitionStuckHold: true,
        isDateTransitioning: false,
        maxRetryCount: 3,
        retryCount: 0,
        stickySentinelTop: -1
      })
    ).toBe("clear");
  });

  it("eventually releases the stuck hold as a fallback", () => {
    expect(
      getHomepageDateHeaderStuckHoldRelease({
        isDateHeaderTransitionStuckHold: true,
        isDateTransitioning: false,
        maxRetryCount: 3,
        retryCount: 3,
        stickySentinelTop: 0
      })
    ).toBe("fallback-clear");
  });
});
