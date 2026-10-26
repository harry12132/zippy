import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  createBoard,
  deleteBoard,
  getSupabaseClient,
  listMyBoards,
  loadBoard,
  saveBoard,
  type BoardData,
} from "./data/supabase";

type Props = {
  api: ExcalidrawImperativeAPI | null;
};

const styles: Record<string, CSSProperties> = {
  launcher: {
    position: "fixed",
    right: 20,
    bottom: 20,
    zIndex: 1000,
    border: "1px solid #202020",
    borderRadius: 999,
    padding: "12px 18px",
    background: "#171717",
    color: "#fff",
    boxShadow: "0 8px 28px rgba(0,0,0,.18)",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 650,
    cursor: "pointer",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 2000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    background: "rgba(17, 18, 20, .48)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    color: "#191919",
  },
  shell: {
    width: "min(100%, 1000px)",
    maxHeight: "min(820px, calc(100dvh - 40px))",
    minHeight: "min(560px, calc(100dvh - 40px))",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    border: "1px solid rgba(0,0,0,.08)",
    borderRadius: 22,
    background: "#fbfbfa",
    boxShadow: "0 28px 100px rgba(0,0,0,.25)",
  },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "18px 22px",
    borderBottom: "1px solid #e9e9e7",
    background: "rgba(255,255,255,.88)",
  },
  brand: { display: "flex", alignItems: "center", gap: 10, fontWeight: 750, letterSpacing: "-.04em", fontSize: 19 },
  brandMark: {
    width: 30,
    height: 30,
    display: "grid",
    placeItems: "center",
    borderRadius: 10,
    background: "#181818",
    color: "#fff",
    fontSize: 16,
    fontWeight: 800,
  },
  close: {
    width: 36,
    height: 36,
    border: "1px solid #e5e5e3",
    borderRadius: 11,
    background: "#fff",
    color: "#555",
    fontSize: 20,
    cursor: "pointer",
  },
  content: { overflowY: "auto", flex: 1, padding: "clamp(20px, 4vw, 42px)" },
  eyebrow: { margin: "0 0 10px", color: "#74746f", fontSize: 11, fontWeight: 750, letterSpacing: ".13em", textTransform: "uppercase" },
  heading: { margin: 0, color: "#171717", fontSize: "clamp(28px, 4vw, 40px)", lineHeight: 1.08, letterSpacing: "-.055em", fontWeight: 750 },
  subheading: { margin: "12px 0 0", maxWidth: 520, color: "#777771", fontSize: 14, lineHeight: 1.65 },
  field: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 13px",
    border: "1px solid #dededb",
    borderRadius: 11,
    background: "#fff",
    color: "#202020",
    font: "inherit",
    fontSize: 14,
    outlineColor: "#777",
  },
  primary: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1px solid #171717",
    borderRadius: 11,
    padding: "12px 15px",
    background: "#171717",
    color: "#fff",
    font: "inherit",
    fontSize: 13,
    fontWeight: 650,
    cursor: "pointer",
  },
  secondary: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    border: "1px solid #e0e0dd",
    borderRadius: 11,
    padding: "11px 13px",
    background: "#fff",
    color: "#282828",
    font: "inherit",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  quiet: {
    border: 0,
    padding: "8px 4px",
    background: "transparent",
    color: "#62625d",
    font: "inherit",
    fontSize: 13,
    cursor: "pointer",
  },
  card: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    padding: 17,
    border: "1px solid #e8e8e5",
    borderRadius: 15,
    background: "#fff",
    boxShadow: "0 2px 6px rgba(0,0,0,.015)",
  },
  muted: { color: "#85857e", fontSize: 12 },
};

const friendlyError = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

