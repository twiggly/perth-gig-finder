import { HomepageFilters } from "@/components/homepage-filters";
import { HomepageDayBrowser } from "@/components/homepage-day-browser";
import {
  groupItemsByPerthDate,
  resolveActiveDateKey
} from "@/lib/homepage-dates";
import { parseHomepageFilters } from "@/lib/homepage-filters";
import { listUpcomingGigs } from "@/lib/gigs";
import { isSupabaseConfigured } from "@/lib/supabase";
import { listSelectedVenues } from "@/lib/venues";

export const dynamic = "force-dynamic";

interface HomePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const filters = parseHomepageFilters((await searchParams) ?? {});

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero__eyebrow">Perth live music, cleaned up</div>
        <h1>Perth Gig Finder</h1>
        <p>
          One list of upcoming Perth gigs, sourced from venue pages and normalized
          into a single local database.
        </p>
      </section>
      {isSupabaseConfigured() ? (
        <ConfiguredHomepage filters={filters} />
      ) : (
        <section className="empty-state">
          <p>Local Supabase credentials are not configured yet.</p>
          <p>
            Start Supabase, copy the local keys from <code>supabase status</code>,
            and add them to <code>apps/web/.env.local</code>.
          </p>
        </section>
      )}
    </main>
  );
}

async function ConfiguredHomepage({
  filters
}: {
  filters: ReturnType<typeof parseHomepageFilters>;
}) {
  const [gigs, selectedVenues] = await Promise.all([
    listUpcomingGigs(filters),
    listSelectedVenues(filters.venueSlugs)
  ]);
  const hasActiveFilters =
    filters.q.length > 0 ||
    filters.when !== "all" ||
    selectedVenues.length > 0;
  const groupedGigs = groupItemsByPerthDate(gigs);
  const availableDays = groupedGigs.map((group) => ({
    dateKey: group.dateKey,
    heading: group.heading
  }));
  const activeDateKey = resolveActiveDateKey(
    availableDays.map((day) => day.dateKey),
    filters.date
  );
  const dayBrowserKey = [filters.q, filters.when, filters.venueSlugs.join("|")].join("::");

  return (
    <>
      <HomepageFilters
        currentQuery={filters.q}
        currentWhen={filters.when}
        resultCount={gigs.length}
        selectedVenues={selectedVenues}
      />
      {gigs.length === 0 || !activeDateKey ? (
        <section className="empty-state">
          <p>
            {hasActiveFilters
              ? "No gigs match those filters right now."
              : "No upcoming gigs are loaded yet."}
          </p>
          <p>
            {hasActiveFilters
              ? "Try another venue, widen the date range, or clear the search."
              : "Run the scraper once and this page will fill with upcoming shows."}
          </p>
        </section>
      ) : (
        <HomepageDayBrowser
          days={groupedGigs}
          initialActiveDateKey={activeDateKey}
          key={dayBrowserKey}
        />
      )}
    </>
  );
}
