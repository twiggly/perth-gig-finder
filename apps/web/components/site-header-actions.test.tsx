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
    expect(html).toContain("site-header__action-icons");
    expect(html).not.toContain("site-header__action-secondary");
    expect(html).not.toContain("site-header__filter-toggle");
  });

  it("can render custom homepage actions after profile controls", () => {
    const html = renderWithMantine(
      <SiteHeaderActions>
        <button className="site-header__filter-toggle" type="button">
          Search
        </button>
        <button className="site-header__menu-button" type="button">
          Menu
        </button>
      </SiteHeaderActions>
    );

    const iconGroupIndex = html.indexOf("site-header__action-icons");
    const profileIndex = html.indexOf("site-header__profile");
    const searchIndex = html.indexOf("site-header__filter-toggle");
    const menuIndex = html.indexOf("site-header__menu-button");

    expect(iconGroupIndex).toBeGreaterThan(-1);
    expect(profileIndex).toBeGreaterThan(iconGroupIndex);
    expect(searchIndex).toBeGreaterThan(profileIndex);
    expect(menuIndex).toBeGreaterThan(searchIndex);
    expect(html).not.toContain("site-header__action-secondary");
  });

  it("can render custom homepage actions without profile controls", () => {
    const html = renderWithMantine(
      <SiteHeaderActions showProfile={false}>
        <span className="site-header__location">Perth</span>
        <button className="site-header__filter-toggle" type="button">
          Search
        </button>
        <button className="site-header__menu-button" type="button">
          Menu
        </button>
      </SiteHeaderActions>
    );

    const iconGroupIndex = html.indexOf("site-header__action-icons");
    const locationIndex = html.indexOf("site-header__location");
    const searchIndex = html.indexOf("site-header__filter-toggle");
    const menuIndex = html.indexOf("site-header__menu-button");

    expect(iconGroupIndex).toBeGreaterThan(-1);
    expect(locationIndex).toBeGreaterThan(iconGroupIndex);
    expect(searchIndex).toBeGreaterThan(locationIndex);
    expect(menuIndex).toBeGreaterThan(searchIndex);
    expect(html).not.toContain("site-header__profile");
    expect(html).not.toContain("site-header__action-secondary");
  });

  it("can hide the main profile control", () => {
    const html = renderWithMantine(<SiteHeaderActions showProfile={false} />);

    expect(html).toContain("site-header__action-icons");
    expect(html).not.toContain("site-header__profile");
    expect(html).not.toContain('aria-label="Open account information"');
  });

  it("renders the account coming-soon modal content when opened", () => {
    const html = renderWithMantine(
      <AccountComingSoonModal onClose={() => {}} opened withinPortal={false} />
    );

    expect(html).toContain("Accounts are coming soon");
    expect(html).toContain(
      "Once accounts are available, you&#x27;ll be able to save your favourite bands and venues and receive notifications for gigs you care about."
    );
    expect(html).toContain("Got it");
    expect(html).toContain("account-modal__action");
  });
});