const formatDate = (date: string): string => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "Date unavailable";
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
};

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
  const [search, setSearch] = useState("");
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

  const filteredBoards = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return boards;
    }
    return boards.filter((board) => board.title.toLowerCase().includes(query));
  }, [boards, search]);

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = getSupabaseClient();
      const { data, error } = isSignUp
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        throw error;
      }
      if (isSignUp && !data.session) {
        setMessage("Your account is created. Check your email to confirm it, then sign in.");
      } else {
        setMessage(isSignUp ? "Your Zippy account is ready." : "Welcome back.");
      }
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!api) {
      setMessage("The drawing editor is still loading. Try again in a moment.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const elements = api.getSceneElements() as readonly ExcalidrawElement[];
      const appState = JSON.parse(
        JSON.stringify(api.getAppState()),
      ) as Record<string, unknown>;
      const cleanTitle = title.trim() || "Untitled board";

      if (boardId) {
        await saveBoard(boardId, {
          title: cleanTitle,
          elements: elements as unknown[],
          app_state: appState,
        });
      } else {
        const board = await createBoard(
          cleanTitle,
          elements as unknown[],
          appState,
        );
        setBoardId(board.id);
        const url = new URL(window.location.href);
        url.searchParams.set("board", board.id);
        window.history.replaceState({}, "", url);
      }

      await refreshBoards();
      setMessage("Saved. Your latest changes are in the cloud.");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenBoard = async (id: string) => {
    if (!api) {
      setMessage("The drawing editor is still loading. Try again in a moment.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const board = await loadBoard(id);
      api.updateScene({
        elements: board.elements as ExcalidrawElement[],
        appState: board.app_state as unknown as AppState,
      });
      setBoardId(board.id);
      setTitle(board.title);
      const url = new URL(window.location.href);
      url.searchParams.set("board", board.id);
      window.history.replaceState({}, "", url);
      setOpen(false);
      setMessage("");
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
    setOpen(false);
    setMessage("");
  };

  const handleDeleteBoard = async (board: BoardData) => {
    const confirmed = window.confirm(`Delete “${board.title}”? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await deleteBoard(board.id);
      setBoards((current) => current.filter((item) => item.id !== board.id));
      if (boardId === board.id) {
        setBoardId(null);
      }
      setMessage(`“${board.title}” deleted.`);
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) {
        throw error;
      }
      setIsSignUp(false);
      setPassword("");
      setMessage("You have signed out.");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        style={styles.launcher}
        onClick={() => {
          setMessage("");
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true" style={{ marginRight: 8 }}>▦</span>
        {userEmail ? "My boards" : "Sign in"}
      </button>

      {open && (
        <div
          style={styles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={userEmail ? "Your Zippy boards" : "Sign in to Zippy"}
            style={styles.shell}
          >
            <header style={styles.topbar}>
              <div style={styles.brand}>
                <span style={styles.brandMark}>z</span>
                <span>zippy</span>
                <span style={{ ...styles.muted, fontWeight: 500, marginLeft: 2 }}>cloud</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {userEmail && (
                  <span
                    title={userEmail}
                    style={{ ...styles.muted, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {userEmail}
                  </span>
                )}
                <button
                  type="button"
                  style={styles.close}
                  onClick={() => setOpen(false)}
                  aria-label="Close cloud boards"
                >
                  ×
                </button>
              </div>
            </header>

            <div style={styles.content}>
              {!configured ? (
                <div style={{ maxWidth: 520, margin: "5vh auto" }}>
                  <p style={styles.eyebrow}>Cloud workspace</p>
                  <h1 style={styles.heading}>Your ideas, saved.</h1>
                  <p style={styles.subheading}>
                    Zippy Cloud needs its Supabase connection configured before you can sign in.
                    Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to
                    excalidraw-app/.env.local, then restart the dev server.
                  </p>
                </div>
              ) : !userEmail ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
                    gap: "clamp(28px, 5vw, 64px)",
                    alignItems: "center",
                    maxWidth: 820,
                    minHeight: 390,
                    margin: "0 auto",
                  }}
                >
                  <div>
                    <p style={styles.eyebrow}>A little space for big ideas</p>
                    <h1 style={styles.heading}>
                      Think it.
                      <br />
                      Sketch it.
                      <br />
                      Keep it.
                    </h1>
                    <p style={styles.subheading}>
                      Sign in to keep your boards together and pick up where you left off,
                      on any device.
                    </p>
                    <div style={{ display: "flex", gap: 18, marginTop: 28, color: "#777771", fontSize: 12 }}>
                      <span>↗ Cloud saves</span>
                      <span>◫ Your board library</span>
                    </div>
                  </div>

                  <form
                    onSubmit={handleAuth}
                    style={{
                      display: "grid",
                      gap: 12,
                      padding: "clamp(20px, 3vw, 30px)",
                      border: "1px solid #e8e8e5",
                      borderRadius: 18,
                      background: "#fff",
                      boxShadow: "0 8px 32px rgba(0,0,0,.035)",
                    }}
                  >
                    <div style={{ marginBottom: 8 }}>
                      <h2 style={{ margin: 0, fontSize: 21, letterSpacing: "-.04em" }}>
                        {isSignUp ? "Create your account" : "Welcome back"}
                      </h2>
                      <p style={{ margin: "7px 0 0", color: "#777771", fontSize: 13, lineHeight: 1.5 }}>
                        {isSignUp ? "Start building your board library." : "Sign in to open your saved boards."}
                      </p>
                    </div>
                    <label style={{ display: "grid", gap: 7, fontSize: 12, fontWeight: 650 }}>
                      Email
                      <input
                        style={styles.field}
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                      />
                    </label>
                    <label style={{ display: "grid", gap: 7, fontSize: 12, fontWeight: 650 }}>
                      Password
                      <input
                        style={styles.field}
                        type="password"
                        autoComplete={isSignUp ? "new-password" : "current-password"}
                        placeholder={isSignUp ? "At least 6 characters" : "Your password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        minLength={6}
                        required
                      />
                    </label>
                    <button type="submit" style={{ ...styles.primary, width: "100%", marginTop: 3 }} disabled={busy}>
                      {busy ? "Please wait…" : isSignUp ? "Create account  ↗" : "Sign in  ↗"}
                    </button>
                    <button
                      type="button"
                      style={styles.quiet}
                      onClick={() => {
                        setIsSignUp((value) => !value);
                        setMessage("");
                      }}
                    >
                      {isSignUp ? "Already have an account? Sign in" : "New to Zippy? Create an account"}
                    </button>
                    <p style={{ margin: "2px 0 0", color: "#999991", fontSize: 11, lineHeight: 1.5 }}>
                      Your boards are private to your account.
                    </p>
                  </form>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "end",
                      justifyContent: "space-between",
                      gap: 18,
                      marginBottom: 28,
                    }}
                  >
                    <div>
                      <p style={styles.eyebrow}>Your workspace</p>
                      <h1 style={styles.heading}>Your boards.</h1>
                      <p style={styles.subheading}>
                        Every idea in one place. Open a board to keep going, or start with a blank canvas.
                      </p>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button type="button" style={styles.secondary} onClick={handleSignOut} disabled={busy}>
                        Sign out
                      </button>
                      <button type="button" style={styles.primary} onClick={handleNewBoard} disabled={busy || !api}>
                        + New board
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 18,
                    }}
                  >
                    <div style={{ fontSize: 13, color: "#666660" }}>
                      <strong style={{ color: "#202020" }}>{boards.length}</strong>{" "}
                      {boards.length === 1 ? "saved board" : "saved boards"}
                    </div>
                    <input
                      style={{ ...styles.field, width: "min(100%, 290px)" }}
                      type="search"
                      aria-label="Search boards"
                      placeholder="Search your boards…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>

                  {boards.length === 0 ? (
                    <div
                      style={{
                        padding: "clamp(30px, 6vw, 60px) 20px",
                        border: "1px dashed #d9d9d5",
                        borderRadius: 17,
                        textAlign: "center",
                        background: "#fff",
                      }}
                    >
                      <div style={{ fontSize: 28, marginBottom: 12, color: "#777771" }}>＋</div>
                      <h2 style={{ margin: 0, fontSize: 19, letterSpacing: "-.03em" }}>A clean canvas awaits.</h2>
                      <p style={{ ...styles.subheading, margin: "8px auto 20px" }}>
                        Save your first drawing to see it here next time.
                      </p>
                      <button type="button" style={styles.primary} onClick={handleNewBoard} disabled={busy || !api}>
                        Create your first board
                      </button>
                    </div>
                  ) : filteredBoards.length === 0 ? (
                    <div style={{ padding: 35, textAlign: "center", color: "#777771", fontSize: 14 }}>
                      No boards match “{search}”.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 245px), 1fr))",
                        gap: 13,
                      }}
                    >
                      {filteredBoards.map((board) => (
                        <article key={board.id} style={styles.card}>
                          <div
                            style={{
                              height: 94,
                              display: "grid",
                              placeItems: "center",
                              overflow: "hidden",
                              border: "1px solid #f0f0ed",
                              borderRadius: 10,
                              background:
                                "linear-gradient(135deg, #f7f7f5 25%, transparent 25%) -8px 0 / 16px 16px, linear-gradient(225deg, #f7f7f5 25%, #fff 25%) -8px 0 / 16px 16px, linear-gradient(315deg, #f7f7f5 25%, #fff 25%) 0 0 / 16px 16px, linear-gradient(45deg, #f7f7f5 25%, #fff 25%) 0 0 / 16px 16px",
                            }}
                          >
                            <span style={{ fontSize: 28, color: "#c7c7c0" }}>▧</span>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <h2
                              title={board.title}
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                margin: 0,
                                fontSize: 15,
                                fontWeight: 700,
                                letterSpacing: "-.02em",
                              }}
                            >
                              {board.title}
                            </h2>
                            <p style={{ ...styles.muted, margin: "7px 0 0" }}>
                              Updated {formatDate(board.updated_at)}
                            </p>
                            <p style={{ ...styles.muted, margin: "4px 0 0" }}>
                              {board.elements?.length ?? 0} drawing elements
                            </p>
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                            <button
                              type="button"
                              style={{ ...styles.primary, flex: 1 }}
                              onClick={() => handleOpenBoard(board.id)}
                              disabled={busy || !api}
                            >
                              Open board ↗
                            </button>
                            <button
                              type="button"
                              style={{ ...styles.secondary, padding: "10px 12px", color: "#a33" }}
                              onClick={() => handleDeleteBoard(board)}
                              disabled={busy}
                              aria-label={`Delete ${board.title}`}
                              title="Delete board"
                            >
                              ×
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}

              {message && (
                <p
                  role="status"
                  style={{
                    margin: "22px 0 0",
                    padding: "11px 13px",
                    border: "1px solid #e6e6e2",
                    borderRadius: 10,
                    background: "#fff",
                    color: "#4e4e48",
                    fontSize: 13,
                    lineHeight: 1.5,
                    overflowWrap: "anywhere",
                  }}
                >
                  {message}
                </p>
              )}
            </div>
            <footer
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: 8,
                padding: "12px 22px",
                borderTop: "1px solid #e9e9e7",
                color: "#999991",
                background: "#fff",
                fontSize: 11,
              }}
            >
              <span>Zippy Cloud · Your work, in one place.</span>
              <span>{userEmail ? "Private workspace" : "Create an account to save boards"}</span>
            </footer>
          </section>
        </div>
      )}
    </>
  );
};

export default SupabaseBoardsPanel;
