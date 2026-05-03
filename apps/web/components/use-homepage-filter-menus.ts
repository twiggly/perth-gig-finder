"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

const AUTO_FOCUS_VENUE_SEARCH_MEDIA_QUERY = "(hover: hover) and (pointer: fine)";

interface UseHomepageFilterMenusOptions {
  onSearchMenuClose: () => void;
  onVenueMenuClose: () => void;
}

export function useHomepageFilterMenus({
  onSearchMenuClose,
  onVenueMenuClose
}: UseHomepageFilterMenusOptions) {
  const searchMenuRef = useRef<HTMLFormElement | null>(null);
  const venueMenuRef = useRef<HTMLDivElement | null>(null);
  const venueSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [isSearchMenuOpen, setIsSearchMenuOpen] = useState(false);
  const [isVenueMenuOpen, setIsVenueMenuOpen] = useState(false);

  const closeAllMenusFromEffect = useEffectEvent(() => {
    setIsSearchMenuOpen(false);
    onSearchMenuClose();
    setIsVenueMenuOpen(false);
    onVenueMenuClose();
  });

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
        closeAllMenusFromEffect();
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

  function closeSearchMenu() {
    setIsSearchMenuOpen(false);
    onSearchMenuClose();
  }

  function closeVenueMenu() {
    setIsVenueMenuOpen(false);
    onVenueMenuClose();
  }

  function closeAllMenus() {
    closeSearchMenu();
    closeVenueMenu();
  }

  function openSearchMenu() {
    closeVenueMenu();
    setIsSearchMenuOpen(true);
  }

  function toggleVenueMenu() {
    closeSearchMenu();
    setIsVenueMenuOpen((current) => !current);
  }

  return {
    closeAllMenus,
    closeSearchMenu,
    closeVenueMenu,
    isSearchMenuOpen,
    isVenueMenuOpen,
    openSearchMenu,
    searchMenuRef,
    toggleVenueMenu,
    venueMenuRef,
    venueSearchInputRef
  };
}
