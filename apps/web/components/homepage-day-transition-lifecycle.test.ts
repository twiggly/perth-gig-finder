import { describe, expect, it } from "vitest";

import {
  getHomepageDayTransitionLifecyclePhase,
  isHomepageDayTransitionActive,
  isHomepageDayTransitionAnimating,
  isHomepageDayTransitionPreparing,
  isHomepageDayTransitionSettling
} from "./homepage-day-transition-lifecycle";

describe("homepage day transition lifecycle helpers", () => {
  it("treats a missing transition as idle", () => {
    expect(getHomepageDayTransitionLifecyclePhase(null)).toBe("idle");
    expect(isHomepageDayTransitionActive("idle")).toBe(false);
  });

  it("derives each explicit transition phase", () => {
    expect(
      getHomepageDayTransitionLifecyclePhase({ phase: "preparing" })
    ).toBe("preparing");
    expect(isHomepageDayTransitionPreparing("preparing")).toBe(true);

    expect(
      getHomepageDayTransitionLifecyclePhase({ phase: "animating" })
    ).toBe("animating");
    expect(isHomepageDayTransitionAnimating("animating")).toBe(true);

    expect(
      getHomepageDayTransitionLifecyclePhase({ phase: "settling" })
    ).toBe("settling");
    expect(isHomepageDayTransitionSettling("settling")).toBe(true);
  });
});
