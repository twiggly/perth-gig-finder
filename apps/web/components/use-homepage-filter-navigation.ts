"use client";

import { useEffect, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

import {
  HOMEPAGE_ACTIVE_DATE_CHANGE_EVENT,
  requestHomepageActiveDate
} from "@/lib/homepage-dates";
import {
  buildHomepageFilterHref,
  buildVenueFilterPrefetchHrefs,
  type HomepageFilterNavigationInput
} from "@/lib/homepage-filters";

interface UseHomepageFilterNavigationOptions {
  activeDateKey: string | null;
  currentQuery: string;
  selectedVenueSlugs: string[];
}

export type HomepageFilterHistoryMode = "push" | "replace";
export type HomepageFilterNavigate = (
  nextValues: HomepageFilterNavigationInput,
  historyMode?: HomepageFilterHistoryMode,
  prepareNavigation?: () => void
) => void;

export function useHomepageFilterNavigation({
  activeDateKey,
  currentQuery,
  selectedVenueSlugs
}: UseHomepageFilterNavigationOptions) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentActiveDateKey, setCurrentActiveDateKey] = useState(activeDateKey);
  const [isPending, startTransition] = useTransition();
  const selectedVenueSlugKey = selectedVenueSlugs.join("|");

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

  function navigate(
    nextValues: HomepageFilterNavigationInput,
    historyMode: HomepageFilterHistoryMode = "replace",
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
    const href = buildHomepageFilterHref(pathname, currentSearch, nextValues);

    startTransition(() => {
      prepareNavigation?.();

      if (historyMode === "push") {
        router.push(href);
      } else {
        router.replace(href);
      }
    });
  }

  function navigateDateShortcut(requestedDateKey: string) {
    flushSync(() => {
      setCurrentActiveDateKey(requestedDateKey);
    });

    navigate({ date: requestedDateKey });
  }

  return {
    currentActiveDateKey,
    isPending,
    navigate,
    navigateDateShortcut
  };
}
