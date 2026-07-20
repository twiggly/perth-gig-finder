import React from "react";
import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/tonight", label: "Tonight" },
  { href: "/this-weekend", label: "This weekend" },
  { href: "/gigs", label: "All gigs" },
  { href: "/venues", label: "Venues" },
  { href: "/about", label: "About" }
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Site">
        {FOOTER_LINKS.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
      <p>Independent live music listings for Perth (Boorloo).</p>
    </footer>
  );
}
