"use client";

import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  buildHomepageFilterHref,
  type HomepageFilterNavigationInput,
  type WhenFilter
} from "@/lib/homepage-filters";
import type { VenueOption } from "@/lib/venues";

const DATE_FILTER_OPTIONS: Array<{
  label: string;
  value: WhenFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "This weekend", value: "weekend" },
  { label: "Next 7 days", value: "next7days" }
];
const LOCAL_PREVIEW_ASSET_REVISION =
  process.env.NEXT_PUBLIC_LOCAL_PREVIEW_ASSET_REVISION ?? "0";

interface HomepageFiltersProps {
  currentQuery: string;
  currentWhen: WhenFilter;
  resultCount: number;
  selectedVenues: VenueOption[];
}

function getVenueSummary(venue: VenueOption): string {
  return venue.suburb ? `${venue.name} · ${venue.suburb}` : venue.name;
}

export function HomepageFilters({
  currentQuery,
  currentWhen,
  resultCount,
  selectedVenues
}: HomepageFiltersProps) {
  const previewAssetRevision = LOCAL_PREVIEW_ASSET_REVISION;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(currentQuery);
  const [venueInput, setVenueInput] = useState("");
  const deferredVenueInput = useDeferredValue(venueInput);
  const [suggestions, setSuggestions] = useState<VenueOption[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isPending, startTransition] = useTransition();
  const selectedVenueSlugs = selectedVenues.map((venue) => venue.slug);
  const selectedVenueSlugKey = selectedVenueSlugs.join("|");
  const hasActiveFilters =
    currentQuery.length > 0 ||
    currentWhen !== "all" ||
    selectedVenueSlugs.length > 0;

  useEffect(() => {
    setSearchInput(currentQuery);
  }, [currentQuery]);

  useEffect(() => {
    const trimmedInput = deferredVenueInput.trim();

    if (!trimmedInput) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      return;
    }

    const abortController = new AbortController();
    const params = new URLSearchParams();

    params.set("q", trimmedInput);
    selectedVenueSlugs.forEach((slug) => params.append("exclude", slug));
    setIsLoadingSuggestions(true);

    fetch(`/api/venues?${params.toString()}`, {
      signal: abortController.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not fetch venue suggestions.");
        }

        return (await response.json()) as VenueOption[];
      })
      .then((venues) => {
        setSuggestions(venues);
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        console.error(error);
        setSuggestions([]);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingSuggestions(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [deferredVenueInput, selectedVenueSlugKey]);

  function navigate(
    nextValues: HomepageFilterNavigationInput,
    historyMode: "push" | "replace" = "replace"
  ) {
    const href = buildHomepageFilterHref(
      pathname,
      searchParams.toString(),
      nextValues
    );

    startTransition(() => {
      if (historyMode === "push") {
        router.push(href);
      } else {
        router.replace(href);
      }
    });
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ q: searchInput }, "push");
  }

  function handleSelectVenue(venue: VenueOption) {
    setVenueInput("");
    setSuggestions([]);
    navigate({
      venues: [...selectedVenueSlugs, venue.slug]
    });
  }

  function handleRemoveVenue(slug: string) {
    navigate({
      venues: selectedVenueSlugs.filter((venueSlug) => venueSlug !== slug)
    });
  }

  function handleVenueKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && suggestions[0]) {
      event.preventDefault();
      handleSelectVenue(suggestions[0]);
    }
  }

  return (
    <section
      className="filter-panel"
      data-preview-revision={previewAssetRevision}
    >
      <div className="filter-panel__header">
        <div>
          <h2>Find your next Perth gig</h2>
          <p>
            {resultCount === 1
              ? "1 upcoming gig matches these filters."
              : `${resultCount} upcoming gigs match these filters.`}
          </p>
        </div>
        {hasActiveFilters ? (
          <button
            className="filter-panel__reset"
            disabled={isPending}
            onClick={() =>
              navigate({
                q: "",
                venues: [],
                when: "all"
              })
            }
            type="button"
          >
            Reset all
          </button>
        ) : null}
      </div>

      <form className="search-form" onSubmit={handleSearchSubmit}>
        <label className="sr-only" htmlFor="gig-search-input">
          Search gigs, artists, venues, and suburbs
        </label>
        <div className="search-form__row">
          <input
            className="filter-input"
            id="gig-search-input"
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search gigs, artists, venues, suburbs"
            type="search"
            value={searchInput}
          />
          <button className="filter-action" disabled={isPending} type="submit">
            Search
          </button>
        </div>
      </form>

      <div className="venue-picker">
        <label className="sr-only" htmlFor="venue-filter-input">
          Add venue filters
        </label>
        <input
          autoComplete="off"
          className="filter-input"
          id="venue-filter-input"
          onChange={(event) => setVenueInput(event.target.value)}
          onKeyDown={handleVenueKeyDown}
          placeholder="Add venue filters like Milk Bar or The Bird"
          type="search"
          value={venueInput}
        />

        {deferredVenueInput.trim() ? (
          <div className="venue-picker__results">
            {isLoadingSuggestions ? (
              <p className="venue-picker__status">Searching venues…</p>
            ) : suggestions.length > 0 ? (
              <ul className="venue-suggestions">
                {suggestions.map((venue) => (
                  <li key={venue.slug}>
                    <button
                      className="venue-suggestion"
                      onClick={() => handleSelectVenue(venue)}
                      type="button"
                    >
                      <span>{venue.name}</span>
                      {venue.suburb ? <span>{venue.suburb}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="venue-picker__status">No matching venues yet.</p>
            )}
          </div>
        ) : null}
      </div>

      {selectedVenues.length > 0 ? (
        <div className="filter-chips" role="list" aria-label="Selected venues">
          {selectedVenues.map((venue) => (
            <button
              className="filter-chip"
              key={venue.slug}
              onClick={() => handleRemoveVenue(venue.slug)}
              type="button"
            >
              <span>{venue.name}</span>
              <span aria-hidden="true">×</span>
              <span className="sr-only">Remove {getVenueSummary(venue)}</span>
            </button>
          ))}
          {selectedVenues.length > 1 ? (
            <button
              className="filter-chip filter-chip--ghost"
              onClick={() => navigate({ venues: [] })}
              type="button"
            >
              Clear all venues
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="date-pills" role="group" aria-label="Date filters">
        {DATE_FILTER_OPTIONS.map((option) => (
          <button
            aria-pressed={currentWhen === option.value}
            className="date-pill"
            disabled={isPending}
            key={option.value}
            onClick={() => navigate({ when: option.value })}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
