import Image from "next/image";
import React from "react";

import { SiteHeaderBrandLink } from "./site-header-brand-link";

export function SiteHeaderBrand({
  asHeading = true
}: {
  asHeading?: boolean;
}) {
  const titleText = (
    <span className="site-header__title-text">Gig Radar</span>
  );

  return (
    <SiteHeaderBrandLink>
      <Image
        alt=""
        className="site-header__logo-mark"
        height={196}
        priority
        src="/logo.svg"
        unoptimized
        width={196}
      />
      {asHeading ? (
        <h1 className="site-header__title">{titleText}</h1>
      ) : (
        <span className="site-header__title">{titleText}</span>
      )}
    </SiteHeaderBrandLink>
  );
}
