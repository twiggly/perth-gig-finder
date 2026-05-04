import Image from "next/image";
import React from "react";

export function SiteHeaderBrand() {
  return (
    <>
      <Image
        alt=""
        className="site-header__logo-mark"
        height={200}
        src="/logo.svg"
        unoptimized
        width={200}
      />
      <h1 className="site-header__title">
        <span className="site-header__title-text">Gig Radar</span>
      </h1>
    </>
  );
}
