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
  it("renders theme and account controls", () => {
    const html = renderWithMantine(<SiteHeaderActions />);

    expect(html).toContain('aria-label="Switch to light mode"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Open account information"');
    expect(html).toContain('title="Account"');
    expect(html).toContain("site-header__profile");
  });

  it("renders the account coming-soon modal content when opened", () => {
    const html = renderWithMantine(
      <AccountComingSoonModal onClose={() => {}} opened withinPortal={false} />
    );

    expect(html).toContain("Accounts are coming soon");
    expect(html).toContain(
      "Once available, accounts will let you save your favourite bands and venues, and receive notifications about gigs you care about."
    );
    expect(html).toContain("Got it");
    expect(html).toContain("account-modal__action");
  });
});
