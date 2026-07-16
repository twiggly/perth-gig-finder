import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { theme } from "@/app/theme";
import type { DateGroup } from "@/lib/homepage-dates";
import type { GigCardRecord } from "@/lib/gigs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/"
}));

const homepageDayBrowserMockState = vi.hoisted(() => ({
  isDateHeaderStuck: false,
  isStickyScrollRestorationVisualHoldActive: false,
  stickyScrollRestorationCoverRect: null as {
    columnGap: string;
    gridTemplateColumns: string;
    height: number;
    left: number;
    paddingBottom: string;
    paddingLeft: string;
    paddingRight: string;
    paddingTop: string;
    top: number;
    width: number;
  } | null,
  stickyScrollRestorationPhase: null as
    | "arming"
    | "scrolling"
    | "confirming"
    | null
}));

vi.mock("./use-homepage-day-scroll-restoration", () => ({
  useHomepageDayScrollRestoration: () => ({
    captureDateChangeLayout: () => {},
    clearDateChangeLayout: () => {},
    isStickyScrollRestorationVisualHoldActive:
      homepageDayBrowserMockState.isStickyScrollRestorationVisualHoldActive,
    stickyScrollRestorationCoverRect:
      homepageDayBrowserMockState.stickyScrollRestorationCoverRect,
    stickyScrollRestorationPhase:
      homepageDayBrowserMockState.stickyScrollRestorationPhase,
    scrollAlignmentDateKey: null,
    scrollAlignmentOffset: 0,
    scrollCarryoverDateKey: null,
    scrollCarryoverReserve: 0,
    scrollOutgoingCompensationDateKey: null,
    scrollOutgoingCompensationOffset: 0,
    scrollRestorationAlignmentDateKey: null,
    scrollReserveHeight: 0,
    scrollReserveTargetDateKey: null
  })
}));

vi.mock("./use-homepage-day-sticky-header", () => ({
  useHomepageDayStickyHeader: () => ({
    isDateHeaderStuck: homepageDayBrowserMockState.isDateHeaderStuck,
    stickySentinelRef: { current: null }
  })
}));

import { HomepageDayBrowser } from "./homepage-day-browser";

function createGig(
  overrides: Partial<GigCardRecord> = {}
): GigCardRecord {
  return {
    id: "gig-1",
    slug: "gig-1",
    title: "ALT//THURSDAYS",
    starts_at: "2026-04-29T10:30:00.000Z",
    ends_at: null,
    artist_names: ["Melanija"],
    image_path: null,
    source_image_url: null,
    image_width: null,
    image_height: null,
    image_version: null,
    ticket_url: "https://tickets.example.com",
    tixel_url: null,
    source_url: "https://source.example.com/gig-1",
    source_name: "Source",
    venue_slug: "venue",
    venue_name: "Venue",
    venue_suburb: "Northbridge",
    venue_address: "1 Example Street, Northbridge WA 6003",
    venue_website_url: "https://venue.example.com/",
    status: "active",
    ...overrides
  };
}

function renderBrowser(days: Array<DateGroup<GigCardRecord>>) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <HomepageDayBrowser
        availableDays={days.map((day) => ({
          dateKey: day.dateKey,
          heading: day.heading
        }))}
        currentQuery=""
        initialActiveDateKey={days[0]?.dateKey ?? "2026-04-29"}
        initialDays={
          days.length > 0
            ? days
            : [
                {
                  dateKey: "2026-04-29",
                  heading: "Wed, Apr 29th",
                  items: []
                }
              ]
        }
        selectedVenueSlugs={[]}
      />
    </MantineProvider>
  );
}

