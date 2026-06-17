import { describe, expect, it } from "vitest";

import {
  getHomepageDayNaturalMaxScrollTop,
  getHomepageDayOutgoingCompensationOffset,
  getHomepageDayPreservedScrollTarget,
  getHomepageDayScrollDebtSettlement,
  getHomepageDayScrollCarryoverReserve,
  getHomepageDayScrollDebt,
  getHomepageDayTargetDocumentHeight,
  getHomepageDayScrollIntent,
  getHomepageDayScrollTarget,
  getHomepageDayStickyScrollTarget,
  getInitialHomepageDayScrollReservePlan,
  getNextHomepageDayScrollIntent,
  getNextHomepageDayScrollDebtReserve,
  isHomepageDayScrollIntentFresh,
  shouldPlanHomepageDayScrollReserve
} from "./use-homepage-day-scroll-restoration";

describe("homepage day scroll restoration helpers", () => {
  it("creates sticky scroll intent for sticky date changes", () => {
    expect(
      getHomepageDayScrollIntent({
        isDateHeaderStuck: true,
        scrollTop: 480,
        targetDateKey: "2026-06-15"
      })
    ).toEqual(
      expect.objectContaining({
        capturedScrollTop: 480,
        mode: "sticky",
        targetDateKey: "2026-06-15"
      })
    );
  });

  it("creates preserve-scroll intent for non-sticky partial-scroll date changes", () => {
    expect(
      getHomepageDayScrollIntent({
        isDateHeaderStuck: false,
        scrollTop: 140,
        targetDateKey: "2026-06-15"
      })
    ).toEqual(
      expect.objectContaining({
        capturedScrollTop: 140,
        mode: "preserve-scroll",
        targetDateKey: "2026-06-15"
      })
    );
  });

  it("creates no scroll intent for non-sticky top-of-page date changes", () => {
    expect(
      getHomepageDayScrollIntent({
        isDateHeaderStuck: false,
        scrollTop: 0,
        targetDateKey: "2026-06-15"
      })
    ).toBeNull();
  });

  it("keeps the larger captured preserve-scroll intent for the same target", () => {
    const currentIntent = {
      capturedScrollTop: 180,
      mode: "preserve-scroll" as const,
      targetDateKey: "2026-06-23",
      timestamp: 1000
    };

    expect(
      getNextHomepageDayScrollIntent({
        currentIntent,
        nextIntent: {
          capturedScrollTop: 98,
          mode: "preserve-scroll",
          targetDateKey: "2026-06-23",
          timestamp: 1100
        }
      })
    ).toEqual(currentIntent);
  });

  it("keeps sticky intent authoritative for the same target", () => {
    const stickyIntent = {
      capturedScrollTop: 120,
      mode: "sticky" as const,
      targetDateKey: "2026-06-23",
      timestamp: 1000
    };

    expect(
      getNextHomepageDayScrollIntent({
        currentIntent: stickyIntent,
        nextIntent: {
          capturedScrollTop: 180,
          mode: "preserve-scroll",
          targetDateKey: "2026-06-23",
          timestamp: 1100
        }
      })
    ).toEqual(stickyIntent);
  });

  it("promotes sticky intent over preserve-scroll intent for the same target", () => {
    const stickyIntent = {
      capturedScrollTop: 180,
      mode: "sticky" as const,
      targetDateKey: "2026-06-23",
      timestamp: 1100
    };

    expect(
      getNextHomepageDayScrollIntent({
        currentIntent: {
          capturedScrollTop: 120,
          mode: "preserve-scroll",
          targetDateKey: "2026-06-23",
          timestamp: 1000
        },
        nextIntent: stickyIntent
      })
    ).toEqual(stickyIntent);
  });

  it("treats stored sticky scroll intent as short lived", () => {
    expect(
      isHomepageDayScrollIntentFresh(
        {
          capturedScrollTop: 480,
          mode: "sticky",
          targetDateKey: "2026-06-15",
          timestamp: 1000
        },
        5000
      )
    ).toBe(true);

    expect(
      isHomepageDayScrollIntentFresh(
        {
          capturedScrollTop: 480,
          mode: "sticky",
          targetDateKey: "2026-06-15",
          timestamp: 1000
        },
        31001
      )
    ).toBe(false);
  });

  it("subtracts sticky header height and offset from the scroll target", () => {
    expect(
      getHomepageDayScrollTarget({
        contentTop: 300,
        currentScrollY: 500,
        stickyHeaderHeight: 88
      })
    ).toBe(704);
  });

  it("clamps negative scroll targets to zero", () => {
    expect(
      getHomepageDayScrollTarget({
        contentTop: 24,
        currentScrollY: 12,
        stickyHeaderHeight: 96
      })
    ).toBe(0);
  });

  it("keeps sticky scroll targets past the sentinel threshold", () => {
    expect(
      getHomepageDayStickyScrollTarget({
        contentTop: 96,
        currentScrollY: 0,
        stickyHeaderHeight: 88,
        stickySentinelTop: 240
      })
    ).toBe(241);
  });

  it("keeps content alignment when it is beyond the sentinel threshold", () => {
    expect(
      getHomepageDayStickyScrollTarget({
        contentTop: 420,
        currentScrollY: 120,
        stickyHeaderHeight: 88,
        stickySentinelTop: -12
      })
    ).toBe(444);
  });

  it("calculates outgoing compensation when sticky pre-scroll moves upward", () => {
    expect(
      getHomepageDayOutgoingCompensationOffset({
        capturedScrollTop: 1200,
        mode: "sticky",
        scrollTarget: 404
      })
    ).toBe(-796);
  });

  it("does not compensate when sticky pre-scroll would move downward", () => {
    expect(
      getHomepageDayOutgoingCompensationOffset({
        capturedScrollTop: 280,
        mode: "sticky",
        scrollTarget: 404
      })
    ).toBe(0);
  });

  it("does not compensate when sticky pre-scroll is not needed", () => {
    expect(
      getHomepageDayOutgoingCompensationOffset({
        capturedScrollTop: 404,
        mode: "sticky",
        scrollTarget: 404
      })
    ).toBe(0);
  });

  it("does not compensate outgoing panes for preserve-scroll mode", () => {
    expect(
      getHomepageDayOutgoingCompensationOffset({
        capturedScrollTop: 1200,
        mode: "preserve-scroll",
        scrollTarget: 404
      })
    ).toBe(0);
  });

  it("shrinks reserve after scroll debt settles", () => {
    expect(
      getHomepageDayScrollDebtSettlement({
        currentReserveHeight: 120,
        naturalMaxScrollTop: 404,
        scrollTop: 500
      })
    ).toEqual({
      reserveHeight: 96,
      shouldClear: false
    });
  });

  it("does not grow reserve after scroll debt settles", () => {
    expect(
      getHomepageDayScrollDebtSettlement({
        currentReserveHeight: 120,
        naturalMaxScrollTop: 280,
        scrollTop: 920
      })
    ).toEqual({
      reserveHeight: 120,
      shouldClear: false
    });
  });

  it("clears settled reserve when scroll reaches the natural maximum", () => {
    expect(
      getHomepageDayScrollDebtSettlement({
        currentReserveHeight: 120,
        naturalMaxScrollTop: 280,
        scrollTop: 280
      })
    ).toEqual({
      reserveHeight: 0,
      shouldClear: true
    });
  });

  it("calculates natural max scroll top from natural scroll height", () => {
    expect(
      getHomepageDayNaturalMaxScrollTop({
        clientHeight: 700,
        scrollHeight: 1400
      })
    ).toBe(700);
  });

  it("preserves negative natural max scroll top for pages shorter than the viewport", () => {
    expect(
      getHomepageDayNaturalMaxScrollTop({
        clientHeight: 700,
        scrollHeight: 420
      })
    ).toBe(-280);
  });

  it("has no scroll debt when scroll top is within the natural maximum", () => {
    expect(
      getHomepageDayScrollDebt({
        naturalMaxScrollTop: 280,
        scrollTop: 240
      })
    ).toBe(0);
  });

  it("uses positive scroll debt when scroll top exceeds the natural maximum", () => {
    expect(
      getHomepageDayScrollDebt({
        naturalMaxScrollTop: 280,
        scrollTop: 600
      })
    ).toBe(320);
  });

  it("restores preserve-scroll target when the browser drops below captured scroll", () => {
    expect(
      getHomepageDayPreservedScrollTarget({
        capturedScrollTop: 140,
        currentScrollTop: 0,
        naturalMaxScrollTop: 620,
        reserveHeight: 0
      })
    ).toBe(140);
  });

  it("does not restore preserve-scroll target when current scroll is already preserved", () => {
    expect(
      getHomepageDayPreservedScrollTarget({
        capturedScrollTop: 140,
        currentScrollTop: 140,
        naturalMaxScrollTop: 620,
        reserveHeight: 0
      })
    ).toBeNull();
  });

  it("carries active day scroll reserve into the next date transition", () => {
    expect(
      getHomepageDayScrollCarryoverReserve({
        activeDateKey: "2026-06-18",
        reserveDateKey: "2026-06-18",
        reserveHeight: 240
      })
    ).toEqual({
      dateKey: "2026-06-18",
      height: 240
    });
  });

  it("does not carry reserve for another date or zero-height reserve", () => {
    expect(
      getHomepageDayScrollCarryoverReserve({
        activeDateKey: "2026-06-18",
        reserveDateKey: "2026-06-17",
        reserveHeight: 240
      })
    ).toEqual({
      dateKey: null,
      height: 0
    });

    expect(
      getHomepageDayScrollCarryoverReserve({
        activeDateKey: "2026-06-18",
        reserveDateKey: "2026-06-18",
        reserveHeight: 0
      })
    ).toEqual({
      dateKey: null,
      height: 0
    });
  });

  it("caps preserve-scroll recovery to the debt-backed scroll maximum", () => {
    expect(
      getHomepageDayPreservedScrollTarget({
        capturedScrollTop: 320,
        currentScrollTop: 0,
        naturalMaxScrollTop: 120,
        reserveHeight: 80
      })
    ).toBe(200);
  });

  it("uses target reserve to recover the captured preserve-scroll position", () => {
    expect(
      getHomepageDayPreservedScrollTarget({
        capturedScrollTop: 320,
        currentScrollTop: 120,
        naturalMaxScrollTop: 120,
        reserveHeight: 220
      })
    ).toBe(320);
  });

  it("can seed sticky debt from current scroll before the final scroll target lands", () => {
    expect(
      getHomepageDayScrollDebt({
        naturalMaxScrollTop: -83,
        scrollTop: 548
      })
    ).toBe(631);
  });

  it("includes the viewport deficit in scroll debt for target days shorter than the viewport", () => {
    expect(
      getHomepageDayScrollDebt({
        naturalMaxScrollTop: -83,
        scrollTop: 280
      })
    ).toBe(363);
  });

  it("shrinks reserve as scroll debt decreases", () => {
    expect(
      getNextHomepageDayScrollDebtReserve({
        currentReserveHeight: 320,
        naturalMaxScrollTop: 280,
        scrollTop: 500
      })
    ).toBe(220);
  });

  it("does not increase reserve for the same settled date", () => {
    expect(
      getNextHomepageDayScrollDebtReserve({
        currentReserveHeight: 120,
        naturalMaxScrollTop: 280,
        scrollTop: 500
      })
    ).toBe(120);
  });

  it("clears reserve when scroll top reaches the natural maximum", () => {
    expect(
      getNextHomepageDayScrollDebtReserve({
        currentReserveHeight: 120,
        naturalMaxScrollTop: 280,
        scrollTop: 280
      })
    ).toBe(0);
  });

  it("clears reserve at page top when the target day is shorter than the viewport", () => {
    expect(
      getNextHomepageDayScrollDebtReserve({
        currentReserveHeight: 120,
        naturalMaxScrollTop: -84,
        scrollTop: 0
      })
    ).toBe(0);
  });

  it("estimates target-day document height by replacing the current content height", () => {
    expect(
      getHomepageDayTargetDocumentHeight({
        currentContentHeight: 1100,
        documentHeight: 1800,
        targetContentHeight: 420
      })
    ).toBe(1120);
  });

  it("estimates natural target-day height when provisional reserve is present", () => {
    expect(
      getHomepageDayTargetDocumentHeight({
        currentContentHeight: 1193,
        documentHeight: 1726,
        targetContentHeight: 330
      })
    ).toBe(863);
  });

  it("creates an initial reserve target before the incoming day is active", () => {
    expect(
      getInitialHomepageDayScrollReservePlan({
        capturedScrollTop: 548,
        mode: "sticky",
        targetDateKey: "2026-06-18",
        timestamp: 1000
      })
    ).toEqual({
      dateKey: "2026-06-18",
      height: 0,
      isPlanned: false,
      mode: "sticky",
      naturalMaxScrollTop: null,
      scrollTarget: null
    });
  });

  it("can seed a provisional reserve before the exact target is measured", () => {
    expect(
      getInitialHomepageDayScrollReservePlan(
        {
          capturedScrollTop: 548,
          mode: "sticky",
          targetDateKey: "2026-06-18",
          timestamp: 1000
        },
        720
      )
    ).toEqual({
      dateKey: "2026-06-18",
      height: 720,
      isPlanned: false,
      mode: "sticky",
      naturalMaxScrollTop: null,
      scrollTarget: null
    });
  });

  it("creates a preserve-scroll reserve target without provisional height", () => {
    expect(
      getInitialHomepageDayScrollReservePlan(
        {
          capturedScrollTop: 140,
          mode: "preserve-scroll",
          targetDateKey: "2026-06-18",
          timestamp: 1000
        },
        720
      )
    ).toEqual({
      dateKey: "2026-06-18",
      height: 0,
      isPlanned: false,
      mode: "preserve-scroll",
      naturalMaxScrollTop: null,
      scrollTarget: null
    });
  });

  it("does not create provisional reserve for non-sticky changes", () => {
    expect(getInitialHomepageDayScrollReservePlan(null, 720)).toEqual({
      dateKey: null,
      height: 0,
      isPlanned: false,
      mode: null,
      naturalMaxScrollTop: null,
      scrollTarget: null
    });
  });

  it("plans reserve only until a matching mode is planned", () => {
    const intent = {
      capturedScrollTop: 548,
      mode: "sticky" as const,
      targetDateKey: "2026-06-18",
      timestamp: 1000
    };

    expect(
      shouldPlanHomepageDayScrollReserve({
        intent,
        reserveIsPlanned: false,
        reserveDateKey: "2026-06-18",
        reserveMode: "sticky"
      })
    ).toBe(true);

    expect(
      shouldPlanHomepageDayScrollReserve({
        intent,
        reserveIsPlanned: true,
        reserveDateKey: "2026-06-18",
        reserveMode: "sticky"
      })
    ).toBe(false);

    expect(
      shouldPlanHomepageDayScrollReserve({
        intent,
        reserveIsPlanned: false,
        reserveDateKey: "2026-06-18",
        reserveMode: "preserve-scroll"
      })
    ).toBe(false);
  });
});
