import * as cheerio from "cheerio";

import { normalizeWhitespace } from "@perth-gig-finder/shared";

export interface HtmlTextContext {
  plainText: string | null;
  lines: string[];
}

export function createHtmlTextContext(
  html: string | null | undefined,
  prepareLinesHtml: (value: string) => string = (value) => value
): HtmlTextContext {
  if (!html) {
    return {
      plainText: null,
      lines: []
    };
  }

  const preparedHtml = prepareLinesHtml(html);
  const text = cheerio.load(`<div>${preparedHtml}</div>`).text();
  const plainText = normalizeWhitespace(text);

  return {
    plainText: plainText || null,
    lines: text
      .split(/\n+/)
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean)
  };
}

export function createBlockHtmlTextContext(
  html: string | null | undefined
): HtmlTextContext {
  return createHtmlTextContext(html, (value) =>
    value
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:blockquote|div|h[1-6]|li|p)>/gi, "\n")
  );
}

export function loadHtmlFragment(html: string, rootAttribute: string) {
  const $ = cheerio.load(`<div ${rootAttribute}>${html}</div>`);

  return {
    $,
    root: $(`[${rootAttribute}]`).first()
  };
}
