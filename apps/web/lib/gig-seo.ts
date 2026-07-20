import type { Metadata } from "next";
import type { GigStatus } from "@perth-gig-finder/shared";

import { formatGigCardArtists } from "./gig-card-artists";
import {
  getGigDisplayState,
  getGigDisplayStateLabel
} from "./gig-archive";
import { getRenderableGigImage, type GigCardRecord } from "./gigs";
import { serializeJsonLd } from "./json-ld";
import {
  buildGigDetailPath,
  buildGigDetailUrl,
  SITE_LOGO_HEIGHT,
  SITE_LOGO_PATH,
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
  const image = getRenderableGigImage(gig);

  if (image) {
    return {
      height: image.height,
      url: image.url,
      width: image.width
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

export function buildGigFactSummary(
  gig: GigCardRecord,
  now = new Date()
): string {
  const state = getGigDisplayState(gig, now);
  const artistLine = formatGigCardArtists(gig.title, gig.artist_names);
  const venueLine = [gig.venue_name, gig.venue_suburb].filter(Boolean).join(", ");
  const dateLine = formatPerthDateTime(gig.starts_at);
  const timingPhrase =
    state === "past"
      ? `took place on ${dateLine}`
      : state === "cancelled" || state === "postponed"
        ? `was scheduled for ${dateLine}`
        : `is scheduled for ${dateLine}`;
  const statusLabel = getGigDisplayStateLabel(state);

  return [
    statusLabel ? `${statusLabel}.` : null,
    `${gig.title} ${timingPhrase} at ${venueLine}.`,
    artistLine ? `Lineup: ${artistLine}.` : null
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

export function buildGigEventStructuredData(
  gig: GigCardRecord,
  now = new Date()
) {
  if (!gig.venue_address?.trim() || !gig.venue_name.trim()) {
    return null;
  }

  const image = getRenderableGigImage(gig);
  const realImage = image && !image.isPlaceholder ? image : null;
  const detailUrl = buildGigDetailUrl(gig.slug);
  const isActiveFuture =
    getGigDisplayState(gig, now) === "active" &&
    new Date(gig.starts_at).getTime() > now.getTime();
  const event: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@id": `${detailUrl}#event`,
    "@type": "MusicEvent",
    description: buildGigFactSummary(gig, now),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: getSchemaEventStatus(gig.status),
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
    mainEntityOfPage: detailUrl,
    name: gig.title,
    startDate: formatPerthIsoWithOffset(gig.starts_at),
    url: detailUrl
  };

  if (realImage) {
    event.image = [getAbsoluteUrl(realImage.url)];
  }

  if (gig.ends_at) {
    event.endDate = formatPerthIsoWithOffset(gig.ends_at);
  }

  if (gig.artist_names.length > 0) {
    event.performer = gig.artist_names.map((artistName) => ({
      "@type": "MusicGroup",
      name: artistName
    }));
  }

  if (isActiveFuture && gig.ticket_url) {
    event.offers = {
      "@type": "Offer",
      url: gig.ticket_url
    };
  }

  return event;
}

export function buildGigEventStructuredDataJson(
  gig: GigCardRecord,
  now = new Date()
): string | null {
  const event = buildGigEventStructuredData(gig, now);
  return event ? serializeJsonLd(event) : null;
}
