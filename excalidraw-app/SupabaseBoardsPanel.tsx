import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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

import "./zippy-dashboard.scss";

type Props = {
  api: ExcalidrawImperativeAPI | null;
};

const friendlyError = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";

const formatDate = (date: string): string => {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(parsed);
};

// Zippy wordmark SVG logo
const ZippyLogo = () => (
  <svg className="zp-logo-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect width="32" height="32" rx="9" fill="#4169ff"/>
    <path d="M8 11h16L9 21h15" stroke="white" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// Spinner component
const Spinner = () => (
  <svg className="zp-spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="42" strokeDashoffset="12"/>
  </svg>
);

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
  const [message, setMessage] = useState<{ text: string; type: "info" | "error" | "success" } | null>(null);
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Listen for open-dashboard event (from mobile menu or shortcut)
  useEffect(() => {
    const handleOpen = () => {
      setMessage(null);
      setOpen(true);
    };
    window.addEventListener("zippy:open-dashboard", handleOpen);
    return () => window.removeEventListener("zippy:open-dashboard", handleOpen);
  }, []);

  useEffect(() => {
    if (!userEmail) return;
    refreshBoards().catch((error) => setMessage({ text: friendlyError(error), type: "error" }));
  }, [userEmail, refreshBoards]);

  // Real-time board sync via Supabase Realtime
  useEffect(() => {
    if (!userEmail || !boardId || !api) return;
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel(`board:${boardId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "boards",
          filter: `id=eq.${boardId}`,
        },
        (payload) => {
          const updated = payload.new as BoardData;
          if (updated && updated.elements) {
            api.updateScene({
              elements: updated.elements as ExcalidrawElement[],
              appState: updated.app_state as unknown as AppState,
            });
            if (updated.title) {
              setTitle(updated.title);
            }
            refreshBoards().catch(() => {});
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userEmail, boardId, api, refreshBoards]);

  // Instant Auto-Save on change + periodic backup when board is open and user is logged in
  useEffect(() => {
    if (!userEmail || !boardId || !api) return;

    let timeoutId: any = null;
    const saveCurrentBoard = async () => {
      try {
        setSaving(true);
        const elements = api.getSceneElements() as readonly ExcalidrawElement[];
        const appState = JSON.parse(JSON.stringify(api.getAppState())) as Record<string, unknown>;
        await saveBoard(boardId, { title, elements: elements as unknown[], app_state: appState });
      } catch (e) {
        console.error("Auto-save error:", e);
      } finally {
        setSaving(false);
      }
    };

    // Listen to custom canvas-changed event for instant debounced auto-save
    const handleCanvasChange = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(saveCurrentBoard, 600);
    };

    window.addEventListener("zippy:canvas-change", handleCanvasChange);

    const interval = setInterval(saveCurrentBoard, 8000);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
      window.removeEventListener("zippy:canvas-change", handleCanvasChange);
    };
  }, [userEmail, boardId, api, title]);

  const filteredBoards = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return boards;
    return boards.filter((board) => board.title.toLowerCase().includes(query));
  }, [boards, search]);

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = isSignUp
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (isSignUp && !data.session) {
        setMessage({ text: "Account created! Check your email to confirm, then sign in.", type: "info" });
      } else {
        setMessage({ text: isSignUp ? "Welcome to Zippy! Your account is ready." : "Welcome back.", type: "success" });
      }
    } catch (error) {
      setMessage({ text: friendlyError(error), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!api) {
      setMessage({ text: "The canvas is still loading. Try again in a moment.", type: "error" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const elements = api.getSceneElements() as readonly ExcalidrawElement[];
      const appState = JSON.parse(JSON.stringify(api.getAppState())) as Record<string, unknown>;
      const cleanTitle = title.trim() || "Untitled board";

      if (boardId) {
        await saveBoard(boardId, { title: cleanTitle, elements: elements as unknown[], app_state: appState });
      } else {
        const board = await createBoard(cleanTitle, elements as unknown[], appState);
        setBoardId(board.id);
        const url = new URL(window.location.href);
        url.searchParams.set("board", board.id);
        window.history.replaceState({}, "", url);
      }

      await refreshBoards();
      setMessage({ text: "Saved to Zippy Cloud ✓", type: "success" });
    } catch (error) {
      setMessage({ text: friendlyError(error), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleOpenBoard = async (id: string) => {
    if (!api) {
      setMessage({ text: "Canvas is loading. Try again in a moment.", type: "error" });
      return;
    }
    setBusy(true);
    setMessage(null);
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
      setMessage(null);
    } catch (error) {
      setMessage({ text: friendlyError(error), type: "error" });
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
    setMessage(null);
  };

  const handleDeleteBoard = async (board: BoardData) => {
    const confirmed = window.confirm(`Delete "${board.title}"? This cannot be undone.`);
    if (!confirmed) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteBoard(board.id);
      setBoards((current) => current.filter((item) => item.id !== board.id));
      if (boardId === board.id) setBoardId(null);
      setMessage({ text: `"${board.title}" deleted.`, type: "info" });
    } catch (error) {
      setMessage({ text: friendlyError(error), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleRenameBoard = async (board: BoardData) => {
    const nextTitle = window.prompt("Rename board", board.title);
    if (nextTitle === null) return;
    const cleanTitle = nextTitle.trim();
    if (!cleanTitle) {
      setMessage({ text: "A board needs a name.", type: "error" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await saveBoard(board.id, { title: cleanTitle });
      setBoards((current) =>
        current.map((item) => (item.id === board.id ? { ...item, title: cleanTitle } : item)),
      );
      if (boardId === board.id) setTitle(cleanTitle);
      setMessage({ text: "Board renamed.", type: "success" });
    } catch (error) {
      setMessage({ text: friendlyError(error), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
      setIsSignUp(false);
      setPassword("");
      setMessage({ text: "You've signed out.", type: "info" });
    } catch (error) {
      setMessage({ text: friendlyError(error), type: "error" });
    } finally {
      setBusy(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !busy) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, busy]);

  return (
    <>
      {/* Launcher — top left pill button */}
      <button
        type="button"
        className="zp-launcher"
        onClick={() => { setMessage(null); setOpen(true); }}
        aria-haspopup="dialog"
        aria-label="Open Zippy dashboard"
        title="Zippy boards"
      >
        <ZippyLogo />
        <span className="zp-launcher-label">
          {userEmail ? (boardId ? title.slice(0, 20) || "My boards" : "My boards") : "Sign in"}
        </span>
        {userEmail && boardId && (
          <span className="zp-launcher-badge" title="Board saved">✓</span>
        )}
      </button>

      {/* Save shortcut button (shown when logged in + board active) */}
      {userEmail && (
        <button
          type="button"
          className={`zp-save-btn${busy ? " zp-save-btn--busy" : ""}`}
          onClick={handleSave}
          disabled={busy}
          title="Save board to Zippy Cloud"
          aria-label="Save to Zippy Cloud"
        >
          {busy ? <Spinner /> : (
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" width="14" height="14">
              <path d="M2 14V10.5L8 4l6 6.5V14H2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M5.5 14v-4.5h5V14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          )}
          <span>{busy ? "Saving…" : "Save"}</span>
        </button>
      )}

      {/* Backdrop + panel */}
      {open && (
        <div
          className="zp-backdrop"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}
          role="presentation"
        >
          <section
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={userEmail ? "Your Zippy boards" : "Sign in to Zippy"}
            className="zp-panel"
          >
            {/* Panel header */}
            <header className="zp-panel-header">
              <div className="zp-panel-brand">
                <ZippyLogo />
                <span className="zp-panel-brand-name">Zippy</span>
                <span className="zp-panel-brand-tag">Cloud</span>
              </div>
              <div className="zp-panel-header-right">
                {userEmail && (
                  <span className="zp-user-email" title={userEmail}>{userEmail}</span>
                )}
                <button
                  type="button"
                  className="zp-close-btn"
                  onClick={() => setOpen(false)}
                  aria-label="Close dashboard"
                >
                  <svg viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </header>

            {/* Panel body */}
            <div className="zp-panel-body">
              {!configured ? (
                /* Not configured state */
                <div className="zp-state-container">
                  <div className="zp-state-icon">⚙️</div>
                  <h1 className="zp-state-title">Setup required</h1>
                  <p className="zp-state-desc">
                    Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to{" "}
                    <code>excalidraw-app/.env.local</code>, then restart the dev server.
                  </p>
                </div>
              ) : !userEmail ? (
                /* Auth form */
                <div className="zp-auth-layout">
                  <div className="zp-auth-hero">
                    <p className="zp-eyebrow">Your creative space</p>
                    <h1 className="zp-hero-title">
                      Think it.<br />
                      Sketch it.<br />
                      Keep it.
                    </h1>
                    <p className="zp-hero-desc">
                      Sign in to save your boards to the cloud and pick up right where you left off, on any device.
                    </p>
                    <div className="zp-auth-features">
                      <span className="zp-feature-pill">☁ Cloud saves</span>
                      <span className="zp-feature-pill">◫ Board library</span>
                      <span className="zp-feature-pill">⚡ Fast sync</span>
                    </div>
                  </div>

                  <form className="zp-auth-form" onSubmit={handleAuth}>
                    <div className="zp-form-heading">
                      <h2 className="zp-form-title">
                        {isSignUp ? "Create account" : "Welcome back"}
                      </h2>
                      <p className="zp-form-subtitle">
                        {isSignUp
                          ? "Start building your board library."
                          : "Sign in to open your saved boards."}
                      </p>
                    </div>

                    <div className="zp-field-group">
                      <label className="zp-field-label" htmlFor="zp-email">Email</label>
                      <input
                        id="zp-email"
                        className="zp-field-input"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>

                    <div className="zp-field-group">
                      <label className="zp-field-label" htmlFor="zp-password">Password</label>
                      <input
                        id="zp-password"
                        className="zp-field-input"
                        type="password"
                        autoComplete={isSignUp ? "new-password" : "current-password"}
                        placeholder={isSignUp ? "At least 6 characters" : "Your password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={6}
                        required
                      />
                    </div>

                    <button type="submit" className="zp-btn-primary zp-btn-full" disabled={busy}>
                      {busy ? <><Spinner /> Please wait…</> : (isSignUp ? "Create account →" : "Sign in →")}
                    </button>

                    <button
                      type="button"
                      className="zp-btn-ghost"
                      onClick={() => { setIsSignUp((v) => !v); setMessage(null); }}
                    >
                      {isSignUp ? "Already have an account? Sign in" : "New to Zippy? Create an account"}
                    </button>

                    <p className="zp-form-privacy">🔒 Your boards are private to your account.</p>
                  </form>
                </div>
              ) : (
                /* Boards dashboard */
                <>
                  <div className="zp-dashboard-header">
                    <div>
                      <p className="zp-eyebrow">Your workspace</p>
                      <h1 className="zp-page-title">Your boards</h1>
                      <p className="zp-page-desc">
                        Every idea in one place. Open a board to keep going, or start fresh.
                      </p>
                    </div>
                    <div className="zp-dashboard-actions">
                      <button type="button" className="zp-btn-secondary" onClick={handleSignOut} disabled={busy}>
                        Sign out
                      </button>
                      <button type="button" className="zp-btn-primary" onClick={handleNewBoard} disabled={busy || !api}>
                        + New board
                      </button>
                    </div>
                  </div>

                  <div className="zp-boards-toolbar">
                    <div className="zp-board-count">
                      <strong>{boards.length}</strong>{" "}
                      {boards.length === 1 ? "board" : "boards"}
                    </div>
                    <div className="zp-search-wrap">
                      <svg className="zp-search-icon" viewBox="0 0 16 16" fill="none" width="14" height="14" aria-hidden="true">
                        <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      <input
                        className="zp-search-input"
                        type="search"
                        aria-label="Search boards"
                        placeholder="Search boards…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  {boards.length === 0 ? (
                    <div className="zp-empty-state">
                      <div className="zp-empty-icon">
                        <svg viewBox="0 0 64 64" fill="none" width="64" height="64" aria-hidden="true">
                          <rect x="8" y="14" width="48" height="36" rx="6" fill="#eef1ff" stroke="#4169ff" strokeWidth="2"/>
                          <path d="M22 32h20M22 38h12" stroke="#4169ff" strokeWidth="2" strokeLinecap="round"/>
                          <circle cx="48" cy="48" r="10" fill="#4169ff"/>
                          <path d="M48 44v8M44 48h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <h2 className="zp-empty-title">A clean canvas awaits</h2>
                      <p className="zp-empty-desc">Save your first drawing to see it here next time.</p>
                      <button type="button" className="zp-btn-primary" onClick={handleNewBoard} disabled={busy || !api}>
                        Create your first board
                      </button>
                    </div>
                  ) : filteredBoards.length === 0 ? (
                    <div className="zp-no-results">
                      No boards match "<strong>{search}</strong>"
                    </div>
                  ) : (
                    <div className="zp-boards-grid">
                      {filteredBoards.map((board) => (
                        <article key={board.id} className={`zp-board-card${boardId === board.id ? " zp-board-card--active" : ""}`}>
                          <div className="zp-board-thumbnail" aria-hidden="true">
                            <svg viewBox="0 0 80 56" fill="none" width="80" height="56" aria-hidden="true">
                              <rect width="80" height="56" rx="4" fill="#f7f7f5"/>
                              <rect x="8" y="10" width="30" height="3" rx="1.5" fill="#d0d0cc"/>
                              <rect x="8" y="17" width="46" height="2" rx="1" fill="#e5e5e2"/>
                              <rect x="8" y="22" width="38" height="2" rx="1" fill="#e5e5e2"/>
                              <rect x="8" y="32" width="20" height="14" rx="3" fill="#eef1ff" stroke="#4169ff" strokeWidth="1"/>
                              <rect x="32" y="32" width="20" height="14" rx="3" fill="#eef1ff" stroke="#4169ff" strokeWidth="1"/>
                            </svg>
                          </div>
                          <div className="zp-board-info">
                            <h2 className="zp-board-title" title={board.title}>{board.title}</h2>
                            <p className="zp-board-meta">Updated {formatDate(board.updated_at)}</p>
                          </div>
                          <div className="zp-board-actions">
                            <button
                              type="button"
                              className="zp-btn-primary zp-btn-sm"
                              style={{ flex: 1 }}
                              onClick={() => handleOpenBoard(board.id)}
                              disabled={busy || !api}
                            >
                              Open ↗
                            </button>
                            <button
                              type="button"
                              className="zp-btn-secondary zp-btn-sm zp-btn-icon"
                              onClick={() => handleRenameBoard(board)}
                              disabled={busy}
                              aria-label={`Rename "${board.title}"`}
                              title="Rename"
                            >
                              <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
                                <path d="M2 12.5L4.5 10l7-7 2 2-7 7-2.5 2.5H2v-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="zp-btn-danger-ghost zp-btn-sm zp-btn-icon"
                              onClick={() => handleDeleteBoard(board)}
                              disabled={busy}
                              aria-label={`Delete "${board.title}"`}
                              title="Delete"
                            >
                              <svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true">
                                <path d="M3 5h10M6 5V3h4v2M6 7.5v5M10 7.5v5M4 5l1 8h6l1-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}

              {message && (
                <div role="status" className={`zp-message zp-message--${message.type}`}>
                  {message.text}
                </div>
              )}
            </div>

            {/* Panel footer */}
            <footer className="zp-panel-footer">
              <span>Zippy Cloud · Your work, always there.</span>
              <span>{userEmail ? "Private workspace" : "Create an account to save boards"}</span>
            </footer>
          </section>
        </div>
      )}
    </>
  );
};

export default SupabaseBoardsPanel;
