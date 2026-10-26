import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type BoardData = {
  id: string;
  owner_id: string;
  title: string;
  elements: unknown[];
  app_state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

let supabaseClient: SupabaseClient | null = null;

/**
 * Returns the browser Supabase client.
 *
 * Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in
 * excalidraw-app/.env.local. Never use a service-role/secret key here.
 */
export const getSupabaseClient = (): SupabaseClient => {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to excalidraw-app/.env.local, then restart the dev server.",
    );
  }

  supabaseClient = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
};

const requireUserId = async (): Promise<string> => {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }
  if (!user) {
    throw new Error("Sign in before accessing cloud boards.");
  }

  return user.id;
};

export const listMyBoards = async (): Promise<BoardData[]> => {
  const supabase = getSupabaseClient();
  await requireUserId();

  const { data, error } = await supabase
    .from("boards")
    .select("id, owner_id, title, elements, app_state, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as BoardData[];
};

export const createBoard = async (
  title = "Untitled board",
  elements: unknown[] = [],
  appState: Record<string, unknown> = {},
): Promise<BoardData> => {
  const supabase = getSupabaseClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("boards")
    .insert({
      owner_id: ownerId,
      title,
      elements,
      app_state: appState,
    })
    .select("id, owner_id, title, elements, app_state, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data as BoardData;
};

export const loadBoard = async (boardId: string): Promise<BoardData> => {
  const supabase = getSupabaseClient();
  await requireUserId();

  const { data, error } = await supabase
    .from("boards")
    .select("id, owner_id, title, elements, app_state, created_at, updated_at")
    .eq("id", boardId)
    .single();

  if (error) {
    throw error;
  }

  return data as BoardData;
};

export const saveBoard = async (
  boardId: string,
  updates: {
    title?: string;
    elements?: unknown[];
    app_state?: Record<string, unknown>;
  },
): Promise<void> => {
  const supabase = getSupabaseClient();
  await requireUserId();

  const { error } = await supabase
    .from("boards")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", boardId);

  if (error) {
    throw error;
  }
};

export const deleteBoard = async (boardId: string): Promise<void> => {
  const supabase = getSupabaseClient();
  await requireUserId();

  const { error } = await supabase.from("boards").delete().eq("id", boardId);

  if (error) {
    throw error;
  }
};
