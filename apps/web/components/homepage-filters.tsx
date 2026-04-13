"use client";

import {
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition
} from "react";
import { flushSync } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

import {
  getDateShortcutLabel,
  getDateShortcutTarget,
  getTodayShortcutState,
  HOMEPAGE_ACTIVE_DATE_CHANGE_EVENT,
  isWeekendShortcutActiveDate,
  requestHomepageActiveDate,
  type DateShortcut
} from "@/lib/homepage-dates";
import {
  buildHomepageFilterHref,
  type HomepageFilterNavigationInput
} from "@/lib/homepage-filters";
import type {
  AutocompleteSuggestion,
  SearchSuggestion
} from "@/lib/search-suggestion-types";
import type { VenueOption } from "@/lib/venues";

const DATE_SHORTCUT_OPTIONS: Array<{
  value: DateShortcut;
}> = [
  { value: "today" },
  { value: "weekend" }
];
const LOCAL_PREVIEW_ASSET_REVISION =
  process.env.NEXT_PUBLIC_LOCAL_PREVIEW_ASSET_REVISION ?? "0";

interface HomepageFiltersProps {
  activeDateKey: string | null;
  availableDateKeys: string[];
  currentQuery: string;
  selectedVenues: VenueOption[];
}

function getVenueSummary(venue: VenueOption): string {
  return venue.suburb ? `${venue.name} · ${venue.suburb}` : venue.name;
}

