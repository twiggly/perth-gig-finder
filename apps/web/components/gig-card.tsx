import Image from "next/image";

import { getGigImageUrl, type GigCardRecord } from "@/lib/gigs";

function formatGigDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Perth"
  }).format(new Date(value));
}

function formatVenueLine(gig: GigCardRecord): string {
  return gig.venue_suburb ? `${gig.venue_name}, ${gig.venue_suburb}` : gig.venue_name;
}

export function GigCard({ gig }: { gig: GigCardRecord }) {
  const imageUrl = getGigImageUrl(gig);
  const hasRenderableImage =
    Boolean(imageUrl) &&
    typeof gig.image_width === "number" &&
    gig.image_width > 0 &&
    typeof gig.image_height === "number" &&
    gig.image_height > 0;
  const imageWidth = hasRenderableImage ? gig.image_width! : undefined;
  const imageHeight = hasRenderableImage ? gig.image_height! : undefined;

  return (
    <article className="gig-card">
      <div className="gig-card__media">
        {hasRenderableImage && imageUrl ? (
          <Image
            alt={`${gig.title} poster`}
            className="gig-card__media-image"
            height={imageHeight}
            sizes="(max-width: 480px) 88px, (max-width: 720px) 115px, 168px"
            src={imageUrl}
            style={{ height: "auto", width: "100%" }}
            width={imageWidth}
          />
        ) : (
          <div aria-hidden="true" className="gig-card__media-fallback">
            <span>Perth Gig Finder</span>
          </div>
        )}
      </div>
      <div className="gig-card__body">
        <h2>{gig.title}</h2>
        <p className="gig-card__venue">{formatVenueLine(gig)}</p>
        <p className="gig-card__time">{formatGigDate(gig.starts_at)}</p>
        <a
          className="gig-card__link"
          href={gig.ticket_url ?? gig.source_url}
          rel="noreferrer"
          target="_blank"
        >
          View listing
        </a>
      </div>
    </article>
  );
}
