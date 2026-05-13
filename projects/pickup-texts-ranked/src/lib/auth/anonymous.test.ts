import { describe, expect, it, vi } from "vitest";

import { ensureAnonymousUser, type SupabaseLike } from "./anonymous";

describe("ensureAnonymousUser", () => {
  it("returns existing user when auth.getUser returns a user and does not call signInAnonymously", async () => {
    const supabase: SupabaseLike = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "existing-user" } },
          error: null,
        }),
        signInAnonymously: vi.fn(),
      },
    };

    await expect(ensureAnonymousUser(supabase)).resolves.toEqual({ id: "existing-user" });
    expect(supabase.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when no user exists", async () => {
    const supabase: SupabaseLike = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
        signInAnonymously: vi.fn().mockResolvedValue({
          data: { user: { id: "anonymous-user" } },
          error: null,
        }),
      },
    };

    await expect(ensureAnonymousUser(supabase)).resolves.toEqual({ id: "anonymous-user" });
    expect(supabase.auth.signInAnonymously).toHaveBeenCalledOnce();
  });

  it("throws a readable error when anonymous sign-in fails", async () => {
    const supabase: SupabaseLike = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
        signInAnonymously: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Anonymous sign-ins are disabled" },
        }),
      },
    };

    await expect(ensureAnonymousUser(supabase)).rejects.toThrow(
      "Anonymous sign-ins are disabled",
    );
  });
});