describe("HomepageDayBrowser", () => {
  beforeEach(() => {
    homepageDayBrowserMockState.isDateHeaderStuck = false;
    homepageDayBrowserMockState.isStickyScrollRestorationVisualHoldActive = false;
    homepageDayBrowserMockState.stickyScrollRestorationCoverRect = null;
    homepageDayBrowserMockState.stickyScrollRestorationPhase = null;
  });

  it("renders the date heading as a calendar trigger", () => {
    const html = renderBrowser([
      {
        dateKey: "2026-04-29",
        heading: "Wed, Apr 29th",
        items: [createGig()]
      }
    ]);

    expect(html).toContain("Choose date, currently Wed, Apr 29th");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("day-browser__header");
    expect(html).not.toContain("day-browser__header-shell");
    expect(html).toContain("day-browser__heading-button");
    expect(html).toContain("Wed, Apr 29th");
    expect(html).not.toContain('data-stuck="true"');
    expect(html).not.toContain("day-browser__header-cover");
  });

  it("renders filled Phosphor icons for adjacent date navigation", () => {
    const html = renderBrowser([
      {
        dateKey: "2026-04-29",
        heading: "Wed, Apr 29th",
        items: [createGig()]
      },
      {
        dateKey: "2026-04-30",
        heading: "Thu, Apr 30th",
        items: []
      }
    ]);

    expect(html).toContain('aria-label="Previous date"');
    expect(html).toContain('aria-label="Next date"');
    expect(html).toContain("day-browser__skip-track-icon--previous");
    expect(html).toContain("day-browser__skip-track-icon--next");
    const icons =
      html.match(/<svg[^>]*day-browser__skip-track-icon[\s\S]*?<\/svg>/g) ?? [];
    const buttonTags = html.match(/<button[^>]+>/g) ?? [];
    const previousButton = buttonTags.find((button) =>
      button.includes('aria-label="Previous date"')
    );
    const nextButton = buttonTags.find((button) =>
      button.includes('aria-label="Next date"')
    );

    expect(icons).toHaveLength(2);
    expect(previousButton).toContain('data-date-unavailable="true"');
    expect(nextButton).not.toContain("data-date-unavailable");
    for (const icon of icons) {
      expect(icon).toContain('fill="currentColor"');
    }
    expect(html).toContain('transform="translate(256 0) scale(-1 1)"');
    expect(html).not.toContain("&lt;");
    expect(html).not.toContain("&gt;");
  });

  it("renders an independent cover while sticky scroll restoration is holding", () => {
    homepageDayBrowserMockState.isDateHeaderStuck = false;
    homepageDayBrowserMockState.isStickyScrollRestorationVisualHoldActive = true;
    homepageDayBrowserMockState.stickyScrollRestorationCoverRect = {
      columnGap: "12px",
      gridTemplateColumns: "48px 240px 48px",
      height: 66,
      left: 12,
      paddingBottom: "7px",
      paddingLeft: "8px",
      paddingRight: "8px",
      paddingTop: "7px",
      top: 0,
      width: 360
    };
    homepageDayBrowserMockState.stickyScrollRestorationPhase = "arming";

    const html = renderBrowser([
      {
        dateKey: "2026-04-29",
        heading: "Wed, Apr 29th",
        items: [createGig()]
      }
    ]);

    expect(html).not.toContain('data-stuck="true"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("day-browser__header-cover");
    expect(html).toContain('data-sticky-restoration-phase="arming"');
    expect(html).toContain("left:12px");
    expect(html).toContain("width:360px");
    expect(html).toContain("height:66px");
    expect(html).toContain("padding-left:8px");
    expect(html).toContain("grid-template-columns:48px 240px 48px");
  });

  it.each(["arming", "scrolling", "confirming"] as const)(
    "renders a non-interactive visual cover during %s restoration",
    (phase) => {
      homepageDayBrowserMockState.isStickyScrollRestorationVisualHoldActive =
        true;
      homepageDayBrowserMockState.stickyScrollRestorationPhase = phase;

      const html = renderBrowser([
        {
          dateKey: "2026-04-29",
          heading: "Wed, Apr 29th",
          items: [createGig()]
        }
      ]);

      expect(html).toContain("day-browser__header-cover");
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain(`data-sticky-restoration-phase="${phase}"`);
      expect(html).toContain("day-browser__header-cover-arrow");
      expect(html).not.toContain("day-browser__header-shell");
    }
  );

  it("renders the header as stuck from raw sticky state without restoration styling", () => {
    homepageDayBrowserMockState.isDateHeaderStuck = true;
    homepageDayBrowserMockState.isStickyScrollRestorationVisualHoldActive = false;

    const html = renderBrowser([
      {
        dateKey: "2026-04-29",
        heading: "Wed, Apr 29th",
        items: [createGig()]
      }
    ]);

    expect(html).toContain('data-stuck="true"');
    expect(html).not.toContain("day-browser__header-cover");
  });

  it("renders only the active day even when adjacent days are seeded", () => {
    const html = renderBrowser([
      {
        dateKey: "2026-04-29",
        heading: "Wed, Apr 29th",
        items: [createGig()]
      },
      {
        dateKey: "2026-04-30",
        heading: "Thu, Apr 30th",
        items: [
          createGig({
            id: "gig-2",
            title: "Tomorrow's Show"
          })
        ]
      }
    ]);

    expect(html).toContain("ALT//THURSDAYS");
    expect(html).not.toContain("Tomorrow&#x27;s Show");
  });
});
