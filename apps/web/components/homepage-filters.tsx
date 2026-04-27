"use client";

import {
  useDeferredValue,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition
} from "react";
import { flushSync } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Box, ScrollArea, Text, TextInput, UnstyledButton } from "@mantine/core";

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
  buildVenueFilterPrefetchHrefs,
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
const AUTO_FOCUS_VENUE_SEARCH_MEDIA_QUERY = "(hover: hover) and (pointer: fine)";

interface HomepageFiltersProps {
  activeDateKey: string | null;
  availableDateKeys: string[];
  currentQuery: string;
  selectedVenues: VenueOption[];
}

type VenueOptimisticAction =
  | {
      type: "add";
      venue: VenueOption;
    }
  | {
      type: "remove";
      slug: string;
    }
  | {
      type: "clear";
    };

function getVenueSummary(venue: VenueOption): string {
  return venue.suburb ? `${venue.name} · ${venue.suburb}` : venue.name;
}

function applyVenueOptimisticAction(
  venues: VenueOption[],
  action: VenueOptimisticAction
): VenueOption[] {
  if (action.type === "clear") {
    return [];
  }

  if (action.type === "remove") {
    return venues.filter((venue) => venue.slug !== action.slug);
  }

  if (venues.some((venue) => venue.slug === action.venue.slug)) {
    return venues;
  }

  return [...venues, action.venue];
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
  const pathname = usePathname();
  const router = useRouter();
  const [currentActiveDateKey, setCurrentActiveDateKey] = useState(activeDateKey);
  const [searchInput, setSearchInput] = useState(currentQuery);
  const deferredSearchInput = useDeferredValue(searchInput);
  const [optimisticSelectedVenues, addOptimisticVenueAction] = useOptimistic(
    selectedVenues,
    applyVenueOptimisticAction
  );
  const [venueInput, setVenueInput] = useState("");
  const deferredVenueInput = useDeferredValue(venueInput);
  const [isSearchMenuOpen, setIsSearchMenuOpen] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [isLoadingSearchSuggestions, setIsLoadingSearchSuggestions] = useState(false);
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(-1);
  const [isVenueMenuOpen, setIsVenueMenuOpen] = useState(false);
  const [preloadedVenueSuggestions, setPreloadedVenueSuggestions] = useState<
    VenueOption[]
  >([]);
  const [isPreloadingVenueSuggestions, setIsPreloadingVenueSuggestions] =
    useState(false);
  const [suggestions, setSuggestions] = useState<VenueOption[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const [isPending, startTransition] = useTransition();
  const now = new Date();
  const selectedVenueSlugs = optimisticSelectedVenues.map((venue) => venue.slug);
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
  const isVenueSuggestionsPending =
    isLoadingSuggestions ||
    (isVenueMenuOpen &&
      !deferredVenueInput.trim() &&
      isPreloadingVenueSuggestions) ||
    (isVenueMenuOpen && venueInput.trim() !== deferredVenueInput.trim());

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
    const abortController = new AbortController();
    const params = new URLSearchParams();
    const excludedSlugs = selectedVenueSlugKey
      ? selectedVenueSlugKey.split("|")
      : [];

    excludedSlugs.forEach((slug) => params.append("exclude", slug));
    setIsPreloadingVenueSuggestions(true);

    fetch(`/api/venues?${params.toString()}`, {
      signal: abortController.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not preload venue suggestions.");
        }

        return (await response.json()) as VenueOption[];
      })
      .then((venues) => {
        setPreloadedVenueSuggestions(venues);
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        console.error(error);
        setPreloadedVenueSuggestions([]);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsPreloadingVenueSuggestions(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [selectedVenueSlugKey]);

  useEffect(() => {
    if (venueInput.trim()) {
      return;
    }

    setSuggestions(preloadedVenueSuggestions);
    setHighlightedSuggestionIndex(-1);
  }, [preloadedVenueSuggestions, venueInput]);

  useEffect(() => {
    if (selectedVenueSlugs.length === 0 || typeof window === "undefined") {
      return;
    }

    const currentSearch = window.location.search.startsWith("?")
      ? window.location.search.slice(1)
      : window.location.search;
    const hrefs = buildVenueFilterPrefetchHrefs(
      pathname,
      currentSearch,
      selectedVenueSlugs
    );

    for (const href of hrefs) {
      router.prefetch(href);
    }
  }, [currentActiveDateKey, currentQuery, pathname, router, selectedVenueSlugKey]);

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
      setIsLoadingSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      return;
    }

    const trimmedInput = deferredVenueInput.trim();

    if (!trimmedInput) {
      setSuggestions(preloadedVenueSuggestions);
      setIsLoadingSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      return;
    }

    const abortController = new AbortController();
    const params = new URLSearchParams();

    params.set("q", trimmedInput);
    selectedVenueSlugs.forEach((slug) => params.append("exclude", slug));
    setIsLoadingSuggestions(true);
    setHighlightedSuggestionIndex(-1);

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
        setHighlightedSuggestionIndex(
          trimmedInput && venues.length > 0 ? 0 : -1
        );
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
  }, [
    deferredVenueInput,
    isVenueMenuOpen,
    preloadedVenueSuggestions,
    selectedVenueSlugKey
  ]);

  useEffect(() => {
    if (!isVenueMenuOpen) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    if (!window.matchMedia(AUTO_FOCUS_VENUE_SEARCH_MEDIA_QUERY).matches) {
      return;
    }

    venueSearchInputRef.current?.focus();
    venueSearchInputRef.current?.select();
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

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    if (isSearchMenuOpen || isVenueMenuOpen) {
      document.body.dataset.filterDropdownOpen = "true";
    } else {
      delete document.body.dataset.filterDropdownOpen;
    }

    return () => {
      delete document.body.dataset.filterDropdownOpen;
    };
  }, [isSearchMenuOpen, isVenueMenuOpen]);

  function navigate(
    nextValues: HomepageFilterNavigationInput,
    historyMode: "push" | "replace" = "replace",
    prepareNavigation?: () => void
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
      prepareNavigation?.();

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
    setSuggestions(preloadedVenueSuggestions);
    setHighlightedSuggestionIndex(-1);
  }

  function handleSelectSearchSuggestion(suggestion: SearchSuggestion) {
    closeSearchMenu();
    closeVenueMenu();

    if (suggestion.type === "venue") {
      const venue = {
        slug: suggestion.slug,
        name: suggestion.label,
        suburb: suggestion.subtext
      };
      const nextVenueSlugs = selectedVenueSlugs.includes(suggestion.slug)
        ? selectedVenueSlugs
        : [...selectedVenueSlugs, suggestion.slug];

      setSearchInput(currentQuery);
      navigate(
        {
          venues: nextVenueSlugs
        },
        "replace",
        () => addOptimisticVenueAction({ type: "add", venue })
      );
      return;
    }

    const nextQuery = suggestion.query;
    setSearchInput(nextQuery);
    navigate({ q: nextQuery }, "push");
  }

  function handleSelectVenue(venue: VenueOption) {
    closeSearchMenu();
    closeVenueMenu();
    const nextVenueSlugs = selectedVenueSlugs.includes(venue.slug)
      ? selectedVenueSlugs
      : [...selectedVenueSlugs, venue.slug];

    navigate(
      {
        venues: nextVenueSlugs
      },
      "replace",
      () => addOptimisticVenueAction({ type: "add", venue })
    );
  }

  function handleRemoveVenue(slug: string) {
    const nextVenueSlugs = selectedVenueSlugs.filter(
      (venueSlug) => venueSlug !== slug
    );

    navigate(
      {
        venues: nextVenueSlugs
      },
      "replace",
      () => addOptimisticVenueAction({ type: "remove", slug })
    );
  }

  function handleClearVenues() {
    navigate({ venues: [] }, "replace", () =>
      addOptimisticVenueAction({ type: "clear" })
    );
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

    if (currentQuery.trim()) {
      navigate({ q: "" });
    }
  }

  function handleSearchClear() {
    setSearchInput("");
    closeSearchMenu();

    if (currentQuery.trim()) {
      navigate({ q: "" });
    }
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
    <>
      <Box
        component="section"
        className="filter-panel"
        data-preview-revision={previewAssetRevision}
      >
        <div className="filter-toolbar">
          <form
            className="filter-toolbar__search"
            onSubmit={handleSearchSubmit}
            ref={searchMenuRef}
          >
            <label className="sr-only" htmlFor="gig-search-input">
              Search gigs, artists, venues, and suburbs
            </label>
            <TextInput
              id="gig-search-input"
              aria-controls={searchMenuId}
              aria-expanded={isSearchMenuOpen}
              aria-haspopup="listbox"
              classNames={{
                input: `filter-input filter-input--compact${
                  searchInput ? " filter-input--has-mobile-clear" : ""
                }`
              }}
              onChange={handleSearchInputChange}
              onFocus={handleSearchInputFocus}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search events & artists"
              type="search"
              unstyled
              value={searchInput}
            />
            {searchInput ? (
              <UnstyledButton
                aria-label="Clear search"
                className="filter-toolbar__search-clear"
                onClick={handleSearchClear}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </UnstyledButton>
            ) : null}
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
                        <UnstyledButton
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
                        </UnstyledButton>
                      </li>
                    ))}
                  </ul>
                  {isLoadingSearchSuggestions ? (
                    <Text className="search-menu__status" component="p">
                      Loading suggestions…
                    </Text>
                  ) : null}
                </div>
              </div>
            ) : null}
          </form>
          <div className="venue-menu" ref={venueMenuRef}>
            <UnstyledButton
              aria-controls={venueDropdownId}
              aria-expanded={isVenueMenuOpen}
              aria-haspopup="dialog"
              className={`venue-menu__trigger${
                isVenueMenuOpen ? " venue-menu__trigger--open" : ""
              }`}
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
            </UnstyledButton>
            {isVenueMenuOpen ? (
              <div
                className="venue-menu__popover"
                id={venueDropdownId}
                role="dialog"
              >
                <label className="sr-only" htmlFor="venue-filter-input">
                  Search venues
                </label>
                <TextInput
                  autoComplete="off"
                  classNames={{ input: "filter-input filter-input--compact" }}
                  id="venue-filter-input"
                  onChange={(event) => setVenueInput(event.target.value)}
                  onKeyDown={handleVenueKeyDown}
                  placeholder="Search venues"
                  ref={venueSearchInputRef}
                  type="search"
                  unstyled
                  value={venueInput}
                />
                <ScrollArea.Autosize
                  className="venue-menu__scroller"
                  mah="18rem"
                  offsetScrollbars="present"
                  scrollbars="y"
                  type="auto"
                >
                  <div className="venue-menu__results">
                    {suggestions.length > 0 ? (
                      <ul
                        aria-label="Venue options"
                        className="venue-suggestions"
                        role="listbox"
                      >
                        {suggestions.map((venue, index) => (
                          <li key={venue.slug}>
                            <UnstyledButton
                              aria-selected={highlightedSuggestionIndex === index}
                              className={`venue-suggestion${
                                highlightedSuggestionIndex === index
                                  ? " venue-suggestion--active"
                                  : ""
                              }`}
                              onClick={() => handleSelectVenue(venue)}
                              onMouseEnter={() =>
                                setHighlightedSuggestionIndex(index)
                              }
                              type="button"
                            >
                              <span>{venue.name}</span>
                              {venue.suburb ? <span>{venue.suburb}</span> : null}
                            </UnstyledButton>
                          </li>
                        ))}
                      </ul>
                    ) : isVenueSuggestionsPending ? (
                      <Text className="venue-picker__status" component="p">
                        Loading venues…
                      </Text>
                    ) : (
                      <Text className="venue-picker__status" component="p">
                        No matching venues yet.
                      </Text>
                    )}
                  </div>
                </ScrollArea.Autosize>
              </div>
            ) : null}
          </div>
        </div>

        {optimisticSelectedVenues.length > 0 ? (
          <div className="filter-chips" role="list" aria-label="Selected venues">
            {optimisticSelectedVenues.map((venue) => (
              <UnstyledButton
                className="filter-chip"
                key={venue.slug}
                onClick={() => handleRemoveVenue(venue.slug)}
                type="button"
              >
                <span>{venue.name}</span>
                <span aria-hidden="true">×</span>
                <span className="sr-only">Remove {getVenueSummary(venue)}</span>
              </UnstyledButton>
            ))}
            {optimisticSelectedVenues.length > 1 ? (
              <UnstyledButton
                className="filter-chip filter-chip--ghost"
                onClick={handleClearVenues}
                type="button"
              >
                Clear all venues
              </UnstyledButton>
            ) : null}
          </div>
        ) : null}
      </Box>

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
              <UnstyledButton
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
              </UnstyledButton>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
