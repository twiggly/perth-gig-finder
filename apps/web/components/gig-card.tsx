"use client";

import React, { useEffect, useRef } from "react";
import { getImageProps } from "next/image";
import Link from "next/link";
import { Anchor, Box, Text, Title, UnstyledButton } from "@mantine/core";

import { getGigActions } from "@/lib/gig-actions";
import { formatGigCardArtists } from "@/lib/gig-card-artists";
import { recordCurrentGigDetailReturnState } from "@/lib/gig-detail-return";
import {
  getRenderableGigImage,
  type GigCardRecord,
  type RenderableGigImage
} from "@/lib/gigs";
import { buildGigDetailPath } from "@/lib/seo";

const GIG_CARD_IMAGE_QUALITY = 72;
const GIG_CARD_IMAGE_STYLE = { height: "auto", width: "100%" } as const;
const GIG_CARD_IMAGE_WIDTHS = {
  compact: 88,
  desktop: 168,
  medium: 115
} as const;

export type GigCardImageLoadingIntent = "eager" | "lazy";

function getScaledImageHeight(
  image: RenderableGigImage,
  width: number
): number {
  return Math.max(1, Math.round((image.height / image.width) * width));
}

function getGigCardImageProps({
  alt,
  image,
  loadingIntent,
  width
}: {
  alt: string;
  image: RenderableGigImage;
  loadingIntent: GigCardImageLoadingIntent;
  width: number;
}) {
  return getImageProps({
    alt,
    className: "gig-card__media-image",
    height: getScaledImageHeight(image, width),
    loading: loadingIntent,
    quality: GIG_CARD_IMAGE_QUALITY,
    src: image.url,
    style: GIG_CARD_IMAGE_STYLE,
    width
  }).props;
}

function GigCardImage({
  alt,
  image,
  loadingIntent
}: {
  alt: string;
  image: RenderableGigImage;
  loadingIntent: GigCardImageLoadingIntent;
}) {
  const compactImageProps = getGigCardImageProps({
    alt,
    image,
    loadingIntent,
    width: GIG_CARD_IMAGE_WIDTHS.compact
  });
  const mediumImageProps = getGigCardImageProps({
    alt,
    image,
    loadingIntent,
    width: GIG_CARD_IMAGE_WIDTHS.medium
  });
  const desktopImageProps = getGigCardImageProps({
    alt,
    image,
    loadingIntent,
    width: GIG_CARD_IMAGE_WIDTHS.desktop
  });
  const {
    height: _generatedHeight,
    width: _generatedWidth,
    ...fallbackImageProps
  } = desktopImageProps;

  return (
    <picture className="gig-card__picture">
      <source
        media="(max-width: 480px)"
        srcSet={compactImageProps.srcSet}
      />
      <source
        media="(max-width: 720px)"
        srcSet={mediumImageProps.srcSet}
      />
      <img
        {...fallbackImageProps}
        height={image.height}
        width={image.width}
      />
    </picture>
  );
}

function formatGigDate(value: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Perth"
  }).format(new Date(value));
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

function VenueLine({
  name,
  suburb
}: {
  name: string;
  suburb: string | null;
}) {
  return (
    <span className="gig-card__venue-text">
      <span className="gig-card__venue-name">
        {name}
        {suburb ? "," : null}
      </span>
      {suburb ? (
        <>
          {" "}
          <span className="gig-card__venue-suburb">{suburb}</span>
        </>
      ) : null}
    </span>
  );
}

interface GigCardProps {
  gig: GigCardRecord;
  imageLoadingIntent?: GigCardImageLoadingIntent;
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

export function GigCard({
  gig,
  imageLoadingIntent = "lazy",
  isOpen,
  onClose,
  onToggle
}: GigCardProps) {
  const articleRef = useRef<HTMLElement>(null);
  const actions = getGigActions(gig);
  const isActionable = actions.length > 0;
  const image = getRenderableGigImage(gig);
  const artistLine = formatGigCardArtists(gig.title, gig.artist_names);
  const surfaceClassName = [
    "gig-card__surface",
    isActionable ? "gig-card__surface--interactive" : "gig-card__surface--static",
    image ? "" : "gig-card__surface--no-media"
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

  function handleDetailLinkClick(event: React.MouseEvent<HTMLAnchorElement>) {
    recordCurrentGigDetailReturnState(gig.slug, gig.starts_at, {
      altKey: event.altKey,
      button: event.button,
      ctrlKey: event.ctrlKey,
      defaultPrevented: event.defaultPrevented,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      target: event.currentTarget.target
    });
  }

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

  const media = image ? (
    <Box className="gig-card__media">
      <GigCardImage
        alt={`${gig.title} poster`}
        image={image}
        loadingIntent={imageLoadingIntent}
      />
    </Box>
  ) : null;

  const details = (
    <Box className="gig-card__body">
      <Text className="gig-card__time" component="p">
        {formatGigDate(gig.starts_at)}
      </Text>
      <Title className="gig-card__title" order={2}>
        <Link
          className="gig-card__detail-link"
          href={buildGigDetailPath(gig.slug)}
          onClick={handleDetailLinkClick}
        >
          {gig.title}
        </Link>
      </Title>
      {artistLine ? (
        <Text className="gig-card__artists" component="p">
          {artistLine}
        </Text>
      ) : null}
      <Text className="gig-card__venue" component="p">
        <VenueMapIcon />
        <VenueLine name={gig.venue_name} suburb={gig.venue_suburb} />
      </Text>
    </Box>
  );

  return (
    <article
      className={articleClassName}
      data-action-count={actions.length}
      ref={articleRef}
    >
      <Box className={surfaceClassName}>
        {isActionable ? (
          <UnstyledButton
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            aria-label={`Open links for ${gig.title}`}
            className="gig-card__toggle-overlay"
            onClick={onToggle}
            type="button"
          />
        ) : null}
        {media}
        <Box className="gig-card__content">
          {details}
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
        </Box>
      </Box>
    </article>
  );
}
