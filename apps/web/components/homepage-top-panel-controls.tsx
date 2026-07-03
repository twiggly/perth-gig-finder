"use client";

import { Combobox, useCombobox } from "@mantine/core";
import React, { useEffect, useId, useRef, useState } from "react";

import type { VenueOption } from "@/lib/venues";
import { HomepageFilters } from "./homepage-filters";
import { SiteHeaderActions } from "./site-header-actions";

interface HomepageTopPanelControlsProps {
  activeDateKey: string | null;
  availableDateKeys: string[];
  currentQuery: string;
  initialHeaderMenuState?: HeaderMenuState;
  initialFilterPanelVisible?: boolean;
  selectedVenues: VenueOption[];
}

export type HeaderMenuState = "closed" | "open" | "closing";

const HEADER_MENU_FADE_DURATION_MS = 160;
const HEADER_MENU_SECTIONS = [
  {
    heading: "Account",
    items: ["Log in", "Sign up"]
  },
  {
    heading: "Resources",
    items: ["About", "Contact"]
  }
] as const;

export const HEADER_LOCATION_OPTIONS = [
  "Perth",
  "Sydney",
  "Melbourne",
  "Brisbane",
  "Adelaide",
  "Canberra"
] as const;

export const HEADER_LOCATION_UNAVAILABLE_MARKER = "🚧";
export const HEADER_LOCATION_DISPLAY_NAME = "Perth / Boorloo";

export type HeaderLocationOption = (typeof HEADER_LOCATION_OPTIONS)[number];

export function isHeaderLocationAvailable(location: HeaderLocationOption) {
  return location === "Perth";
}

export function getHeaderLocationOptionLabel(location: HeaderLocationOption) {
  return location === "Perth" ? HEADER_LOCATION_DISPLAY_NAME : location;
}

export function getHeaderLocationUnavailableMarker(
  location: HeaderLocationOption
) {
  return isHeaderLocationAvailable(location)
    ? null
    : HEADER_LOCATION_UNAVAILABLE_MARKER;
}

export function resolveHeaderLocationSelection(value: string) {
  const nextLocation = HEADER_LOCATION_OPTIONS.find(
    (location) => location === value
  );

  if (!nextLocation || !isHeaderLocationAvailable(nextLocation)) {
    return null;
  }

  return nextLocation;
}

interface HeaderLocationMenuOpenDocument {
  body: {
    dataset: {
      headerLocationMenuOpen?: string;
    };
  };
}

export function syncHomepageHeaderLocationMenuOpenState(
  isOpen: boolean,
  targetDocument: HeaderLocationMenuOpenDocument | null | undefined =
    typeof document === "undefined" ? undefined : document
) {
  if (!targetDocument) {
    return;
  }

  if (isOpen) {
    targetDocument.body.dataset.headerLocationMenuOpen = "true";
    return;
  }

  delete targetDocument.body.dataset.headerLocationMenuOpen;
}

export function getHeaderMenuButtonStates(headerMenuState: HeaderMenuState) {
  return {
    ariaOpen: headerMenuState === "open",
    iconState: headerMenuState === "open" ? "open" : "closed",
    isOverlayMounted: headerMenuState !== "closed",
    surfaceState: headerMenuState === "closed" ? "closed" : "open"
  } as const;
}

function SearchToggleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="site-header__filter-icon site-header__filter-icon--search"
      fill="none"
      height="21"
      viewBox="0 0 24 24"
      width="21"
    >
      <circle
        cx="10.75"
        cy="10.75"
        r="5.75"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="m15.25 15.25 4.5 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function CloseFilterIcon() {
  return (
    <svg
      aria-hidden="true"
      className="site-header__filter-icon site-header__filter-icon--close"
      fill="none"
      height="21"
      viewBox="0 0 24 24"
      width="21"
    >
      <path
        d="M7.5 7.5 16.5 16.5M16.5 7.5 7.5 16.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

interface FilterPanelToggleButtonProps {
  controls: string;
  isExpanded: boolean;
  label: string;
  onClick: () => void;
  placement: "header" | "panel";
  showActiveFilterMarker: boolean;
}

function FilterPanelToggleButton({
  controls,
  isExpanded,
  label,
  onClick,
  placement,
  showActiveFilterMarker
}: FilterPanelToggleButtonProps) {
  return (
    <button
      aria-controls={controls}
      aria-expanded={isExpanded}
      aria-label={label}
      className={`site-header__filter-toggle site-header__filter-toggle--homepage site-header__filter-toggle--${placement}`}
      data-active-filters={showActiveFilterMarker ? "true" : undefined}
      data-state={isExpanded ? "open" : "closed"}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className="site-header__filter-icon-stack" aria-hidden="true">
        <SearchToggleIcon />
        <CloseFilterIcon />
      </span>
    </button>
  );
}

function HeaderLocationChevron() {
  return (
    <svg
      aria-hidden="true"
      className="site-header__location-chevron"
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
  );
}

interface HeaderMenuButtonProps {
  buttonRef: React.Ref<HTMLButtonElement>;
  controls: string;
  presentation: ReturnType<typeof getHeaderMenuButtonStates>;
  onClick: () => void;
}

function HeaderMenuButton({
  buttonRef,
  controls,
  presentation,
  onClick
}: HeaderMenuButtonProps) {
  const label = presentation.ariaOpen
    ? "Close account menu"
    : "Open account menu";

  return (
    <button
      aria-controls={controls}
      aria-expanded={presentation.ariaOpen}
      aria-label={label}
      className="site-header__menu-button"
      data-surface-state={presentation.surfaceState}
      data-state={presentation.iconState}
      onClick={onClick}
      ref={buttonRef}
      title={label}
      type="button"
    >
      <span className="site-header__menu-icon-stack" aria-hidden="true">
        <svg
          className="site-header__menu-icon site-header__menu-icon--lines"
          fill="none"
          height="22"
          viewBox="0 0 24 24"
          width="22"
        >
          <path
            d="M6 9h12M6 15h12"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
        <svg
          className="site-header__menu-icon site-header__menu-icon--close"
          fill="none"
          height="22"
          viewBox="0 0 24 24"
          width="22"
        >
          <path
            d="M7.5 7.5 16.5 16.5M16.5 7.5 7.5 16.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      </span>
    </button>
  );
}

function HeaderMenuOverlayItems() {
  return (
    <>
      {HEADER_MENU_SECTIONS.map((section) => (
        <section className="site-header__menu-section" key={section.heading}>
          <h2 className="site-header__menu-heading">{section.heading}</h2>
          {section.items.map((item) => (
            <p className="site-header__menu-item" key={item}>
              {item}
              <span
                aria-hidden="true"
                className="site-header__menu-item-marker"
              >
                {HEADER_LOCATION_UNAVAILABLE_MARKER}
              </span>
            </p>
          ))}
        </section>
      ))}
    </>
  );
}

function setMeasuredLocationWidth(
  root: HTMLElement,
  propertyName: string,
  element: HTMLElement
) {
  const measuredWidth = Math.max(
    element.getBoundingClientRect().width,
    element.scrollWidth
  );

  if (measuredWidth > 0) {
    root.style.setProperty(propertyName, `${Math.ceil(measuredWidth)}px`);
  }
}

function HeaderLocationSelect() {
  const locationMenuId = useId();
  const locationButtonRef = useRef<HTMLButtonElement>(null);
  const perthMeasureRef = useRef<HTMLSpanElement>(null);
  const boorlooMeasureRef = useRef<HTMLSpanElement>(null);
  const [selectedLocation, setSelectedLocation] =
    useState<HeaderLocationOption>("Perth");
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);
  const selectedLocationLabel = getHeaderLocationOptionLabel(selectedLocation);
  const locationButtonLabel = `Choose city: ${selectedLocationLabel}`;
  const combobox = useCombobox({
    opened: isLocationMenuOpen,
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      setIsLocationMenuOpen(false);
    },
    onDropdownOpen: () => {
      setIsLocationMenuOpen(true);
    }
  });

  useEffect(() => {
    syncHomepageHeaderLocationMenuOpenState(isLocationMenuOpen);

    return () => {
      syncHomepageHeaderLocationMenuOpenState(false);
    };
  }, [isLocationMenuOpen]);

  useEffect(() => {
    const root = locationButtonRef.current;
    const perthMeasure = perthMeasureRef.current;
    const boorlooMeasure = boorlooMeasureRef.current;

    if (!root || !perthMeasure || !boorlooMeasure) {
      return;
    }

    let cancelled = false;

    const syncMeasuredWidths = () => {
      if (cancelled) {
        return;
      }

      setMeasuredLocationWidth(
        root,
        "--site-header-location-perth-width",
        perthMeasure
      );
      setMeasuredLocationWidth(
        root,
        "--site-header-location-boorloo-width",
        boorlooMeasure
      );
    };

    syncMeasuredWidths();

    const fonts = (
      document as Document & { fonts?: { ready: Promise<unknown> } }
    ).fonts;
    void fonts?.ready.then(syncMeasuredWidths).catch(() => {});

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncMeasuredWidths);

    resizeObserver?.observe(perthMeasure);
    resizeObserver?.observe(boorlooMeasure);
    window.addEventListener("resize", syncMeasuredWidths);

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncMeasuredWidths);
    };
  }, []);

  function handleLocationSubmit(value: string) {
    const nextLocation = resolveHeaderLocationSelection(value);

    if (nextLocation) {
      setSelectedLocation(nextLocation);
      combobox.closeDropdown();
    }
  }

  return (
    <Combobox
      dropdownPadding={0}
      offset={8}
      onOptionSubmit={handleLocationSubmit}
      position="bottom-end"
      store={combobox}
      withinPortal={false}
      zIndex={30}
    >
      <Combobox.Target
        targetType="button"
        withAriaAttributes={false}
        withKeyboardNavigation={false}
      >
        <button
          aria-controls={locationMenuId}
          aria-expanded={isLocationMenuOpen}
          aria-haspopup="listbox"
          aria-label={locationButtonLabel}
          className="site-header__location"
          data-state={isLocationMenuOpen ? "open" : "closed"}
          onClick={() => combobox.toggleDropdown()}
          ref={locationButtonRef}
          title={locationButtonLabel}
          type="button"
        >
          <span className="site-header__location-text" aria-hidden="true">
            <span className="site-header__location-name">
              <span className="site-header__location-name-word site-header__location-name-word--perth">
                Perth
              </span>
              <span className="site-header__location-name-word site-header__location-name-word--boorloo">
                Boorloo
              </span>
            </span>
            <span className="site-header__location-static-name">
              {selectedLocationLabel}
            </span>
          </span>
          <HeaderLocationChevron />
          <span
            aria-hidden="true"
            className="site-header__location-measurements"
          >
            <span
              className="site-header__location-measurement"
              ref={perthMeasureRef}
            >
              Perth
            </span>
            <span
              className="site-header__location-measurement"
              ref={boorlooMeasureRef}
            >
              Boorloo
            </span>
          </span>
        </button>
      </Combobox.Target>
      {isLocationMenuOpen ? (
        <Combobox.Dropdown
          className="site-header__location-popover"
          id={locationMenuId}
        >
          <Combobox.Options
            aria-label="City options"
            className="site-header__location-options"
          >
            {HEADER_LOCATION_OPTIONS.map((location) => {
              const isAvailable = isHeaderLocationAvailable(location);
              const unavailableMarker =
                getHeaderLocationUnavailableMarker(location);

              return (
                <Combobox.Option
                  className="site-header__location-option"
                  data-selected={
                    selectedLocation === location ? "true" : undefined
                  }
                  disabled={!isAvailable}
                  key={location}
                  value={location}
                >
                  <span className="site-header__location-option-label">
                    {getHeaderLocationOptionLabel(location)}
                  </span>
                  {unavailableMarker ? (
                    <span
                      aria-hidden="true"
                      className="site-header__location-option-marker"
                    >
                      {unavailableMarker}
                    </span>
                  ) : null}
                </Combobox.Option>
              );
            })}
          </Combobox.Options>
        </Combobox.Dropdown>
      ) : null}
    </Combobox>
  );
}

