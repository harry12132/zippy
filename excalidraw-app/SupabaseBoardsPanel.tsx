import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  createBoard,
  getSupabaseClient,
  listMyBoards,
  loadBoard,
  saveBoard,
  type BoardData,
} from "./data/supabase";

type Props = {
  api: ExcalidrawImperativeAPI | null;
};

const panelStyle: CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: 16,
  zIndex: 1000,
  width: 280,
  maxWidth: "calc(100vw - 32px)",
  padding: 14,
  border: "1px solid var(--default-border-color, #dedede)",
  borderRadius: 14,
  background: "var(--island-bg-color, #fff)",
  color: "var(--text-primary-color, #222)",
  boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
  fontFamily: "inherit",
  fontSize: 13,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 10px",
  border: "1px solid #d5d5d5",
  borderRadius: 8,
  background: "transparent",
  color: "inherit",
  font: "inherit",
};

const buttonStyle: CSSProperties = {
  padding: "9px 10px",
  border: "1px solid #d5d5d5",
  borderRadius: 8,
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
};

const friendlyError = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

export const SupabaseBoardsPanel = ({ api }: Props) => {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardData[]>([]);
  const [boardId, setBoardId] = useState<string | null>(
    new URLSearchParams(window.location.search).get("board"),
  );
  const [title, setTitle] = useState("Untitled board");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refreshBoards = useCallback(async () => {
    const result = await listMyBoards();
    setBoards(result);
  }, []);

  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      setConfigured(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
      if (!session) {
        setBoards([]);
        setBoardId(null);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userEmail) {
      return;
    }
    refreshBoards().catch((error) => setMessage(friendlyError(error)));
  }, [userEmail, refreshBoards]);

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = getSupabaseClient();
      const { error } = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }
      setMessage(
        isSignUp
          ? "Account created. If email confirmation is enabled, check your inbox before signing in."
          : "Signed in successfully.",
      );
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!api) {
      setMessage("The drawing editor is still loading.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const elements = api.getSceneElements() as readonly ExcalidrawElement[];
      const appState = JSON.parse(
        JSON.stringify(api.getAppState()),
      ) as Record<string, unknown>;

      if (boardId) {
        await saveBoard(boardId, {
          title: title.trim() || "Untitled board",
          elements: elements as unknown[],
          app_state: appState,
        });
      } else {
        const board = await createBoard(
          title.trim() || "Untitled board",
          elements as unknown[],
          appState,
        );
        setBoardId(board.id);
        const url = new URL(window.location.href);
        url.searchParams.set("board", board.id);
        window.history.replaceState({}, "", url);
      }

      await refreshBoards();
      setMessage("Board saved.");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenBoard = async (id: string) => {
    if (!api) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const board = await loadBoard(id);
      api.updateScene({
        elements: board.elements as ExcalidrawElement[],
        appState: board.app_state as AppState,
        commitToHistory: true,
      });
      setBoardId(board.id);
      setTitle(board.title);
      const url = new URL(window.location.href);
      url.searchParams.set("board", board.id);
      window.history.replaceState({}, "", url);
      setMessage("Board loaded.");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleNewBoard = () => {
    setBoardId(null);
    setTitle("Untitled board");
    api?.resetScene();
    const url = new URL(window.location.href);
    url.searchParams.delete("board");
    window.history.replaceState({}, "", url);
    setMessage("New board ready. Save it to keep it in your account.");
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) {
        throw error;
      }
      setMessage("Signed out.");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={panelStyle}>
      <button
        type="button"
        style={{ ...buttonStyle, width: "100%", display: "flex", justifyContent: "space-between" }}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>Cloud boards</span>
        <span>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {!configured ? (
            <p style={{ margin: 0 }}>
              Supabase isn’t configured. Check the VITE_SUPABASE_URL and
              VITE_SUPABASE_PUBLISHABLE_KEY values in excalidraw-app/.env.local,
              then restart the dev server.
            </p>
          ) : !userEmail ? (
            <form onSubmit={handleAuth} style={{ display: "grid", gap: 8 }}>
              <strong>{isSignUp ? "Create your Zippy account" : "Sign in to Zippy"}</strong>
              <input
                style={inputStyle}
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <input
                style={inputStyle}
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                placeholder="Password (at least 6 characters)"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
              <button type="submit" style={buttonStyle} disabled={busy}>
                {busy ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
              </button>
              <button
                type="button"
                style={{ ...buttonStyle, border: 0 }}
                onClick={() => setIsSignUp((value) => !value)}
              >
                {isSignUp ? "Already have an account? Sign in" : "New to Zippy? Create an account"}
              </button>
            </form>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  title={userEmail}
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}
                >
                  {userEmail}
                </span>
                <button type="button" style={buttonStyle} onClick={handleSignOut} disabled={busy}>
                  Sign out
                </button>
              </div>
              <input
                style={inputStyle}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                aria-label="Board title"
                placeholder="Board title"
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button type="button" style={buttonStyle} onClick={handleSave} disabled={busy || !api}>
                  {busy ? "Saving…" : boardId ? "Save board" : "Save new board"}
                </button>
                <button type="button" style={buttonStyle} onClick={handleNewBoard} disabled={busy}>
                  New board
                </button>
              </div>
              <strong>Your boards</strong>
              {boards.length === 0 ? (
                <span>No saved boards yet.</span>
              ) : (
                <div style={{ display: "grid", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                  {boards.map((board) => (
                    <button
                      type="button"
                      key={board.id}
                      style={{ ...buttonStyle, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}
                      onClick={() => handleOpenBoard(board.id)}
                      disabled={busy}
                    >
                      {board.title}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {message && (
            <p role="status" style={{ margin: 0, overflowWrap: "anywhere" }}>
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default SupabaseBoardsPanel;
