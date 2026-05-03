"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildHomepageDayRequestPath,
  isHomepageDayPayload,
  mergeHomepageDayCache,
  type HomepageDayPayload
} from "@/lib/homepage-day-loading";

interface UseHomepageDayCacheOptions {
  availableDateKeys: string[];
  currentQuery: string;
  initialDays: HomepageDayPayload[];
  selectedVenueSlugs: string[];
}

export function useHomepageDayCache({
  availableDateKeys,
  currentQuery,
  initialDays,
  selectedVenueSlugs
}: UseHomepageDayCacheOptions) {
  const pendingDayLoadsRef = useRef<Map<string, Promise<HomepageDayPayload>>>(
    new Map()
  );
  const isMountedRef = useRef(true);
  const [loadedDays, setLoadedDays] =
    useState<HomepageDayPayload[]>(initialDays);
  const [loadingDateKey, setLoadingDateKey] = useState<string | null>(null);
  const [dayLoadError, setDayLoadError] = useState<string | null>(null);
  const loadedDayMap = useMemo(
    () => new Map(loadedDays.map((day) => [day.dateKey, day])),
    [loadedDays]
  );
  const loadedDateKeys = useMemo(
    () => loadedDays.map((day) => day.dateKey),
    [loadedDays]
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      pendingDayLoadsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    setLoadedDays(initialDays);
    setLoadingDateKey(null);
    setDayLoadError(null);
    pendingDayLoadsRef.current.clear();
  }, [availableDateKeys, initialDays]);

  function cacheHomepageDay(day: HomepageDayPayload) {
    setLoadedDays((currentDays) =>
      mergeHomepageDayCache(currentDays, day, availableDateKeys)
    );
  }

  async function fetchHomepageDay(
    dateKey: string
  ): Promise<HomepageDayPayload | null> {
    if (!availableDateKeys.includes(dateKey)) {
      return null;
    }

    const cachedDay = loadedDayMap.get(dateKey);

    if (cachedDay) {
      return cachedDay;
    }

    const pendingLoad = pendingDayLoadsRef.current.get(dateKey);

    if (pendingLoad) {
      return pendingLoad;
    }

    const requestPath = buildHomepageDayRequestPath({
      dateKey,
      query: currentQuery,
      venueSlugs: selectedVenueSlugs
    });
    const request = fetch(requestPath, {
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error("Could not load gigs for that date.");
      }

      const payload: unknown = await response.json();

      if (!isHomepageDayPayload(payload)) {
        throw new Error("The date payload was malformed.");
      }

      if (isMountedRef.current) {
        cacheHomepageDay(payload);
      }

      return payload;
    });

    pendingDayLoadsRef.current.set(dateKey, request);

    try {
      return await request;
    } finally {
      pendingDayLoadsRef.current.delete(dateKey);
    }
  }

  function prefetchHomepageDay(dateKey: string) {
    if (
      loadedDayMap.has(dateKey) ||
      pendingDayLoadsRef.current.has(dateKey)
    ) {
      return;
    }

    void fetchHomepageDay(dateKey).catch(() => {});
  }

  async function ensureHomepageDayForNavigation(
    dateKey: string
  ): Promise<boolean> {
    if (loadedDayMap.has(dateKey)) {
      return true;
    }

    setLoadingDateKey(dateKey);

    try {
      const day = await fetchHomepageDay(dateKey);

      return Boolean(day);
    } catch (error) {
      console.error(error);
      setDayLoadError("Could not load that date. Try again.");

      return false;
    } finally {
      setLoadingDateKey((currentDateKey) =>
        currentDateKey === dateKey ? null : currentDateKey
      );
    }
  }

  function resetDayLoadError() {
    setDayLoadError(null);
  }

  return {
    dayLoadError,
    ensureHomepageDayForNavigation,
    isLoadingDay: loadingDateKey !== null,
    loadedDayMap,
    loadedDateKeys,
    prefetchHomepageDay,
    resetDayLoadError
  };
}
