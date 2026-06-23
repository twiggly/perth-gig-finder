import { describe, expect, it } from "vitest";

import { getHomepageDateHeaderStuck } from "./use-homepage-day-sticky-header";

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
});
