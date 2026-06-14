import { describe, expect, it } from "vitest";

import {
  buildGigDetailFallbackHref,
  buildHomepageReturnHref,
  consumeValidGigDetailReturnState,
  GIG_DETAIL_RETURN_STATE_MAX_AGE_MS,
  GIG_DETAIL_RETURN_STATE_STORAGE_KEY,
  isPlainGigDetailNavigationClick,
  readValidGigDetailReturnState,
  writeGigDetailReturnState,
  type GigDetailReturnStorage
} from "./gig-detail-return";

class MemoryStorage implements GigDetailReturnStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function createPlainClick(overrides = {}) {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    shiftKey: false,
    target: "",
    ...overrides
  };
}

describe("gig detail return state", () => {
  it("stores and accepts a same-tab homepage return URL for the matching gig", () => {
    const storage = new MemoryStorage();

    writeGigDetailReturnState({
      href: "/?date=2026-06-14&venue=four5nine-bar-rosemount#today",
      nowMs: 1_000,
      slug: "opm-acoustic-night",
      storage
    });

    expect(
      readValidGigDetailReturnState({
        nowMs: 2_000,
        slug: "opm-acoustic-night",
        storage
      })
    ).toEqual({
      createdAt: 1_000,
      href: "/?date=2026-06-14&venue=four5nine-bar-rosemount#today",
      slug: "opm-acoustic-night"
    });
  });

  it("consumes valid return state once", () => {
    const storage = new MemoryStorage();

    writeGigDetailReturnState({
      href: "/?date=2026-06-14",
      nowMs: 1_000,
      slug: "opm-acoustic-night",
      storage
    });

    expect(
      consumeValidGigDetailReturnState({
        nowMs: 2_000,
        slug: "opm-acoustic-night",
        storage
      })?.href
    ).toBe("/?date=2026-06-14");
    expect(
      readValidGigDetailReturnState({
        nowMs: 2_000,
        slug: "opm-acoustic-night",
        storage
      })
    ).toBeNull();
  });

  it("rejects stale and wrong-slug return state", () => {
    const staleStorage = new MemoryStorage();
    const wrongSlugStorage = new MemoryStorage();

    writeGigDetailReturnState({
      href: "/?date=2026-06-14",
      nowMs: 1_000,
      slug: "opm-acoustic-night",
      storage: staleStorage
    });
    writeGigDetailReturnState({
      href: "/?date=2026-06-14",
      nowMs: 1_000,
      slug: "another-gig",
      storage: wrongSlugStorage
    });

    expect(
      readValidGigDetailReturnState({
        nowMs: 1_001 + GIG_DETAIL_RETURN_STATE_MAX_AGE_MS,
        slug: "opm-acoustic-night",
        storage: staleStorage
      })
    ).toBeNull();
    expect(
      readValidGigDetailReturnState({
        nowMs: 2_000,
        slug: "opm-acoustic-night",
        storage: wrongSlugStorage
      })
    ).toBeNull();
  });

  it("rejects non-homepage paths, external URLs, and malformed data", () => {
    const nonHomepageStorage = new MemoryStorage();
    const externalStorage = new MemoryStorage();
    const malformedStorage = new MemoryStorage();

    writeGigDetailReturnState({
      href: "/gigs/opm-acoustic-night",
      nowMs: 1_000,
      slug: "opm-acoustic-night",
      storage: nonHomepageStorage
    });
    writeGigDetailReturnState({
      href: "https://example.com/?date=2026-06-14",
      nowMs: 1_000,
      slug: "opm-acoustic-night",
      storage: externalStorage
    });
    malformedStorage.setItem(GIG_DETAIL_RETURN_STATE_STORAGE_KEY, "{nope");

    expect(
      readValidGigDetailReturnState({
        nowMs: 2_000,
        slug: "opm-acoustic-night",
        storage: nonHomepageStorage
      })
    ).toBeNull();
    expect(
      readValidGigDetailReturnState({
        nowMs: 2_000,
        slug: "opm-acoustic-night",
        storage: externalStorage
      })
    ).toBeNull();
    expect(
      readValidGigDetailReturnState({
        nowMs: 2_000,
        slug: "opm-acoustic-night",
        storage: malformedStorage
      })
    ).toBeNull();
  });

  it("builds return and fallback homepage URLs", () => {
    expect(
      buildHomepageReturnHref(
        {
          hash: "#card",
          pathname: "/",
          search: "?date=2026-06-14&q=jazz"
        },
        "2026-06-15T11:00:00.000Z"
      )
    ).toBe("/?date=2026-06-15&q=jazz#card");
    expect(
      buildHomepageReturnHref(
        {
          hash: "",
          pathname: "/gigs/opm-acoustic-night",
          search: ""
        },
        "2026-06-13T17:00:00.000Z"
      )
    ).toBeNull();
    expect(buildGigDetailFallbackHref("2026-06-13T17:00:00.000Z")).toBe(
      "/?date=2026-06-14"
    );
  });

  it("preserves filters while adding the clicked gig date", () => {
    expect(
      buildHomepageReturnHref(
        {
          hash: "",
          pathname: "/",
          search: "?venue=the-ellington-jazz-club"
        },
        "2026-06-15T11:00:00.000Z"
      )
    ).toBe("/?venue=the-ellington-jazz-club&date=2026-06-15");
    expect(
      buildHomepageReturnHref(
        {
          hash: "#selected",
          pathname: "/",
          search: "?q=jazz&venue=the-bird&venue=mojos-bar&when=weekend"
        },
        "2026-06-19T13:30:00.000Z"
      )
    ).toBe("/?q=jazz&venue=the-bird&venue=mojos-bar&date=2026-06-19#selected");
  });

  it("only records plain same-tab navigation clicks", () => {
    expect(isPlainGigDetailNavigationClick(createPlainClick())).toBe(true);
    expect(
      isPlainGigDetailNavigationClick(createPlainClick({ metaKey: true }))
    ).toBe(false);
    expect(isPlainGigDetailNavigationClick(createPlainClick({ button: 1 }))).toBe(
      false
    );
    expect(
      isPlainGigDetailNavigationClick(createPlainClick({ target: "_blank" }))
    ).toBe(false);
  });
});