export function HomepageTopPanelControls({
  activeDateKey,
  availableDateKeys,
  currentQuery,
  initialHeaderMenuState = "closed",
  initialFilterPanelVisible = false,
  selectedVenues
}: HomepageTopPanelControlsProps) {
  const filterPanelId = useId();
  const headerMenuId = useId();
  const headerMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const headerMenuOverlayRef = useRef<HTMLDivElement | null>(null);
  const [isFilterPanelVisible, setIsFilterPanelVisible] = useState(
    initialFilterPanelVisible
  );
  const [headerMenuState, setHeaderMenuState] =
    useState<HeaderMenuState>(initialHeaderMenuState);
  const headerMenuPresentation = getHeaderMenuButtonStates(headerMenuState);
  const hasActiveFilters =
    currentQuery.trim().length > 0 || selectedVenues.length > 0;
  const filterToggleLabel = isFilterPanelVisible
    ? "Hide search and venue filters"
    : "Show search and venue filters";
  const toggleFilterPanel = () => {
    setIsFilterPanelVisible((current) => !current);
  };

  function closeHeaderMenu() {
    setHeaderMenuState((current) => {
      if (current === "closed") {
        return current;
      }

      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      return prefersReducedMotion ? "closed" : "closing";
    });
  }

  function toggleHeaderMenu() {
    if (headerMenuState === "open") {
      closeHeaderMenu();
      return;
    }

    setHeaderMenuState("open");
  }

  useEffect(() => {
    if (headerMenuState !== "closing") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHeaderMenuState("closed");
    }, HEADER_MENU_FADE_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [headerMenuState]);

  useEffect(() => {
    if (!headerMenuPresentation.isOverlayMounted) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        headerMenuButtonRef.current?.contains(target) ||
        headerMenuOverlayRef.current?.contains(target)
      ) {
        return;
      }

      closeHeaderMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeHeaderMenu();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [headerMenuPresentation.isOverlayMounted]);

  return (
    <>
      <SiteHeaderActions showProfile={false}>
        <HeaderLocationSelect />
        <FilterPanelToggleButton
          controls={filterPanelId}
          isExpanded={isFilterPanelVisible}
          label={filterToggleLabel}
          onClick={toggleFilterPanel}
          placement="header"
          showActiveFilterMarker={hasActiveFilters && !isFilterPanelVisible}
        />
        <HeaderMenuButton
          buttonRef={headerMenuButtonRef}
          controls={headerMenuId}
          onClick={toggleHeaderMenu}
          presentation={headerMenuPresentation}
        />
      </SiteHeaderActions>
      <div
        aria-hidden={!headerMenuPresentation.ariaOpen}
        className="site-header__menu-overlay"
        data-state={headerMenuState}
        hidden={!headerMenuPresentation.isOverlayMounted}
        id={headerMenuId}
        onClick={closeHeaderMenu}
      >
        <div
          className="site-header__menu-overlay-content"
          onClick={(event) => event.stopPropagation()}
          ref={headerMenuOverlayRef}
        >
          <HeaderMenuOverlayItems />
        </div>
      </div>
      <div className="top-panel__filters">
        <div
          className="top-panel__filters-layout"
          data-filter-panel-visible={
            isFilterPanelVisible ? "true" : "false"
          }
        >
          <HomepageFilters
            activeDateKey={activeDateKey}
            availableDateKeys={availableDateKeys}
            currentQuery={currentQuery}
            filterPanelId={filterPanelId}
            isFilterPanelVisible={isFilterPanelVisible}
            selectedVenues={selectedVenues}
          />
          <FilterPanelToggleButton
            controls={filterPanelId}
            isExpanded={isFilterPanelVisible}
            label={filterToggleLabel}
            onClick={toggleFilterPanel}
            placement="panel"
            showActiveFilterMarker={hasActiveFilters && !isFilterPanelVisible}
          />
        </div>
      </div>
    </>
  );
}