function SearchSuggestionIcon({
  icon
}: {
  icon: SearchSuggestion["icon"];
}) {
  if (icon === "search") {
    return (
      <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
        <circle
          cx="8.75"
          cy="8.75"
          r="5.25"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="m12.5 12.5 4 4"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  if (icon === "gig") {
    return (
      <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
        <rect
          height="11"
          rx="2.25"
          stroke="currentColor"
          strokeWidth="1.5"
          width="13"
          x="3.5"
          y="5.5"
        />
        <path
          d="M6.5 3.5v4M13.5 3.5v4M3.5 9.5h13"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  if (icon === "artist") {
    return (
      <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
        <rect
          height="8"
          rx="3"
          stroke="currentColor"
          strokeWidth="1.6"
          width="6"
          x="7"
          y="3"
        />
        <path
          d="M5.5 8.5a4.5 4.5 0 0 0 9 0M10 13v3.5M7.5 16.5h5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 20 20" width="18">
      <path
        d="M10 16.5s4.5-4.915 4.5-8a4.5 4.5 0 0 0-9 0c0 3.085 4.5 8 4.5 8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <circle cx="10" cy="8.5" r="1.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function HomepageFilters({
  activeDateKey,
  availableDateKeys,
  currentQuery,
  selectedVenues
}: HomepageFiltersProps) {
  const previewAssetRevision = LOCAL_PREVIEW_ASSET_REVISION;
  const searchMenuId = useId();
  const venueDropdownId = useId();
  const searchMenuRef = useRef<HTMLFormElement | null>(null);
  const venueMenuRef = useRef<HTMLDivElement | null>(null);
  const venueSearchInputRef = useRef<HTMLInputElement | null>(null);
  const shouldAutoFocusVenueInputRef = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const [currentActiveDateKey, setCurrentActiveDateKey] = useState(activeDateKey);
  const [searchInput, setSearchInput] = useState(currentQuery);
  const deferredSearchInput = useDeferredValue(searchInput);
  const [venueInput, setVenueInput] = useState("");
  const deferredVenueInput = useDeferredValue(venueInput);
  const [isSearchMenuOpen, setIsSearchMenuOpen] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [isLoadingSearchSuggestions, setIsLoadingSearchSuggestions] = useState(false);
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(-1);
  const [isVenueMenuOpen, setIsVenueMenuOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<VenueOption[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const [isPending, startTransition] = useTransition();
  const now = new Date();
  const selectedVenueSlugs = selectedVenues.map((venue) => venue.slug);
  const selectedVenueSlugKey = selectedVenueSlugs.join("|");
  const todayShortcut = getTodayShortcutState(availableDateKeys, now);
  const weekendDateKey = getDateShortcutTarget(availableDateKeys, "weekend", now);
  const trimmedSearchInput = searchInput.trim();
  const searchAction =
    trimmedSearchInput.length > 0
      ? {
          type: "search" as const,
          label: `Search for "${trimmedSearchInput}"`,
          query: trimmedSearchInput,
          subtext: null,
          icon: "search" as const
        }
      : null;
  const combinedSearchSuggestions = searchAction
    ? [searchAction, ...searchSuggestions]
    : [];

  useEffect(() => {
    setCurrentActiveDateKey(activeDateKey);
  }, [activeDateKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleActiveDateChange(event: Event) {
      const nextDateKey =
        event instanceof CustomEvent &&
        event.detail &&
        typeof event.detail.dateKey === "string"
          ? event.detail.dateKey
          : null;

      if (nextDateKey) {
        setCurrentActiveDateKey(nextDateKey);
      }
    }

    window.addEventListener(
      HOMEPAGE_ACTIVE_DATE_CHANGE_EVENT,
      handleActiveDateChange
    );

    return () => {
      window.removeEventListener(
        HOMEPAGE_ACTIVE_DATE_CHANGE_EVENT,
        handleActiveDateChange
      );
    };
  }, []);

  useEffect(() => {
    setSearchInput(currentQuery);
    setIsSearchMenuOpen(false);
    setHighlightedSearchIndex(-1);
  }, [currentQuery]);

  useEffect(() => {
    if (!isSearchMenuOpen) {
      setSearchSuggestions([]);
      setIsLoadingSearchSuggestions(false);
      setHighlightedSearchIndex(-1);
      return;
    }

    const trimmedInput = deferredSearchInput.trim();

    if (!trimmedInput) {
      setSearchSuggestions([]);
      setIsLoadingSearchSuggestions(false);
      setHighlightedSearchIndex(-1);
      return;
    }

    const abortController = new AbortController();
    const params = new URLSearchParams({
      q: trimmedInput
    });

    selectedVenueSlugs.forEach((slug) => params.append("venue", slug));
    setIsLoadingSearchSuggestions(true);
    setHighlightedSearchIndex(0);

    fetch(`/api/search-suggestions?${params.toString()}`, {
      signal: abortController.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not fetch search suggestions.");
        }

        return (await response.json()) as Array<
          AutocompleteSuggestion
        >;
      })
      .then((nextSuggestions) => {
        setSearchSuggestions(nextSuggestions);
        setHighlightedSearchIndex(0);
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        console.error(error);
        setSearchSuggestions([]);
        setHighlightedSearchIndex(0);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingSearchSuggestions(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [deferredSearchInput, isSearchMenuOpen, selectedVenueSlugKey]);

  useEffect(() => {
    if (!isVenueMenuOpen) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      return;
    }

    const trimmedInput = deferredVenueInput.trim();

    const abortController = new AbortController();
    const params = new URLSearchParams();

    if (trimmedInput) {
      params.set("q", trimmedInput);
    }
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
        setHighlightedSuggestionIndex(venues.length > 0 ? 0 : -1);
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        console.error(error);
        setSuggestions([]);
        setHighlightedSuggestionIndex(-1);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingSuggestions(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [deferredVenueInput, isVenueMenuOpen, selectedVenueSlugKey]);

  useEffect(() => {
    if (!isVenueMenuOpen) {
      return;
    }

    if (!shouldAutoFocusVenueInputRef.current) {
      return;
    }

    venueSearchInputRef.current?.focus();
    shouldAutoFocusVenueInputRef.current = false;
  }, [isVenueMenuOpen]);

  useEffect(() => {
    if (!isSearchMenuOpen && !isVenueMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      const clickedInsideSearchMenu =
        searchMenuRef.current?.contains(event.target) ?? false;
      const clickedInsideVenueMenu =
        venueMenuRef.current?.contains(event.target) ?? false;

      if (!clickedInsideSearchMenu && !clickedInsideVenueMenu) {
        closeSearchMenu();
        closeVenueMenu();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isSearchMenuOpen, isVenueMenuOpen]);

  function navigate(
    nextValues: HomepageFilterNavigationInput,
    historyMode: "push" | "replace" = "replace"
  ) {
    const isDateOnlyNavigation =
      nextValues.date !== undefined &&
      nextValues.q === undefined &&
      nextValues.venues === undefined;

    if (
      isDateOnlyNavigation &&
      historyMode === "replace" &&
      typeof window !== "undefined"
    ) {
      const requestedDateKey = nextValues.date?.trim() ?? "";

      if (requestedDateKey) {
        requestHomepageActiveDate(pathname, requestedDateKey);
      }

      return;
    }

    const currentSearch =
      typeof window === "undefined"
        ? ""
        : window.location.search.startsWith("?")
          ? window.location.search.slice(1)
          : window.location.search;
    const href = buildHomepageFilterHref(
      pathname,
      currentSearch,
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

  function handleDateShortcutNavigation(requestedDateKey: string) {
    flushSync(() => {
      setCurrentActiveDateKey(requestedDateKey);
    });

    navigate({ date: requestedDateKey });
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const activeSuggestion =
      highlightedSearchIndex >= 0
        ? combinedSearchSuggestions[highlightedSearchIndex]
        : undefined;

    if (activeSuggestion) {
      handleSelectSearchSuggestion(activeSuggestion);
      return;
    }

    closeSearchMenu();
    navigate({ q: searchInput }, "push");
  }

  function closeSearchMenu() {
    setIsSearchMenuOpen(false);
    setHighlightedSearchIndex(-1);
  }

  function closeVenueMenu() {
    setIsVenueMenuOpen(false);
    setVenueInput("");
    setHighlightedSuggestionIndex(-1);
  }

  function handleSelectSearchSuggestion(suggestion: SearchSuggestion) {
    closeSearchMenu();
    closeVenueMenu();

    if (suggestion.type === "venue") {
      setSearchInput(currentQuery);
      navigate({
        venues: [...selectedVenueSlugs, suggestion.slug]
      });
      return;
    }

    const nextQuery = suggestion.query;
    setSearchInput(nextQuery);
    navigate({ q: nextQuery }, "push");
  }

  function handleSelectVenue(venue: VenueOption) {
    closeSearchMenu();
    closeVenueMenu();
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
    if (!isVenueMenuOpen) {
      return;
    }

    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setHighlightedSuggestionIndex((currentIndex) =>
        currentIndex < 0 ? 0 : (currentIndex + 1) % suggestions.length
      );
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setHighlightedSuggestionIndex((currentIndex) =>
        currentIndex <= 0 ? suggestions.length - 1 : currentIndex - 1
      );
      return;
    }

    if (
      event.key === "Enter" &&
      highlightedSuggestionIndex >= 0 &&
      suggestions[highlightedSuggestionIndex]
    ) {
      event.preventDefault();
      handleSelectVenue(suggestions[highlightedSuggestionIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeVenueMenu();
    }
  }

  function handleSearchInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setSearchInput(nextValue);

    if (nextValue.trim()) {
      closeVenueMenu();
      setIsSearchMenuOpen(true);
      setHighlightedSearchIndex(0);
      return;
    }

    closeSearchMenu();
  }

  function handleSearchInputFocus() {
    if (searchInput.trim()) {
      closeVenueMenu();
      setIsSearchMenuOpen(true);
      setHighlightedSearchIndex(0);
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isSearchMenuOpen || combinedSearchSuggestions.length === 0) {
      if (event.key === "Escape") {
        closeSearchMenu();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedSearchIndex((currentIndex) =>
        currentIndex < 0
          ? 0
          : (currentIndex + 1) % combinedSearchSuggestions.length
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedSearchIndex((currentIndex) =>
        currentIndex <= 0
          ? combinedSearchSuggestions.length - 1
          : currentIndex - 1
      );
      return;
    }

    if (
      event.key === "Enter" &&
      highlightedSearchIndex >= 0 &&
      combinedSearchSuggestions[highlightedSearchIndex]
    ) {
      event.preventDefault();
      handleSelectSearchSuggestion(combinedSearchSuggestions[highlightedSearchIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeSearchMenu();
    }
  }

  return (
    <section
      className="filter-panel"
      data-preview-revision={previewAssetRevision}
    >
      <div className="filter-toolbar">
        <div className="filter-toolbar__brand">Perth Gig Radar</div>
        <form
          className="filter-toolbar__search"
          onSubmit={handleSearchSubmit}
          ref={searchMenuRef}
        >
          <label className="sr-only" htmlFor="gig-search-input">
            Search gigs, artists, venues, and suburbs
          </label>
          <input
            className="filter-input filter-input--compact"
            id="gig-search-input"
            aria-controls={searchMenuId}
            aria-expanded={isSearchMenuOpen}
            aria-haspopup="listbox"
            onChange={handleSearchInputChange}
            onFocus={handleSearchInputFocus}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search gigs, artists, venues, suburbs"
            type="search"
            value={searchInput}
          />
          {isSearchMenuOpen && trimmedSearchInput ? (
            <div className="search-menu__popover" id={searchMenuId}>
              <div className="search-menu__results">
                <ul
                  aria-label="Search suggestions"
                  className="search-suggestions"
                  role="listbox"
                >
                  {combinedSearchSuggestions.map((suggestion, index) => (
                    <li
                      className={`search-suggestion${
                        suggestion.type === "search"
                          ? " search-suggestion--primary"
                          : ""
                      }${
                        highlightedSearchIndex === index
                          ? " search-suggestion--active"
                          : ""
                      }`}
                      key={
                        suggestion.type === "venue"
                          ? `${suggestion.type}-${suggestion.slug}`
                          : `${suggestion.type}-${suggestion.label}`
                      }
                    >
                      <button
                        aria-selected={highlightedSearchIndex === index}
                        className="search-suggestion__button"
                        onClick={() => handleSelectSearchSuggestion(suggestion)}
                        onMouseEnter={() => setHighlightedSearchIndex(index)}
                        type="button"
                      >
                        <span className="search-suggestion__icon">
                          <SearchSuggestionIcon icon={suggestion.icon} />
                        </span>
                        <span className="search-suggestion__content">
                          <span className="search-suggestion__label">
                            {suggestion.label}
                          </span>
                          {suggestion.subtext ? (
                            <span className="search-suggestion__subtext">
                              {suggestion.subtext}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {isLoadingSearchSuggestions ? (
                  <p className="search-menu__status">Loading suggestions…</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </form>
        <div className="venue-menu" ref={venueMenuRef}>
          <button
            aria-controls={venueDropdownId}
            aria-expanded={isVenueMenuOpen}
            aria-haspopup="dialog"
            className={`venue-menu__trigger${
              isVenueMenuOpen ? " venue-menu__trigger--open" : ""
            }`}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" ||
                event.key === " " ||
                event.key === "ArrowDown"
              ) {
                shouldAutoFocusVenueInputRef.current = true;
              }
            }}
            onPointerDown={() => {
              shouldAutoFocusVenueInputRef.current = false;
            }}
            onClick={() => {
              closeSearchMenu();
              setIsVenueMenuOpen((current) => !current);
            }}
            type="button"
          >
            <span>Venues</span>
            <svg
              aria-hidden="true"
              className="venue-menu__chevron"
              fill="none"
              height="18"
              viewBox="0 0 20 20"
              width="18"
            >
              <path
                d="M5.5 7.75 10 12.25l4.5-4.5"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
              />
            </svg>
          </button>
          {isVenueMenuOpen ? (
            <div
              className="venue-menu__popover"
              id={venueDropdownId}
              role="dialog"
            >
              <label className="sr-only" htmlFor="venue-filter-input">
                Search venues
              </label>
              <input
                autoComplete="off"
                className="filter-input filter-input--compact"
                id="venue-filter-input"
                onChange={(event) => setVenueInput(event.target.value)}
                onKeyDown={handleVenueKeyDown}
                placeholder="Search venues"
                ref={venueSearchInputRef}
                type="search"
                value={venueInput}
              />
              <div className="venue-menu__results">
                {isLoadingSuggestions ? (
                  <p className="venue-picker__status">Loading venues…</p>
                ) : suggestions.length > 0 ? (
                  <ul
                    aria-label="Venue options"
                    className="venue-suggestions"
                    role="listbox"
                  >
                    {suggestions.map((venue, index) => (
                      <li key={venue.slug}>
                        <button
                          aria-selected={highlightedSuggestionIndex === index}
                          className={`venue-suggestion${
                            highlightedSuggestionIndex === index
                              ? " venue-suggestion--active"
                              : ""
                          }`}
                          onClick={() => handleSelectVenue(venue)}
                          onMouseEnter={() => setHighlightedSuggestionIndex(index)}
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
            </div>
          ) : null}
        </div>
        <div aria-hidden="true" className="filter-toolbar__profile">
          <svg
            className="filter-toolbar__profile-icon"
            fill="none"
            height="22"
            viewBox="0 0 24 24"
            width="22"
          >
            <path
              d="M16.25 8a4.25 4.25 0 1 1-8.5 0 4.25 4.25 0 0 1 8.5 0Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
            <path
              d="M5.75 18.25a6.25 6.25 0 0 1 12.5 0"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        </div>
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

      {todayShortcut.targetDateKey || weekendDateKey ? (
        <div className="date-pills" role="group" aria-label="Jump to date">
          {DATE_SHORTCUT_OPTIONS.map((option) => {
            const targetDateKey =
              option.value === "today"
                ? todayShortcut.targetDateKey
                : weekendDateKey;

            if (!targetDateKey) {
              return null;
            }

            const isPressed =
              option.value === "today"
                ? todayShortcut.todayDateKey
                  ? currentActiveDateKey !== null &&
                    currentActiveDateKey === todayShortcut.todayDateKey
                  : currentActiveDateKey !== null &&
                    currentActiveDateKey === todayShortcut.nearestDateKey
                : isWeekendShortcutActiveDate(currentActiveDateKey, now);

            return (
              <button
                aria-pressed={isPressed}
                className="date-pill"
                disabled={isPending}
                key={option.value}
                onClick={() => handleDateShortcutNavigation(targetDateKey)}
                type="button"
              >
                {option.value === "today"
                  ? todayShortcut.label
                  : getDateShortcutLabel(option.value, now)}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
