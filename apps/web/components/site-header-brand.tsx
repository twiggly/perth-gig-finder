import Image from "next/image";
import React from "react";

import { SiteHeaderBrandLink } from "./site-header-brand-link";

export function SiteHeaderBrand() {
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
      <h1 className="site-header__title">
        <span className="site-header__title-text">Gig Radar</span>
      </h1>
    </SiteHeaderBrandLink>
  );
}
