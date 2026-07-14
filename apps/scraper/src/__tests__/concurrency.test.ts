import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "../source-utils/concurrency";

describe("mapWithConcurrency", () => {
  it("bounds in-flight work while preserving result order", async () => {
    let active = 0;
    let maxActive = 0;
    const results = await mapWithConcurrency([3, 1, 2, 0], 2, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active -= 1;
      return `value-${value}`;
    });

    expect(maxActive).toBe(2);
    expect(results).toEqual(["value-3", "value-1", "value-2", "value-0"]);
  });

  it("stops scheduling later work after a rejection", async () => {
    const started: number[] = [];

    await expect(
      mapWithConcurrency([0, 1, 2, 3], 2, async (value) => {
        started.push(value);

        if (value === 0) {
          throw new Error("failed");
        }

        await new Promise((resolve) => setTimeout(resolve, 5));
        return value;
      })
    ).rejects.toThrow("failed");
    expect(started).toEqual([0, 1]);
  });

  it("rejects invalid concurrency values", async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => value)).rejects.toThrow(
      "Concurrency must be a positive integer"
    );
  });
});
