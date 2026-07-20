import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicPageShell } from "./public-page-shell";

describe("PublicPageShell", () => {
  it("adds discovery navigation outside the established page content", () => {
    const html = renderToStaticMarkup(
      <PublicPageShell>
        <p>Discovery content</p>
      </PublicPageShell>
    );

    expect(html).toContain('<main class="page-shell discovery-page">');
    expect(html).toContain("Discovery content");
    expect(html).toContain('<footer class="site-footer">');
    expect(html).toContain('href="/tonight"');
    expect(html).toContain('href="/venues"');
  });
});
