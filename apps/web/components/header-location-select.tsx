"use client";

import { Combobox, useCombobox } from "@mantine/core";
import React, { useEffect, useId, useRef, useState } from "react";

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

export function syncHeaderLocationMenuOpenState(
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

function HeaderLocationChevron() {
  return (
    <span aria-hidden="true" className="site-header__location-chevron">
      <svg
        className="site-header__location-chevron-icon"
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
    </span>
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

export function HeaderLocationSelect() {
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
    syncHeaderLocationMenuOpenState(isLocationMenuOpen);

    return () => {
      syncHeaderLocationMenuOpenState(false);
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
