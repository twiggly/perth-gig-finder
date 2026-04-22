import { describe, expect, it, vi } from "vitest";

import {
  isTransientSupabaseErrorMessage,
  retryTransientSupabaseOperation
} from "../supabase-retry";

describe("supabase retry", () => {
  it("detects transient cloudflare gateway errors", () => {
    expect(
      isTransientSupabaseErrorMessage(
        "<html><head><title>502 Bad Gateway</title></head><body><center>cloudflare</center></body></html>"
      )
    ).toBe(true);
    expect(isTransientSupabaseErrorMessage("504 Gateway Timeout")).toBe(true);
  });

  it("does not mark ordinary validation errors as transient", () => {
    expect(
      isTransientSupabaseErrorMessage("duplicate key value violates unique constraint")
    ).toBe(false);
  });

  it("retries transient failures and eventually succeeds", async () => {
    const execute = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new Error("<html><head><title>502 Bad Gateway</title></head><center>cloudflare</center>")
      )
      .mockResolvedValueOnce("ok");

    await expect(
      retryTransientSupabaseOperation(execute, { delaysMs: [0] })
    ).resolves.toBe("ok");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient failures", async () => {
    const execute = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"));

    await expect(
      retryTransientSupabaseOperation(execute, { delaysMs: [0] })
    ).rejects.toThrow("duplicate key value violates unique constraint");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
