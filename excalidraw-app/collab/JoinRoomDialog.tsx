import React, { useState } from "react";
import { getSupabaseClient } from "../data/supabase";
import { saveUsernameToLocalStorage } from "../data/localStorage";
import "./JoinRoomDialog.scss";

type Props = {
  isOpen: boolean;
  onJoin: (username: string) => void;
};

export const JoinRoomDialog = ({ isOpen, onJoin }: Props) => {
  const [tab, setTab] = useState<"guest" | "auth">("guest");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim() || "Guest";
    saveUsernameToLocalStorage(cleanName);
    onJoin(cleanName);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    try {
      const supabase = getSupabaseClient();
      const { data, error } = isSignUp
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });

      if (error) throw error;
      const userEmail = data.user?.email || "";
      const derivedName = userEmail.split("@")[0] || "Zippy User";
      saveUsernameToLocalStorage(derivedName);
      onJoin(derivedName);
    } catch (err: any) {
      setErrorMsg(err.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="zp-join-backdrop">
      <div className="zp-join-modal" role="dialog" aria-modal="true">
        <div className="zp-join-header">
          <div className="zp-join-logo">
            <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
              <rect width="32" height="32" rx="8" fill="#4169ff"/>
              <path d="M8 11h16L9 21h15" stroke="white" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h2>Join Zippy Collaboration</h2>
          </div>
          <p className="zp-join-subtitle">
            You're joining a live real-time canvas session.
          </p>
        </div>

        <div className="zp-join-tabs">
          <button
            type="button"
            className={`zp-join-tab ${tab === "guest" ? "active" : ""}`}
            onClick={() => setTab("guest")}
          >
            Continue as Guest
          </button>
          <button
            type="button"
            className={`zp-join-tab ${tab === "auth" ? "active" : ""}`}
            onClick={() => setTab("auth")}
          >
            Sign in / Sign up
          </button>
        </div>

        {tab === "guest" ? (
          <form className="zp-join-form" onSubmit={handleGuestSubmit}>
            <label>
              Your Name / Nickname
              <input
                type="text"
                className="zp-field-input"
                placeholder="e.g. Max, Katy, Alex"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </label>
            <p className="zp-join-hint">
              This name will be displayed next to your live cursor and on the team roster.
            </p>
            <button type="submit" className="zp-btn-primary zp-btn-full">
              Join Canvas →
            </button>
          </form>
        ) : (
          <form className="zp-join-form" onSubmit={handleAuthSubmit}>
            <label>
              Email
              <input
                type="email"
                className="zp-field-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                className="zp-field-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>
            {errorMsg && <p className="zp-join-error">{errorMsg}</p>}
            <button type="submit" className="zp-btn-primary zp-btn-full" disabled={busy}>
              {busy ? "Signing in..." : isSignUp ? "Create account & Join →" : "Sign in & Join →"}
            </button>
            <button
              type="button"
              className="zp-btn-ghost"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? "Already have an account? Sign in" : "Need an account? Create one"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
