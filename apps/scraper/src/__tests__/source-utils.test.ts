import { describe, expect, it } from "vitest";

import { normalizeUtcDate } from "../source-utils/date";
import {
  getErrorMessage,
  getOperationErrorMessage
} from "../source-utils/errors";
import {
  createBlockHtmlTextContext,
  createHtmlTextContext,
  loadHtmlFragment
} from "../source-utils/html-text";

describe("source utilities", () => {
  it("normalizes HTML text without inventing line boundaries", () => {
    expect(createHtmlTextContext("<p>One</p><p>Two &amp; Three</p>")).toEqual({
      plainText: "OneTwo & Three",
      lines: ["OneTwo & Three"]
    });
  });

  it("preserves the block boundaries used by lineup parsers", () => {
    expect(
      createBlockHtmlTextContext("<p>Line one<br>Line two</p><div>Line three</div>")
    ).toEqual({
      plainText: "Line one Line two Line three",
      lines: ["Line one", "Line two", "Line three"]
    });
  });

  it("returns an empty context for missing HTML", () => {
    expect(createBlockHtmlTextContext(null)).toEqual({
      plainText: null,
      lines: []
    });
  });

  it("loads a named fragment once for source-specific DOM parsing", () => {
    const { $, root } = loadHtmlFragment(
      "<p>First</p><p>Second</p>",
      "data-test-description-root"
    );

    expect(root.children().map((_, element) => $(element).text()).get()).toEqual([
      "First",
      "Second"
    ]);
  });

  it("normalizes UTC dates while preserving caller-specific errors", () => {
    expect(normalizeUtcDate("2026-07-14T12:30:00")).toBe(
      "2026-07-14T12:30:00.000Z"
    );
    expect(normalizeUtcDate(null)).toBeNull();
    expect(() => normalizeUtcDate("not-a-date", "Invalid source date")).toThrow(
      "Invalid source date: not-a-date"
    );
  });
});

describe("source error utilities", () => {
  it("preserves Error messages and unknown-value fallbacks", () => {
    expect(getErrorMessage(new Error("network failed"), "fallback")).toBe(
      "network failed"
    );
    expect(getErrorMessage("network failed", "fallback")).toBe("fallback");
  });

  it("preserves operation prefixes only for Error values", () => {
    expect(
      getOperationErrorMessage({
        error: new Error("timed out"),
        prefix: "Unable to fetch",
        fallback: "Unable to fetch"
      })
    ).toBe("Unable to fetch: timed out");
    expect(
      getOperationErrorMessage({
        error: "timed out",
        prefix: "Unable to fetch",
        fallback: "Unable to fetch"
      })
    ).toBe("Unable to fetch");
  });
});
