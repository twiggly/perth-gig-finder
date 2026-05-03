"use client";

import { MantineProvider } from "@mantine/core";

import { createAppColorSchemeManager } from "@/lib/color-scheme";

import { theme } from "./theme";

const colorSchemeManager = createAppColorSchemeManager();

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider
      colorSchemeManager={colorSchemeManager}
      defaultColorScheme="dark"
      theme={theme}
    >
      {children}
    </MantineProvider>
  );
}
