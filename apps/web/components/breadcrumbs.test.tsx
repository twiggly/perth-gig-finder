import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Breadcrumbs, BreadcrumbStructuredData } from "./breadcrumbs";

const items = [
  { href: "/", label: "Home" },
  { href: "/gigs", label: "All gigs" },
  { label: "Example gig" }
];

describe("Breadcrumbs", () => {
  it("renders visible navigation and matching structured data", () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs
        currentPath="/gigs/example-gig"
        id="example-breadcrumbs"
        items={items}
      />
    );

    expect(html).toContain('<nav aria-label="Breadcrumb"');
    expect(html).toContain('href="/gigs"');
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  it("can emit breadcrumb data without visible navigation", () => {
    const html = renderToStaticMarkup(
      <BreadcrumbStructuredData
        currentPath="/gigs/example-gig"
        id="example-breadcrumbs"
        items={items}
      />
    );

    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).not.toContain("<nav");
  });
});
