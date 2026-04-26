import { createTheme, type MantineColorsTuple } from "@mantine/core";

const sunset: MantineColorsTuple = [
  "#fff2ed",
  "#ffe2d8",
  "#ffc1ad",
  "#ff9b7d",
  "#ff7954",
  "#f95a37",
  "#e64825",
  "#c8391b",
  "#a93018",
  "#8c2918"
];

export const theme = createTheme({
  colors: {
    sunset
  },
  defaultRadius: "lg",
  fontFamily: "var(--font-body)",
  headings: {
    fontFamily: "var(--font-display)",
    fontWeight: "700"
  },
  primaryColor: "sunset"
});
