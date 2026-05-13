export interface SupabaseLike {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
    signInAnonymously: () => Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
  };
}

export async function ensureAnonymousUser(supabase: SupabaseLike): Promise<{ id: string }> {
  const existing = await supabase.auth.getUser();

  if (existing.data.user) {
    return { id: existing.data.user.id };
  }

  const created = await supabase.auth.signInAnonymously();

  if (created.error) {
    throw new Error(created.error.message);
  }

  if (!created.data.user) {
    throw new Error("Anonymous sign-in did not return a user.");
  }

  return { id: created.data.user.id };
}
