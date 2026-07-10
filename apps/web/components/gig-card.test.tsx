import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { theme } from "@/app/theme";
import type { GigCardRecord } from "@/lib/gigs";

import { GigCard } from "./gig-card";

vi.mock("next/image", async () => {
  const React = await import("react");

  return {
    getImageProps({
      quality = 75,
      src,
      width,
      ...imageProps
    }: React.ImgHTMLAttributes<HTMLImageElement> & {
      quality?: number;
      src: string;
    }) {
      const numericWidth = Number(width);
      const separator = src.includes("?") ? "&" : "?";
      const buildUrl = (targetWidth: number) =>
        `${src}${separator}w=${targetWidth}&q=${quality}`;

      return {
        props: {
          ...imageProps,
          decoding: "async" as const,
          src: buildUrl(numericWidth * 2),
          srcSet: `${buildUrl(numericWidth)} 1x, ${buildUrl(numericWidth * 2)} 2x`,
          width
        }
      };
    }
  };
});

function createGig(
  overrides: Partial<GigCardRecord> = {}
): GigCardRecord {
  return {
    id: "gig-1",
    slug: "gig-1",
    title: "ALT//THURSDAYS",
    starts_at: "2026-04-23T10:30:00.000Z",
    ends_at: null,
    artist_names: ["Melānija", "Esper", "softwarebodyIV"],
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

describe("GigCard", () => {
  it("renders the artist line between the title and venue when artists are present", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig()}
          isOpen={false}
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    const titleIndex = html.indexOf("gig-card__title");
    const timeIndex = html.indexOf("gig-card__time");
    const artistsIndex = html.indexOf("Melānija | Esper | softwarebodyIV");
    const venueIndex = html.indexOf("gig-card__venue");

    expect(html).toContain("ALT//THURSDAYS");
    expect(html).toContain('href="/gigs/gig-1"');
    expect(html).toContain("gig-card__detail-link");
    expect(html).toContain("gig-card__artists");
    expect(html).toContain("gig-card__venue-icon");
    expect(timeIndex).toBeGreaterThanOrEqual(0);
    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(timeIndex).toBeLessThan(titleIndex);
    expect(artistsIndex).toBeGreaterThan(titleIndex);
    expect(venueIndex).toBeGreaterThan(artistsIndex);
  });

  it("renders the venue name and multi-word suburb in separate spans", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig({
            venue_name: "Port Beach Brewery",
            venue_suburb: "North Fremantle"
          })}
          isOpen={false}
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    expect(html).toContain('class="gig-card__venue-name"');
    expect(html).toContain('class="gig-card__venue-suburb"');
    expect(html).toContain("Port Beach Brewery");
    expect(html).toContain("North Fremantle");
  });

  it("omits the artist line when it only repeats the title", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig({
            title: "Luude",
            artist_names: [" luude ", "LUUDE"]
          })}
          isOpen={false}
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    expect(html).not.toContain("gig-card__artists");
  });

  it("renders actionable cards with a separate row toggle control", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig()}
          isOpen={false}
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    expect(html).toContain("gig-card__toggle-overlay");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Open links for ALT//THURSDAYS"');
  });

  it("renders open action links inside the gig text column", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig()}
          isOpen
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    const contentIndex = html.indexOf("gig-card__content");
    const venueIndex = html.indexOf("gig-card__venue");
    const popoverIndex = html.indexOf("gig-card__popover");
    const firstActionIndex = html.indexOf("Buy tickets");

    expect(contentIndex).toBeGreaterThanOrEqual(0);
    expect(venueIndex).toBeGreaterThan(contentIndex);
    expect(popoverIndex).toBeGreaterThan(venueIndex);
    expect(firstActionIndex).toBeGreaterThan(popoverIndex);
  });

  it("marks a renderable poster as eager when requested", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig({
            image_height: 900,
            image_width: 600,
            source_image_url: "https://assets.oztix.com.au/poster.jpg"
          })}
          imageLoadingIntent="eager"
          isOpen={false}
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    const sourceTags = html.match(/<source [^>]+>/g) ?? [];
    const imageTag = html.match(/<img [^>]*gig-card__media-image[^>]*>/)?.[0];

    expect(html).toContain('<picture class="gig-card__picture">');
    expect(sourceTags).toHaveLength(2);
    expect(sourceTags[0]).toContain('media="(max-width: 480px)"');
    expect(sourceTags[0]).toContain("w=88");
    expect(sourceTags[0]).toContain("w=176");
    expect(sourceTags[0]).not.toContain("w=115");
    expect(sourceTags[1]).toContain('media="(max-width: 720px)"');
    expect(sourceTags[1]).toContain("w=115");
    expect(sourceTags[1]).toContain("w=230");
    expect(sourceTags[1]).not.toContain("w=336");
    expect(imageTag).toContain("w=168");
    expect(imageTag).toContain("w=336");
    expect(html).toContain("q=72");
    expect(html).not.toContain("w=640");
    expect(html).toContain("gig-card__media-image");
    expect(html).toContain('width="600"');
    expect(html).toContain('height="900"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('loading="eager"');
  });

  it("does not eagerly load a normal renderable poster", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig({
            image_height: 900,
            image_width: 600,
            source_image_url: "https://assets.oztix.com.au/poster.jpg"
          })}
          isOpen={false}
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    expect(html).toContain("gig-card__media-image");
    expect(html).not.toContain('loading="eager"');
    expect(html).toContain('loading="lazy"');
  });

  it("renders The Bird placeholder when a Bird gig has no poster", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig({
            image_height: null,
            image_width: null,
            source_image_url: null,
            venue_slug: "the-bird"
          })}
          isOpen={false}
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    expect(html).toContain("gig-card__media-image");
    expect(html).toContain('<picture class="gig-card__picture">');
    expect(html).toContain("/venue-placeholders/the-bird.png");
    expect(html).toContain("w=88");
    expect(html).toContain("w=336");
    expect(html).not.toContain("w=640");
    expect(html).toContain('width="1674"');
    expect(html).toContain('height="940"');
  });

  it("exposes the action count for one-action cards", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig({ venue_website_url: null })}
          isOpen
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    expect(html).toContain('data-action-count="1"');
    expect(html).toContain("Buy tickets");
    expect(html).not.toContain("Listing @");
  });

  it("exposes the action count for two-action cards", () => {
    const html = renderToStaticMarkup(
      <MantineProvider defaultColorScheme="dark" theme={theme}>
        <GigCard
          gig={createGig()}
          isOpen
          onClose={() => {}}
          onToggle={() => {}}
        />
      </MantineProvider>
    );

    expect(html).toContain('data-action-count="2"');
    expect(html).toContain("Buy tickets");
    expect(html).toContain("Listing @ The Bird");
  });
});
