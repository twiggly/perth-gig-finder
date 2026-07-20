import React from "react";
import Link from "next/link";

import { formatGigCardArtists } from "@/lib/gig-card-artists";
import {
  getGigDisplayState,
  getGigDisplayStateLabel
} from "@/lib/gig-archive";
import type { GigCardRecord } from "@/lib/gigs";
import { groupItemsByPerthDate } from "@/lib/homepage-dates";
import { buildGigDetailPath } from "@/lib/seo";

const PERTH_TIME_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Perth"
});

export function GigDiscoveryList({
  gigs,
  now = new Date()
}: {
  gigs: GigCardRecord[];
  now?: Date;
}) {
  const groups = groupItemsByPerthDate(gigs);

  return (
    <div className="discovery-gig-groups">
      {groups.map((group) => (
        <section className="discovery-gig-group" key={group.dateKey}>
          <h2>{group.heading}</h2>
          <ol className="discovery-gig-list">
            {group.items.map((gig) => {
              const artistLine = formatGigCardArtists(
                gig.title,
                gig.artist_names
              );
              const stateLabel = getGigDisplayStateLabel(
                getGigDisplayState(gig, now)
              );

              return (
                <li key={gig.id}>
                  <article className="discovery-gig-card">
                    <p className="discovery-gig-card__time">
                      {PERTH_TIME_FORMATTER.format(new Date(gig.starts_at))}
                    </p>
                    <h3>
                      <Link href={buildGigDetailPath(gig.slug)}>{gig.title}</Link>
                    </h3>
                    {artistLine ? <p>{artistLine}</p> : null}
                    <p>
                      <Link href={`/venues/${encodeURIComponent(gig.venue_slug)}`}>
                        {gig.venue_name}
                      </Link>
                      {gig.venue_suburb ? `, ${gig.venue_suburb}` : null}
                    </p>
                    {stateLabel ? (
                      <p className="discovery-gig-card__status">{stateLabel}</p>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
