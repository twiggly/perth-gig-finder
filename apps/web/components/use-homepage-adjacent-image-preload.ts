"use client";

import { useCallback, useEffect, useRef } from "react";

import { getAdjacentGigImagePreloadUrls } from "@/lib/gigs";
import type { HomepageDayPayload } from "@/lib/homepage-day-loading";

const ADJACENT_DAY_IMAGE_PRELOAD_LIMIT = 5;
const IMAGE_PRELOAD_TIMEOUT_MS = 120;

interface UseHomepageAdjacentImagePreloadOptions {
  activeDateKey: string;
  loadedDayMap: Map<string, HomepageDayPayload>;
  nextDateKey: string | null;
  previousDateKey: string | null;
}

function shouldSkipAdjacentImagePreload(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return (
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData === true
  );
}

function scheduleAdjacentImagePreload(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  if (typeof window.requestIdleCallback === "function") {
    const idleCallbackId = window.requestIdleCallback(callback, {
      timeout: IMAGE_PRELOAD_TIMEOUT_MS
    });

    return () => {
      window.cancelIdleCallback(idleCallbackId);
    };
  }

  const timeoutId = window.setTimeout(callback, IMAGE_PRELOAD_TIMEOUT_MS);

  return () => {
    window.clearTimeout(timeoutId);
  };
}

export function useHomepageAdjacentImagePreload({
  activeDateKey,
  loadedDayMap,
  nextDateKey,
  previousDateKey
}: UseHomepageAdjacentImagePreloadOptions) {
  const preloadedImageUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !activeDateKey ||
      shouldSkipAdjacentImagePreload()
    ) {
      return;
    }

    const preloadUrls = getAdjacentGigImagePreloadUrls(
      loadedDayMap,
      [previousDateKey, nextDateKey].filter(
        (dateKey): dateKey is string => Boolean(dateKey)
      ),
      ADJACENT_DAY_IMAGE_PRELOAD_LIMIT
    ).filter((url) => !preloadedImageUrlsRef.current.has(url));

    if (preloadUrls.length === 0) {
      return;
    }

    return scheduleAdjacentImagePreload(() => {
      for (const preloadUrl of preloadUrls) {
        preloadedImageUrlsRef.current.add(preloadUrl);
        const image = new window.Image();

        image.decoding = "async";
        image.src = preloadUrl;
        void image.decode?.().catch(() => {});
      }
    });
  }, [activeDateKey, loadedDayMap, nextDateKey, previousDateKey]);

  const resetAdjacentImagePreloads = useCallback(() => {
    preloadedImageUrlsRef.current.clear();
  }, []);

  return {
    resetAdjacentImagePreloads
  };
}
