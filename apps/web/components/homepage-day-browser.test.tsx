import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { theme } from "@/app/theme";
import type { DateGroup } from "@/lib/homepage-dates";
import type { GigCardRecord } from "@/lib/gigs";

const scrollRestorationMockState = vi.hoisted(() => ({
  isStickyScrollRestorationVisualHoldActive: false
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/"
}));

vi.mock("./use-homepage-day-scroll-restoration", () => ({
  useHomepageDayScrollRestoration: () => ({
    captureDateChangeLayout: () => {},
    clearDateChangeLayout: () => {},
    isStickyScrollRestorationVisualHoldActive:
      scrollRestorationMockState.isStickyScrollRestorationVisualHoldActive,
    scrollAlignmentDateKey: null,
    scrollAlignmentOffset: 0,
    scrollCarryoverDateKey: null,
    scrollCarryoverReserve: 0,
    scrollOutgoingCompensationDateKey: null,
    scrollOutgoingCompensationOffset: 0,
    scrollReserveHeight: 0,
    scrollReserveTargetDateKey: null
  })
}));

import {
  HomepageDayBrowser,
  shouldRenderHomepageDateHeaderStuck
} from "./homepage-day-browser";

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
    source_url: "https://source.example.com/gig-1",
    source_name: "The Bird",
    venue_slug: "the-bird",
    venue_name: "The Bird",
    venue_suburb: "Northbridge",
    venue_address: "181 William Street, Northbridge WA 6003",
    venue_website_url: "https://www.williamstreetbird.com/",
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
    scrollRestorationMockState.isStickyScrollRestorationVisualHoldActive = false;
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
    expect(html).toContain("day-browser__header-shell");
    expect(html).toContain("day-browser__heading-button");
    expect(html).toContain("Wed, Apr 29th");
  });

  it("keeps the date header visually stuck while sticky scroll restoration is active", () => {
    scrollRestorationMockState.isStickyScrollRestorationVisualHoldActive = true;

    const html = renderBrowser([
      {
        dateKey: "2026-04-29",
        heading: "Wed, Apr 29th",
        items: [createGig()]
      }
    ]);

    expect(html).toContain('data-sticky-restoring="true"');
    expect(html).toContain('data-stuck="true"');
  });

  it("keeps the date header visually stuck during sticky-start transition handoff", () => {
    expect(
      shouldRenderHomepageDateHeaderStuck({
        isDateHeaderVisuallyStuck: false,
        isStickyScrollRestorationVisualHoldActive: false,
        isStickyStartedTransitionActive: true
      })
    ).toBe(true);
  });

  it("does not force stuck styling when no sticky hold source is active", () => {
    expect(
      shouldRenderHomepageDateHeaderStuck({
        isDateHeaderVisuallyStuck: false,
        isStickyScrollRestorationVisualHoldActive: false,
        isStickyStartedTransitionActive: false
      })
    ).toBe(false);
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
