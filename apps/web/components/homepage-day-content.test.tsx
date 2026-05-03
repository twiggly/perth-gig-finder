import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { theme } from "@/app/theme";
import type { HomepageDayPayload } from "@/lib/homepage-day-loading";
import type { GigCardRecord } from "@/lib/gigs";
import type { DayBrowserPaneState } from "./use-homepage-day-navigation";

import { HomepageDayContent } from "./homepage-day-content";

function createGig(
  overrides: Partial<GigCardRecord> = {}
): GigCardRecord {
  return {
    id: "gig-1",
    slug: "gig-1",
    title: "ALT//THURSDAYS",
    starts_at: "2026-04-29T10:30:00.000Z",
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
    venue_website_url: "https://www.williamstreetbird.com/",
    status: "active",
    ...overrides
  };
}

function createDay(
  overrides: Partial<HomepageDayPayload> = {}
): HomepageDayPayload {
  return {
    dateKey: "2026-04-29",
    heading: "Wed, Apr 29th",
    items: [createGig()],
    ...overrides
  };
}

function renderContent({
  days = [createDay()],
  isContentAnimating = false,
  openGigId = null,
  renderedContentPanes = [
    {
      dateKey: "2026-04-29",
      motionRole: "active",
      phase: null
    }
  ],
  transitionDirection
}: {
  days?: HomepageDayPayload[];
  isContentAnimating?: boolean;
  openGigId?: string | null;
  renderedContentPanes?: DayBrowserPaneState[];
  transitionDirection?: "next" | "previous";
} = {}) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <HomepageDayContent
        contentViewportStyle={{
          "--day-browser-content-distance": "36px"
        } as React.CSSProperties}
        isContentAnimating={isContentAnimating}
        loadedDayMap={new Map(days.map((day) => [day.dateKey, day]))}
        onCloseGig={() => {}}
        onToggleGig={() => {}}
        openGigId={openGigId}
        renderedContentPanes={renderedContentPanes}
        transitionDirection={transitionDirection}
      />
    </MantineProvider>
  );
}

describe("HomepageDayContent", () => {
  it("renders gigs for the active loaded day", () => {
    const html = renderContent();

    expect(html).toContain("day-browser__content-viewport");
    expect(html).toContain("day-browser__content-track");
    expect(html).toContain('data-date="2026-04-29"');
    expect(html).toContain("ALT//THURSDAYS");
  });

  it("renders no pane content when a pane day is not loaded", () => {
    const html = renderContent({
      renderedContentPanes: [
        {
          dateKey: "2026-04-30",
          motionRole: "active",
          phase: null
        }
      ]
    });

    expect(html).not.toContain("day-browser__content-pane");
    expect(html).not.toContain("ALT//THURSDAYS");
  });

  it("preserves transition pane attributes and track direction", () => {
    const html = renderContent({
      days: [
        createDay(),
        createDay({
          dateKey: "2026-04-30",
          heading: "Thu, Apr 30th",
          items: [
            createGig({
              id: "gig-2",
              title: "Tomorrow's Show"
            })
          ]
        })
      ],
      isContentAnimating: true,
      renderedContentPanes: [
        {
          dateKey: "2026-04-29",
          motionRole: "from",
          phase: "animating"
        },
        {
          dateKey: "2026-04-30",
          motionRole: "to",
          phase: "animating"
        }
      ],
      transitionDirection: "next"
    });

    expect(html).toContain('data-animating="true"');
    expect(html).toContain('data-direction="next"');
    expect(html).toContain('data-motion-role="from"');
    expect(html).toContain('data-motion-role="to"');
    expect(html).toContain('data-phase="animating"');
    expect(html).toContain("Tomorrow&#x27;s Show");
  });

  it("passes the open gig id through to the matching gig card", () => {
    const html = renderContent({
      openGigId: "gig-1"
    });

    expect(html).toContain("gig-card--open");
    expect(html).toContain("gig-card__popover");
    expect(html).toContain("Buy tickets");
    expect(html).toContain("Listing @ The Bird");
  });
});
