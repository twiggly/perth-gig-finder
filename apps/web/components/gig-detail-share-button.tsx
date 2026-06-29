"use client";

import React, { useEffect, useState } from "react";

import { buildGigDetailUrl } from "@/lib/seo";

const COPIED_MESSAGE_TIMEOUT_MS = 2_000;

interface GigDetailShareButtonProps {
  slug: string;
  title: string;
}

export function buildGigDetailSharePayload({
  slug,
  title
}: GigDetailShareButtonProps): ShareData {
  return {
    text: `Check out ${title} on Gig Radar.`,
    title,
    url: buildGigDetailUrl(slug)
  };
}

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      className="gig-detail__share-icon"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M18 16.1c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11A2.99 2.99 0 1 0 15 5c0 .24.04.47.09.7L8.04 9.81a3 3 0 1 0 0 4.38l7.12 4.18c-.05.2-.07.41-.07.63a2.91 2.91 0 1 0 2.91-2.9Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function GigDetailShareButton({
  slug,
  title
}: GigDetailShareButtonProps) {
  const [message, setMessage] = useState("");
  const payload = buildGigDetailSharePayload({ slug, title });

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, COPIED_MESSAGE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [message]);

  async function handleClick() {
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }

      await navigator.clipboard.writeText(payload.url ?? "");
      setMessage("Copied link");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    }
  }

  return (
    <div className="gig-detail__share">
      <button
        aria-label="Share gig"
        className="gig-detail__share-button"
        data-share-url={payload.url}
        onClick={handleClick}
        type="button"
      >
        <ShareIcon />
        <span className="gig-detail__toolbar-label">Share</span>
      </button>
      <span aria-live="polite" className="gig-detail__share-status">
        {message}
      </span>
    </div>
  );
}
