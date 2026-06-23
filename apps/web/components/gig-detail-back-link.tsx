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
      <span aria-hidden="true">←</span>
    </Link>
  );
}
