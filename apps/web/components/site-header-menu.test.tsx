import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteHeaderMenu, getHeaderMenuButtonStates } from "./site-header-menu";

function renderMenu(initialHeaderMenuState?: "closed" | "open" | "closing") {
  return renderToStaticMarkup(
    <SiteHeaderMenu initialHeaderMenuState={initialHeaderMenuState} />
  );
}

describe("SiteHeaderMenu", () => {
  it("derives stable menu button and overlay states", () => {
    expect(getHeaderMenuButtonStates("closed")).toEqual({
      ariaOpen: false,
      iconState: "closed",
      isOverlayMounted: false,
      surfaceState: "closed"
    });
    expect(getHeaderMenuButtonStates("open")).toEqual({
      ariaOpen: true,
      iconState: "open",
      isOverlayMounted: true,
      surfaceState: "open"
    });
    expect(getHeaderMenuButtonStates("closing")).toEqual({
      ariaOpen: false,
      iconState: "closed",
      isOverlayMounted: true,
      surfaceState: "open"
    });
  });

  it("renders the closed menu button and hidden overlay", () => {
    const html = renderMenu();
    const menuButton = html.match(
      /<button[^>]*class="[^"]*site-header__menu-button[^"]*"[^>]*>/
    )?.[0];
    const overlay = html.match(
      /<div[^>]*class="site-header__menu-overlay"[^>]*>/
    )?.[0];

    expect(menuButton).toContain('aria-label="Open account menu"');
    expect(menuButton).toContain('aria-expanded="false"');
    expect(menuButton).toContain('data-state="closed"');
    expect(menuButton).toContain('data-surface-state="closed"');
    expect(html).toContain("site-header__menu-icon--lines");
    expect(html).toContain("site-header__menu-icon--close");
    expect(overlay).toContain('aria-hidden="true"');
    expect(overlay).toContain('data-state="closed"');
    expect(overlay).toContain('hidden=""');
  });

  it("renders the menu overlay content and construction markers", () => {
    const html = renderMenu("open");
    const menuButton = html.match(
      /<button[^>]*class="[^"]*site-header__menu-button[^"]*"[^>]*>/
    )?.[0];
    const overlay = html.match(
      /<div[^>]*class="site-header__menu-overlay"[^>]*>/
    )?.[0];
    const markerMatches = html.match(/site-header__menu-item-marker/g) ?? [];

    expect(menuButton).toContain('aria-label="Close account menu"');
    expect(menuButton).toContain('aria-expanded="true"');
    expect(menuButton).toContain('data-state="open"');
    expect(menuButton).toContain('data-surface-state="open"');
    expect(overlay).toContain('aria-hidden="false"');
    expect(overlay).toContain('data-state="open"');
    expect(overlay).not.toContain('hidden=""');
    expect(html).toContain("Account");
    expect(html).toContain("Log in");
    expect(html).toContain("Sign up");
    expect(html).toContain("Resources");
    expect(html).toContain("About");
    expect(html).toContain("Contact");
    expect(markerMatches).toHaveLength(4);
  });

  it("keeps the surface active during the closing overlay fade", () => {
    const html = renderMenu("closing");
    const menuButton = html.match(
      /<button[^>]*class="[^"]*site-header__menu-button[^"]*"[^>]*>/
    )?.[0];
    const overlay = html.match(
      /<div[^>]*class="site-header__menu-overlay"[^>]*>/
    )?.[0];

    expect(menuButton).toContain('aria-label="Open account menu"');
    expect(menuButton).toContain('aria-expanded="false"');
    expect(menuButton).toContain('data-state="closed"');
    expect(menuButton).toContain('data-surface-state="open"');
    expect(overlay).toContain('aria-hidden="true"');
    expect(overlay).toContain('data-state="closing"');
    expect(overlay).not.toContain('hidden=""');
  });
});
