import type { Metadata } from "next";
import type { GigStatus } from "@perth-gig-finder/shared";

import { formatGigCardArtists } from "./gig-card-artists";
import { getRenderableGigImageUrl, type GigCardRecord } from "./gigs";
import {
  buildGigDetailPath,
  buildGigDetailUrl,
  SITE_LOGO_HEIGHT,
  SITE_LOGO_PATH,
  SITE_LOGO_URL,
  SITE_LOGO_WIDTH,
  SITE_TITLE,
  SITE_URL
} from "./seo";

const PERTH_TIME_ZONE = "Australia/Perth";
const PERTH_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: PERTH_TIME_ZONE
});

const PERTH_ISO_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: PERTH_TIME_ZONE,
  year: "numeric"
});

function getPerthDateTimeParts(value: string): Record<string, string> {
  return PERTH_ISO_PARTS_FORMATTER.formatToParts(new Date(value)).reduce<
    Record<string, string>
  >((parts, part) => {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }

    return parts;
  }, {});
}

function getAbsoluteUrl(value: string): string {
  return value.startsWith("http") ? value : `${SITE_URL}${value}`;
}

function getGigMetadataImage(gig: GigCardRecord): {
  height: number;
  url: string;
  width: number;
} {
  const imageUrl = getRenderableGigImageUrl(gig);

  if (imageUrl) {
    return {
      height: gig.image_height ?? SITE_LOGO_HEIGHT,
      url: imageUrl,
      width: gig.image_width ?? SITE_LOGO_WIDTH
    };
  }

  return {
    height: SITE_LOGO_HEIGHT,
    url: SITE_LOGO_PATH,
    width: SITE_LOGO_WIDTH
  };
}

function getSchemaEventStatus(status: GigStatus): string {
  if (status === "cancelled") {
    return "https://schema.org/EventCancelled";
  }

  if (status === "postponed") {
    return "https://schema.org/EventPostponed";
  }

  return "https://schema.org/EventScheduled";
}

export function formatPerthDateTime(value: string): string {
  return PERTH_DATE_TIME_FORMATTER.format(new Date(value));
}

export function formatPerthIsoWithOffset(value: string): string {
  const parts = getPerthDateTimeParts(value);

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

export function buildGigMetadataDescription(gig: GigCardRecord): string {
  const artistLine = formatGigCardArtists(gig.title, gig.artist_names);
  const venueLine = [gig.venue_name, gig.venue_suburb].filter(Boolean).join(", ");
  const dateLine = formatPerthDateTime(gig.starts_at);

  return [
    gig.title,
    artistLine ? `with ${artistLine}` : null,
    `at ${venueLine}`,
    `on ${dateLine}.`
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildGigMetadata(gig: GigCardRecord): Metadata {
  const title = `${gig.title} | ${SITE_TITLE}`;
  const description = buildGigMetadataDescription(gig);
  const image = getGigMetadataImage(gig);

  return {
    alternates: {
      canonical: buildGigDetailPath(gig.slug)
    },
    description,
    openGraph: {
      description,
      images: [
        {
          alt: `${gig.title} poster`,
          height: image.height,
          url: image.url,
          width: image.width
        }
      ],
      title,
      type: "article",
      url: buildGigDetailPath(gig.slug)
    },
    title,
    twitter: {
      card: image.url === SITE_LOGO_PATH ? "summary" : "summary_large_image",
      description,
      images: [image.url],
      title
    }
  };
}

export function buildGigEventStructuredData(gig: GigCardRecord) {
  const imageUrl = getRenderableGigImageUrl(gig);
  const event: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    description: buildGigMetadataDescription(gig),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: getSchemaEventStatus(gig.status),
    image: [imageUrl ? getAbsoluteUrl(imageUrl) : SITE_LOGO_URL],
    location: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressCountry: "AU",
        addressLocality: gig.venue_suburb ?? undefined,
        addressRegion: "WA",
        streetAddress: gig.venue_address ?? undefined
      },
      name: gig.venue_name
    },
    name: gig.title,
    startDate: formatPerthIsoWithOffset(gig.starts_at),
    url: buildGigDetailUrl(gig.slug)
  };

  if (gig.ends_at) {
    event.endDate = formatPerthIsoWithOffset(gig.ends_at);
  }

  if (gig.artist_names.length > 0) {
    event.performer = gig.artist_names.map((artistName) => ({
      "@type": "MusicGroup",
      name: artistName
    }));
  }

  if (gig.ticket_url) {
    event.offers = {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      url: gig.ticket_url
    };
  }

  return event;
}

export function buildGigEventStructuredDataJson(gig: GigCardRecord): string {
  return JSON.stringify(buildGigEventStructuredData(gig));
}
