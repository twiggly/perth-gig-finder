"use client";

import React, { type CSSProperties } from "react";
import { Box } from "@mantine/core";

import { GigCard } from "@/components/gig-card";
import type { HomepageDayPayload } from "@/lib/homepage-day-loading";
import type { SwipeDirection } from "@/lib/homepage-dates";
import type { DayBrowserPaneState } from "./use-homepage-day-navigation";

interface HomepageDayContentProps {
  contentViewportStyle: CSSProperties;
  isContentAnimating: boolean;
  loadedDayMap: Map<string, HomepageDayPayload>;
  onCloseGig: (gigId: string) => void;
  onToggleGig: (gigId: string) => void;
  openGigId: string | null;
  renderedContentPanes: DayBrowserPaneState[];
  transitionDirection?: SwipeDirection;
}

export function HomepageDayContent({
  contentViewportStyle,
  isContentAnimating,
  loadedDayMap,
  onCloseGig,
  onToggleGig,
  openGigId,
  renderedContentPanes,
  transitionDirection
}: HomepageDayContentProps) {
  return (
    <Box
      className="day-browser__content-viewport"
      style={contentViewportStyle}
    >
      <Box
        className="day-browser__content-track"
        data-animating={isContentAnimating ? "true" : undefined}
        data-direction={transitionDirection}
      >
        {renderedContentPanes.map((pane) => {
          const { dateKey, motionRole, phase } = pane;
          const day = loadedDayMap.get(dateKey);

          if (!day) {
            return null;
          }

          return (
            <Box
              aria-hidden={motionRole === "from"}
              className="day-browser__content-pane"
              data-motion-role={motionRole}
              data-phase={phase ?? undefined}
              key={dateKey}
            >
              <Box className="gig-grid" data-date={dateKey}>
                {day.items.map((gig) => (
                  <GigCard
                    gig={gig}
                    isOpen={openGigId === gig.id}
                    key={gig.id}
                    onClose={() => onCloseGig(gig.id)}
                    onToggle={() => onToggleGig(gig.id)}
                  />
                ))}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
