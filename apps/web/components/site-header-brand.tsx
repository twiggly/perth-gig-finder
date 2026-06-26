import Image from "next/image";
import Link from "next/link";
import React from "react";

export function SiteHeaderBrand() {
  return (
    <Link className="site-header__brand-link" href="/" prefetch>
      <Image
        alt=""
        className="site-header__logo-mark"
        height={196}
        priority
        src="/logo.svg"
        unoptimized
        width={196}
      />
      <h1 className="site-header__title">
        <span className="site-header__title-text">Gig Radar</span>
      </h1>
    </Link>
  );
}
