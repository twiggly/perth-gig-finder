import React from "react";

import { SiteFooter } from "@/components/site-footer";

export function PublicPageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="page-shell discovery-page">{children}</main>
      <SiteFooter />
    </>
  );
}
