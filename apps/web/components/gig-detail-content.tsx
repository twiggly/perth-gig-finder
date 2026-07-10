import React from "react";
import Image from "next/image";

import { GigDetailBackLink } from "@/components/gig-detail-back-link";
import { GigDetailShareButton } from "@/components/gig-detail-share-button";
import { getGigActions } from "@/lib/gig-actions";
import { formatGigCardArtists } from "@/lib/gig-card-artists";
import { buildGigDetailFallbackHref } from "@/lib/gig-detail-return";
import {
  getRenderableGigImage,
  type GigCardRecord
} from "@/lib/gigs";
import { formatPerthDateTime } from "@/lib/gig-seo";

const GIG_DETAIL_IMAGE_SIZES = "(max-width: 720px) 93vw, 14rem";
const GIG_DETAIL_IMAGE_QUALITY = 72;

function VenueMapIcon() {
  return (
    <svg
      aria-hidden="true"
      className="gig-detail__venue-icon"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        clipRule="evenodd"
        d="M12 2a7 7 0 0 0-7 7c0 5.86 7 12 7 12s7-6.14 7-12a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

function cleanDisplayVenueAddress(address: string, suburb: string | null): string {
  const withoutCountry = address
    .replace(/,\s*Australia\s*$/i, "")
    .trim();
  const addressParts = withoutCountry
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (addressParts.length > 1 && /^\d/.test(addressParts[1] ?? "")) {
    addressParts.shift();
  }

  const cleanedAddress = addressParts.join(", ");
  const trimmedSuburb = suburb?.trim();

  if (!cleanedAddress) {
    return trimmedSuburb ?? "";
  }

  if (
    trimmedSuburb &&
    !cleanedAddress.toLowerCase().includes(trimmedSuburb.toLowerCase())
  ) {
    return `${cleanedAddress}, ${trimmedSuburb}`;
  }

  return cleanedAddress;
}

function doesAddressStartWithVenueName(
  venueName: string,
  address: string
): boolean {
  const normalizedVenueName = venueName.trim().toLowerCase();
  const normalizedAddress = address.trim().toLowerCase();

  return (
    normalizedAddress === normalizedVenueName ||
    normalizedAddress.startsWith(`${normalizedVenueName},`)
  );
}

function VenueLine({ gig }: { gig: GigCardRecord }) {
  const venueAddress = gig.venue_address
    ? cleanDisplayVenueAddress(gig.venue_address, gig.venue_suburb)
    : null;
  const addressIncludesVenueName = venueAddress
    ? doesAddressStartWithVenueName(gig.venue_name, venueAddress)
    : false;
  const venueLine = venueAddress
    ? addressIncludesVenueName
      ? venueAddress
      : `${gig.venue_name},`
    : [gig.venue_name, gig.venue_suburb].filter(Boolean).join(", ");
  const addressLine =
    venueAddress && !addressIncludesVenueName ? venueAddress : null;

  return (
    <div className="gig-detail__venue">
      <VenueMapIcon />
      <div className="gig-detail__venue-text">
        <p>{venueLine}</p>
        {addressLine ? <p>{addressLine}</p> : null}
      </div>
    </div>
  );
}

export function GigDetailContent({ gig }: { gig: GigCardRecord }) {
  const actions = getGigActions(gig);
  const artistLine = formatGigCardArtists(gig.title, gig.artist_names);
  const image = getRenderableGigImage(gig);
  const fallbackHref = buildGigDetailFallbackHref(gig.starts_at);
  const panelClassName = [
    "gig-detail__panel",
    image
      ? "gig-detail__panel--with-media"
      : "gig-detail__panel--no-media"
  ].join(" ");

  return (
    <article className="gig-detail">
      <div className={panelClassName}>
        {image ? (
          <div className="gig-detail__media">
            <Image
              alt={`${gig.title} poster`}
              className="gig-detail__image"
              height={image.height}
              priority
              quality={GIG_DETAIL_IMAGE_QUALITY}
              sizes={GIG_DETAIL_IMAGE_SIZES}
              src={image.url}
              style={{ height: "auto", width: "100%" }}
              width={image.width}
            />
          </div>
        ) : null}
        <div className="gig-detail__body">
          <p className="gig-card__time gig-detail__time">
            {formatPerthDateTime(gig.starts_at)}
          </p>
          <h1 className="gig-detail__title">{gig.title}</h1>
          {artistLine ? (
            <p className="gig-detail__artists">{artistLine}</p>
          ) : null}
          <VenueLine gig={gig} />
          {actions.length > 0 ? (
            <nav aria-label={`${gig.title} links`} className="gig-detail__actions">
              {actions.map((action) => (
                <a
                  className="gig-card__action gig-detail__action"
                  href={action.href}
                  key={action.key}
                  rel="noreferrer"
                  target="_blank"
                >
                  {action.label}
                </a>
              ))}
            </nav>
          ) : null}
        </div>
      </div>
      <div className="gig-detail__toolbar">
        <GigDetailBackLink fallbackHref={fallbackHref} slug={gig.slug} />
        <GigDetailShareButton slug={gig.slug} title={gig.title} />
      </div>
    </article>
  );
}
