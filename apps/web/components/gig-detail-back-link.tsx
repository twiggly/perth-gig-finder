"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  consumeCurrentGigDetailReturnState,
  isPlainGigDetailNavigationClick,
  readCurrentGigDetailReturnState
} from "@/lib/gig-detail-return";

interface GigDetailBackLinkProps {
  fallbackHref: string;
  slug: string;
}

function BackArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="gig-detail__toolbar-icon gig-detail__toolbar-icon--back"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M14.5 5 7.5 12l7 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
      <path
        d="M8 12h11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.6"
      />
    </svg>
  );
}

export function GigDetailBackLink({
  fallbackHref,
  slug
}: GigDetailBackLinkProps) {
  const router = useRouter();
  const [returnHref, setReturnHref] = useState<string | null>(null);

  useEffect(() => {
    setReturnHref(readCurrentGigDetailReturnState(slug)?.href ?? null);
  }, [slug]);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      !isPlainGigDetailNavigationClick({
        altKey: event.altKey,
        button: event.button,
        ctrlKey: event.ctrlKey,
        defaultPrevented: event.defaultPrevented,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        target: event.currentTarget.target
      })
    ) {
      return;
    }

    const returnState = consumeCurrentGigDetailReturnState(slug);

    if (!returnState) {
      return;
    }

    event.preventDefault();
    router.replace(returnState.href);
  }

  return (
    <Link
      aria-label="Back to gigs"
      className="gig-detail__back"
      href={returnHref ?? fallbackHref}
      onClick={handleClick}
      prefetch
    >
      <BackArrowIcon />
      <span className="gig-detail__toolbar-label">Back</span>
    </Link>
  );
}
