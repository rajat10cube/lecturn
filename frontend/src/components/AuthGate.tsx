import { useState, type ReactNode } from "react";

import { useAuth } from "../auth";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { ready, user, needsSetup } = useAuth();
  if (!ready) return <p className="note">Loading…</p>;
  if (needsSetup) return <SetupScreen />;
  if (!user) return <LoginScreen />;
  return <>{children}</>;
}

function SetupScreen() {
  const { signUp } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 4) return setErr("Password must be at least 4 characters");
    if (password !== confirm) return setErr("Passwords don't match");
    setBusy(true);
    setErr("");
    try {
      await signUp(username.trim(), password);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>Welcome to Lecturn</h1>
        <p className="tagline">Create your admin account</p>
        <input className="search" placeholder="Username" autoFocus autoComplete="username"
          value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="search" type="password" placeholder="Password" autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <input className="search" type="password" placeholder="Confirm password" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {err && <div className="bad">{err}</div>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
    </div>
  );
}

function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await signIn(username, password);
    } catch {
      setErr("Invalid username or password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>Lecturn</h1>
        <p className="tagline">Sign in to continue</p>
        <input className="search" placeholder="Username" autoFocus autoComplete="username"
          value={username} onChange={(e) => setUsername(e.target.value)} />
        <input className="search" type="password" placeholder="Password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <div className="bad">{err}</div>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
