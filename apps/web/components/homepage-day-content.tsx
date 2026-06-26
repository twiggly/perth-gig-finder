"use client";

import React, { type CSSProperties } from "react";
import { Box } from "@mantine/core";

import { GigCard } from "@/components/gig-card";
import { getRenderableGigImage } from "@/lib/gigs";
import type { HomepageDayPayload } from "@/lib/homepage-day-loading";
import type { SwipeDirection } from "@/lib/homepage-dates";
import type { DayBrowserPaneState } from "./use-homepage-day-navigation";

interface HomepageDayContentProps {
  activeDateKey: string;
  contentViewportStyle: CSSProperties;
  isContentAnimating: boolean;
  loadedDayMap: Map<string, HomepageDayPayload>;
  onCloseGig: (gigId: string) => void;
  onToggleGig: (gigId: string) => void;
  openGigId: string | null;
  renderedContentPanes: DayBrowserPaneState[];
  scrollAlignmentDateKey: string | null;
  scrollCarryoverDateKey: string | null;
  scrollOutgoingCompensationDateKey: string | null;
  scrollRestorationAlignmentDateKey: string | null;
  scrollReserveTargetDateKey: string | null;
  scrollTargetContentRef: React.Ref<HTMLDivElement>;
  transitionDirection?: SwipeDirection;
}

export function HomepageDayContent({
  activeDateKey,
  contentViewportStyle,
  isContentAnimating,
  loadedDayMap,
  onCloseGig,
  onToggleGig,
  openGigId,
  renderedContentPanes,
  scrollAlignmentDateKey,
  scrollCarryoverDateKey,
  scrollOutgoingCompensationDateKey,
  scrollRestorationAlignmentDateKey,
  scrollReserveTargetDateKey,
  scrollTargetContentRef,
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
          const isActivePane =
            motionRole === "active" && dateKey === activeDateKey;
          const isScrollReserveTarget =
            dateKey === scrollReserveTargetDateKey &&
            (motionRole === "active" || motionRole === "to");
          const isScrollReserveCarryover =
            dateKey === scrollCarryoverDateKey && !isScrollReserveTarget;
          const isScrollAlignTarget =
            dateKey === scrollAlignmentDateKey &&
            motionRole === "to" &&
            phase !== "settling";
          const isScrollRestorationAlignTarget =
            dateKey === scrollRestorationAlignmentDateKey &&
            (motionRole === "active" || motionRole === "to");
          const isScrollOutgoingCompensationTarget =
            dateKey === scrollOutgoingCompensationDateKey &&
            motionRole === "from";

          if (!day) {
            return null;
          }

          const likelyLcpGigId = isActivePane
            ? day.items.find((gig) => Boolean(getRenderableGigImage(gig)))?.id ??
              null
            : null;

          return (
            <Box
              aria-hidden={motionRole === "from"}
              className="day-browser__content-pane"
              data-motion-role={motionRole}
              data-phase={phase ?? undefined}
              data-scroll-reserve-carryover={
                isScrollReserveCarryover ? "true" : undefined
              }
              data-scroll-reserve-target={
                isScrollReserveTarget ? "true" : undefined
              }
              key={dateKey}
            >
              <Box
                className="day-browser__content-align"
                data-scroll-compensate-outgoing={
                  isScrollOutgoingCompensationTarget ? "true" : undefined
                }
                data-scroll-align-target={
                  isScrollAlignTarget || isScrollRestorationAlignTarget
                    ? "true"
                    : undefined
                }
              >
                <Box
                  className="gig-grid"
                  data-active-date={isActivePane ? "true" : undefined}
                  data-date={dateKey}
                  ref={
                    isScrollReserveTarget ? scrollTargetContentRef : undefined
                  }
                >
                  {day.items.map((gig) => (
                    <GigCard
                      gig={gig}
                      isLikelyLcpImage={gig.id === likelyLcpGigId}
                      isOpen={openGigId === gig.id}
                      key={gig.id}
                      onClose={() => onCloseGig(gig.id)}
                      onToggle={() => onToggleGig(gig.id)}
                    />
                  ))}
                </Box>
                <span
                  aria-hidden="true"
                  className="day-browser__scroll-reserve"
                />
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
