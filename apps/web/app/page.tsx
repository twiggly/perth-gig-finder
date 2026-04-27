import { HomepageFilters } from "@/components/homepage-filters";
import { HomepageDayBrowser } from "@/components/homepage-day-browser";
import { SiteHeaderActions } from "@/components/site-header-actions";
import { resolveHomepageDateKey } from "@/lib/homepage-dates";
import { parseHomepageFilters } from "@/lib/homepage-filters";
import { listAvailableGigDates, listGigsForDate } from "@/lib/gigs";
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
  const now = new Date();
  const [availableDays, selectedVenues] = await Promise.all([
    listAvailableGigDates(filters),
    listSelectedVenues(filters.venueSlugs)
  ]);
  const hasActiveFilters = filters.q.length > 0 || filters.venueSlugs.length > 0;
  const activeDateKey = resolveHomepageDateKey(
    availableDays.map((day) => day.dateKey),
    filters.date,
    filters.legacyWhen,
    now
  );
  const activeDay = activeDateKey
    ? await listGigsForDate(filters, activeDateKey)
    : null;
  const dayBrowserKey = [filters.q, filters.venueSlugs.join("|")].join("::");

  return (
    <>
      <div className="top-panel">
        <header className="site-header">
          <p className="site-header__eyebrow">Perth Live Music</p>
          <h1 className="site-header__title">Gig Radar</h1>
        </header>
        <div className="top-panel__filters">
          <HomepageFilters
            activeDateKey={activeDateKey}
            availableDateKeys={availableDays.map((day) => day.dateKey)}
            currentQuery={filters.q}
            selectedVenues={selectedVenues}
          />
        </div>
        <SiteHeaderActions />
      </div>
      {availableDays.length === 0 ||
      !activeDateKey ||
      !activeDay ||
      activeDay.items.length === 0 ? (
        <section className="empty-state">
          <p>
            {hasActiveFilters
              ? "No gigs match those filters right now."
              : "No upcoming gigs are loaded yet."}
          </p>
          <p>
            {hasActiveFilters
              ? "Try another venue, change the search, or clear the filters."
              : "Run the scraper once and this page will fill with upcoming shows."}
          </p>
        </section>
      ) : (
        <HomepageDayBrowser
          availableDays={availableDays}
          currentQuery={filters.q}
          initialActiveDateKey={activeDateKey}
          initialDay={activeDay}
          key={dayBrowserKey}
          selectedVenueSlugs={filters.venueSlugs}
        />
      )}
    </>
  );
}
