import React from "react";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { theme } from "@/app/theme";

import {
  AccountComingSoonModal,
  SiteHeaderActions
} from "./site-header-actions";

function renderWithMantine(node: React.ReactNode) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      {node}
    </MantineProvider>
  );
}

describe("SiteHeaderActions", () => {
  it("renders account controls without the hidden theme toggle", () => {
    const html = renderWithMantine(<SiteHeaderActions />);

    expect(html).not.toContain('aria-label="Toggle color scheme"');
    expect(html).not.toContain('title="Toggle color scheme"');
    expect(html).not.toContain("site-header__theme-icon--sun");
    expect(html).not.toContain("site-header__theme-icon--moon");
    expect(html).toContain('aria-label="Open account information"');
    expect(html).toContain('title="Account"');
    expect(html).toContain("site-header__profile");
    expect(html).not.toContain("site-header__filter-toggle");
  });

  it("can render an optional leading action", () => {
    const html = renderWithMantine(
      <SiteHeaderActions
        leadingAction={
          <button className="site-header__filter-toggle" type="button">
            Search
          </button>
        }
      />
    );

    expect(html).toContain("site-header__filter-toggle");
    expect(html).not.toContain('aria-label="Toggle color scheme"');
    expect(html).toContain('aria-label="Open account information"');
  });

  it("renders the account coming-soon modal content when opened", () => {
    const html = renderWithMantine(
      <AccountComingSoonModal onClose={() => {}} opened withinPortal={false} />
    );

    expect(html).toContain("Accounts are coming soon");
    expect(html).toContain(
      "Once accounts are available, you&#x27;ll be able to save your favourite bands and venues and recieve notifications for gigs you care about."
    );
    expect(html).toContain("Got it");
    expect(html).toContain("account-modal__action");
  });
});
