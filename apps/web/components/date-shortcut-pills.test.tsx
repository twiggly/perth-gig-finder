import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import { theme } from "@/app/theme";

import { DateShortcutPills } from "./date-shortcut-pills";

const FRIDAY_IN_PERTH = new Date("2026-05-01T04:00:00.000Z");

function renderPills({
  activeDateKey = null,
  availableDateKeys = [],
  isPending = false
}: {
  activeDateKey?: string | null;
  availableDateKeys?: string[];
  isPending?: boolean;
} = {}) {
  return renderToStaticMarkup(
    <MantineProvider defaultColorScheme="dark" theme={theme}>
      <DateShortcutPills
        activeDateKey={activeDateKey}
        availableDateKeys={availableDateKeys}
        isPending={isPending}
        now={FRIDAY_IN_PERTH}
        onNavigate={() => {}}
      />
    </MantineProvider>
  );
}

describe("DateShortcutPills", () => {
  it("renders available shortcut buttons", () => {
    const html = renderPills({
      availableDateKeys: ["2026-05-01", "2026-05-02"]
    });

    expect(html).toContain('aria-label="Jump to date"');
    expect(html).toContain("Today");
    expect(html).toContain("This weekend");
  });

  it("marks the active shortcut with aria-pressed", () => {
    const html = renderPills({
      activeDateKey: "2026-05-01",
      availableDateKeys: ["2026-05-01", "2026-05-02"]
    });

    expect(html).toContain('aria-pressed="true"');
  });

  it("keeps shortcut buttons disabled while navigation is pending", () => {
    const html = renderPills({
      availableDateKeys: ["2026-05-01"],
      isPending: true
    });

    expect(html).toContain("disabled");
  });

  it("renders no markup when no shortcut targets exist", () => {
    const html = renderToStaticMarkup(
      <DateShortcutPills
        activeDateKey={null}
        availableDateKeys={[]}
        isPending={false}
        now={FRIDAY_IN_PERTH}
        onNavigate={() => {}}
      />
    );

    expect(html).toBe("");
  });
});
