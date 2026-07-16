import { describe, expect, it, vi } from "vitest";

import {
  fetchTixelHtml,
  readResponseTextWithinLimit
} from "../tixel-enrichment/request";

describe("Tixel HTTP requests", () => {
  it("returns HTML within the response limit", async () => {
    await expect(
      readResponseTextWithinLimit(
        new Response("<html>ok</html>", {
          headers: { "content-type": "text/html" }
        }),
        100
      )
    ).resolves.toBe("<html>ok</html>");
  });

  it("rejects declared and streamed bodies above the response limit", async () => {
    await expect(
      readResponseTextWithinLimit(
        new Response("small", { headers: { "content-length": "101" } }),
        100
      )
    ).rejects.toThrow("size limit");
    await expect(
      readResponseTextWithinLimit(new Response("too large"), 4)
    ).rejects.toThrow("size limit");
  });

  it("retries one transient response and keeps missing pages distinct", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response("<html>ok</html>", {
          headers: { "content-type": "text/html" },
          status: 200
        })
      );

    await expect(
      fetchTixelHtml("https://tixel.com/au/discover/Perth/music-tickets", {
        fetchImpl,
        retryDelayMs: 0
      })
    ).resolves.toMatchObject({ html: "<html>ok</html>", status: "ok" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await expect(
      fetchTixelHtml("https://tixel.com/au/music-tickets/2026/07/18/missing", {
        fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
      })
    ).resolves.toEqual({ status: "missing" });
  });
});
