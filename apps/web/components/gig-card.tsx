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

  return (
    <article className="gig-card">
      <div className="gig-card__media">
        {imageUrl ? (
          <Image
            alt={`${gig.title} poster`}
            className="gig-card__media-image"
            fill
            sizes="(max-width: 720px) 9rem, 14rem"
            src={imageUrl}
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
