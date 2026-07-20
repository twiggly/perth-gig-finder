import { describe, expect, it } from "vitest";

import {
  buildBreadcrumbStructuredData,
  buildBreadcrumbStructuredDataJson
} from "./breadcrumbs";

describe("breadcrumb structured data", () => {
  it("matches visible breadcrumb order and resolves the current leaf URL", () => {
    const items = [
      { href: "/", label: "Home" },
      { href: "/gigs", label: "All gigs" },
      { label: "Example gig" }
    ];
    const data = buildBreadcrumbStructuredData(items, "/gigs/example-gig");

    expect(data.itemListElement).toEqual([
      expect.objectContaining({
        item: "https://gigradar.com.au/",
        name: "Home",
        position: 1
      }),
      expect.objectContaining({
        item: "https://gigradar.com.au/gigs",
        name: "All gigs",
        position: 2
      }),
      expect.objectContaining({
        item: "https://gigradar.com.au/gigs/example-gig",
        name: "Example gig",
        position: 3
      })
    ]);
    expect(JSON.parse(buildBreadcrumbStructuredDataJson(items, "/gigs/example-gig")))
      .toEqual(data);
  });
});
