import { describe, expect, it } from "vitest";

import { formatGigCardArtists } from "./gig-card-artists";

describe("formatGigCardArtists", () => {
  it("shows distinct artist names as a comma-separated line", () => {
    expect(
      formatGigCardArtists("ALT//THURSDAYS", [
        "Melānija",
        "Esper",
        "softwarebodyIV"
      ])
    ).toBe("Melānija, Esper, softwarebodyIV");
  });

  it("hides the artist line when entries are empty after cleanup", () => {
    expect(formatGigCardArtists("ALT//THURSDAYS", ["", "   "])).toBeNull();
  });

  it("hides the artist line when the list only repeats the title", () => {
    expect(formatGigCardArtists("Luude", [" luude ", "LUUDE"])).toBeNull();
  });

  it("dedupes repeated artist names while preserving first-seen order", () => {
    expect(
      formatGigCardArtists("ALT//THURSDAYS", [
        "Esper",
        "Melānija",
        "esper",
        "Melanija"
      ])
    ).toBe("Esper, Melānija");
  });

  it("drops title duplicates but keeps other distinct artists", () => {
    expect(
      formatGigCardArtists("Dani Dray 'Tell Me' Single Launch", [
        "Dani Dray",
        "Dani Dray",
        "Amelia Day"
      ])
    ).toBe("Dani Dray, Amelia Day");
  });
});
