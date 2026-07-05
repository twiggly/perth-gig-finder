import { describe, expect, it, vi } from "vitest";

import {
  dispatchHomepageBrandResetEvent,
  HOMEPAGE_BRAND_RESET_EVENT
} from "./homepage-brand-reset-event";

describe("homepage brand reset event", () => {
  it("dispatches the homepage brand reset event", () => {
    const targetWindow = {
      dispatchEvent: vi.fn(() => true)
    };

    expect(dispatchHomepageBrandResetEvent(targetWindow)).toBe(true);

    expect(targetWindow.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(targetWindow.dispatchEvent.mock.calls[0]?.[0].type).toBe(
      HOMEPAGE_BRAND_RESET_EVENT
    );
  });

  it("is a no-op without a browser event target", () => {
    expect(dispatchHomepageBrandResetEvent(null)).toBe(false);
  });
});
