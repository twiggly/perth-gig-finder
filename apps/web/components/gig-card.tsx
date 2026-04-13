"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

import { getGigActions } from "@/lib/gig-actions";
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
  const imageWidth = hasRenderableImage ? gig.image_width! : undefined;
  const imageHeight = hasRenderableImage ? gig.image_height! : undefined;
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
      <div className="gig-card__media">
        {hasRenderableImage && imageUrl ? (
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
        ) : (
          <div aria-hidden="true" className="gig-card__media-fallback">
            <span>Perth Gig Finder</span>
          </div>
        )}
      </div>
      <div className="gig-card__body">
        <h2>{gig.title}</h2>
        <p className="gig-card__venue">{formatVenueLine(gig)}</p>
        <p className="gig-card__time">{formatGigDate(gig.starts_at)}</p>
      </div>
    </>
  );

  return (
    <article className={articleClassName} ref={articleRef}>
      {isActionable ? (
        <button
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={`Open links for ${gig.title}`}
          className="gig-card__surface gig-card__surface--interactive"
          onClick={onToggle}
          type="button"
        >
          {content}
        </button>
      ) : (
        <div className="gig-card__surface gig-card__surface--static">{content}</div>
      )}
      {isOpen ? (
        <div
          aria-label={`${gig.title} links`}
          className="gig-card__popover"
          role="dialog"
        >
          <div className="gig-card__actions">
            {actions.map((action) => (
              <a
                className="gig-card__action"
                href={action.href}
                key={action.key}
                onClick={onClose}
                rel="noreferrer"
                target="_blank"
              >
                {action.label}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}
