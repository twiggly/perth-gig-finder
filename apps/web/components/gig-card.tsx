"use client";

import React, { useEffect, useRef } from "react";
import Image from "next/image";
import { Anchor, Box, Text, Title, UnstyledButton } from "@mantine/core";

import { getGigActions } from "@/lib/gig-actions";
import { formatGigCardArtists } from "@/lib/gig-card-artists";
import {
  getRenderableGigImageUrl,
  hasRenderableGigImage,
  type GigCardRecord
} from "@/lib/gigs";

const GIG_CARD_IMAGE_SIZES =
  "(max-width: 480px) 88px, (max-width: 720px) 115px, 168px";
const GIG_CARD_IMAGE_QUALITY = 72;

function formatGigDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Perth"
  }).format(new Date(value));
}

function formatVenueLine(gig: GigCardRecord): string {
  return gig.venue_suburb ? `${gig.venue_name}, ${gig.venue_suburb}` : gig.venue_name;
}

function VenueMapIcon() {
  return (
    <svg
      aria-hidden="true"
      className="gig-card__venue-icon"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        clipRule="evenodd"
        d="M12 2a7 7 0 0 0-7 7c0 5.86 7 12 7 12s7-6.14 7-12a7 7 0 0 0-7-7Zm0 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}

interface GigCardProps {
  gig: GigCardRecord;
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

export function GigCard({ gig, isOpen, onClose, onToggle }: GigCardProps) {
  const articleRef = useRef<HTMLElement>(null);
  const actions = getGigActions(gig);
  const isActionable = actions.length > 0;
  const imageUrl = getRenderableGigImageUrl(gig);
  const hasRenderableImage = hasRenderableGigImage(gig) && Boolean(imageUrl);
  const artistLine = formatGigCardArtists(gig.title, gig.artist_names);
  const imageWidth = hasRenderableImage ? gig.image_width! : undefined;
  const imageHeight = hasRenderableImage ? gig.image_height! : undefined;
  const surfaceClassName = [
    "gig-card__surface",
    isActionable ? "gig-card__surface--interactive" : "gig-card__surface--static",
    hasRenderableImage ? "" : "gig-card__surface--no-media"
  ]
    .filter(Boolean)
    .join(" ");
  const articleClassName = [
    "gig-card",
    isActionable ? "gig-card--interactive" : "",
    isOpen ? "gig-card--open" : ""
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        articleRef.current &&
        event.target instanceof Node &&
        !articleRef.current.contains(event.target)
      ) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const content = (
    <>
      {hasRenderableImage && imageUrl ? (
        <Box className="gig-card__media">
          <Image
            alt={`${gig.title} poster`}
            className="gig-card__media-image"
            height={imageHeight}
            quality={GIG_CARD_IMAGE_QUALITY}
            sizes={GIG_CARD_IMAGE_SIZES}
            src={imageUrl}
            style={{ height: "auto", width: "100%" }}
            width={imageWidth}
          />
        </Box>
      ) : null}
      <Box className="gig-card__body">
        <Text className="gig-card__time" component="p">
          {formatGigDate(gig.starts_at)}
        </Text>
        <Title className="gig-card__title" order={2}>
          {gig.title}
        </Title>
        {artistLine ? (
          <Text className="gig-card__artists" component="p">
            {artistLine}
          </Text>
        ) : null}
        <Text className="gig-card__venue" component="p">
          <VenueMapIcon />
          {formatVenueLine(gig)}
        </Text>
      </Box>
    </>
  );

  return (
    <article
      className={articleClassName}
      data-action-count={actions.length}
      ref={articleRef}
    >
      {isActionable ? (
        <UnstyledButton
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={`Open links for ${gig.title}`}
          className={surfaceClassName}
          onClick={onToggle}
          type="button"
        >
          {content}
        </UnstyledButton>
      ) : (
        <Box className={surfaceClassName}>{content}</Box>
      )}
      {isOpen ? (
        <div
          aria-label={`${gig.title} links`}
          className="gig-card__popover"
          role="dialog"
        >
          <div className="gig-card__actions">
            {actions.map((action) => (
              <Anchor
                className="gig-card__action"
                href={action.href}
                key={action.key}
                onClick={onClose}
                rel="noreferrer"
                target="_blank"
              >
                {action.label}
              </Anchor>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}
