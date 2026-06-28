import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  addLibrary,
  browse,
  changeMyPassword,
  createUser,
  deleteLibrary,
  deleteUser,
  getLibraries,
  getUsers,
  rescanAll,
  resetUserPassword,
  setUserAccess,
  type BrowseResult,
  type LibraryItem,
  type UserRow,
} from "../api";
import { useAuth } from "../auth";

export default function Settings() {
  const { isAdmin, authDisabled, signOut } = useAuth();
  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand">Lecturn</Link>
        <Link to="/" className="chip">← Library</Link>
        <button className="chip" onClick={() => void signOut()}>Logout</button>
      </header>

      {!authDisabled && <AccountSection />}
      {isAdmin && <UsersSection />}
      {isAdmin && <LibrariesSection />}
      {!isAdmin && (
        <p className="note">Library and user management are available to admins.</p>
      )}
    </div>
  );
}

function AccountSection() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    try {
      await changeMyPassword(cur, next);
      setCur("");
      setNext("");
      setMsg("Password changed.");
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  return (
    <section>
      <h1 className="row-title">Account</h1>
      <form className="addbar" onSubmit={submit}>
        <input className="search" type="password" placeholder="Current password"
          value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        <input className="search" type="password" placeholder="New password"
          value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <button className="btn" type="submit">Change password</button>
      </form>
      {msg && <p className="note ok-text">{msg}</p>}
      {err && <p className="note bad">{err}</p>}
    </section>
  );
}

function UsersSection() {
  const qc = useQueryClient();
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: getUsers });
  const { data: libs } = useQuery({ queryKey: ["libraries"], queryFn: getLibraries });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState(false);
  const [err, setErr] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    try {
      await createUser(username.trim(), password, admin);
      setUsername("");
      setPassword("");
      setAdmin(false);
      refresh();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  return (
    <section>
      <h1 className="row-title">Users</h1>
      <ul className="results">
        {(users ?? []).map((u) => (
          <UserItem key={u.id} user={u} libs={libs ?? []} onChanged={refresh} setErr={setErr} />
        ))}
      </ul>
      <form className="addbar" onSubmit={add}>
        <input className="search nameinput" placeholder="New username"
          value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        <input className="search nameinput" type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <label className="chip" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} /> admin
        </label>
        <button className="btn" type="submit">Add user</button>
      </form>
      <p className="note" style={{ padding: "4px 2px" }}>
        New users can see all libraries by default. Use “Access” to restrict a user to specific ones.
      </p>
      {err && <p className="note bad">{err}</p>}
    </section>
  );
}

function UserItem({
  user,
  libs,
  onChanged,
  setErr,
}: {
  user: UserRow;
  libs: LibraryItem[];
  onChanged: () => void;
  setErr: (s: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [all, setAll] = useState(user.allLibraries);
  const [ids, setIds] = useState<number[]>(user.libraryIds);

  const remove = async () => {
    if (!window.confirm("Delete this user? Their progress will be removed.")) return;
    try {
      await deleteUser(user.id);
      onChanged();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  const resetPw = async () => {
    const pw = window.prompt("New password for this user:");
    if (!pw) return;
    try {
      await resetUserPassword(user.id, pw);
      window.alert("Password reset.");
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  const toggle = (id: number) =>
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const saveAccess = async () => {
    try {
      await setUserAccess(user.id, all, ids);
      setEditing(false);
      onChanged();
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };

  const accessLabel = user.isAdmin
    ? "all libraries (admin)"
    : user.allLibraries
      ? "all libraries"
      : `${user.libraryIds.length} librar${user.libraryIds.length === 1 ? "y" : "ies"}`;

  return (
    <li style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <span>
          <span className="res-title">{user.username}</span>{" "}
          <span className="res-ctx">{user.isAdmin ? "admin" : "user"} · {accessLabel}</span>
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          {!user.isAdmin && (
            <button className="chip" onClick={() => setEditing((v) => !v)}>Access</button>
          )}
          <button className="chip" onClick={() => void resetPw()}>Reset password</button>
          <button className="chip" onClick={() => void remove()}>Delete</button>
        </span>
      </div>

      {editing && !user.isAdmin && (
        <div className="browser">
          <label className="chip" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All libraries
          </label>
          {!all && (
            <ul className="results" style={{ margin: "10px 0" }}>
              {libs.map((l) => (
                <li key={l.id}>
                  <label className="linklike" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={ids.includes(l.id)}
                      onChange={() => toggle(l.id)}
                    />{" "}
                    {l.name || l.path}
                  </label>
                </li>
              ))}
              {libs.length === 0 && <li><span className="res-ctx">No libraries yet.</span></li>}
            </ul>
          )}
          <button className="btn" onClick={() => void saveAccess()}>Save access</button>
        </div>
      )}
    </li>
  );
}

function LibrariesSection() {
  const qc = useQueryClient();
  const { data: libs } = useQuery({ queryKey: ["libraries"], queryFn: getLibraries });

  const [path, setPath] = useState("/");
  const [name, setName] = useState("");
  const [bdata, setBdata] = useState<BrowseResult | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["libraries"] });
    qc.invalidateQueries({ queryKey: ["courses"] });
  };

  const doBrowse = async (p: string) => {
    setErr("");
    try {
      setBdata(await browse(p));
    } catch (e) {
      setErr(String((e as Error).message));
    }
  };
  const doAdd = async (p: string) => {
    const target = p.trim();
    if (!target) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await addLibrary(target, name.trim() || undefined);
      setName("");
      setMsg(`Added “${target}” — scanning in the background…`);
      refresh();
      setTimeout(refresh, 2500);
      setTimeout(refresh, 6000);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };
  const doDelete = async (id: number) => {
    if (!window.confirm("Remove this library? Its courses and progress will be deleted.")) return;
    await deleteLibrary(id);
    refresh();
  };
  const doRescan = async () => {
    await rescanAll();
    setMsg("Rescan started…");
    setTimeout(refresh, 2000);
    setTimeout(refresh, 6000);
  };

  return (
    <section>
      <h1 className="row-title">Libraries</h1>
      <p className="note" style={{ padding: "0 2px 12px" }}>
        Add folders that contain your courses. In an LXC/Docker setup, mount the host folder
        into the container first, then add its in-container path here.
      </p>

      <ul className="results">
        {(libs ?? []).map((l) => (
          <li key={l.id}>
            <span>
              <span className="res-title">{l.name || l.path}</span>{" "}
              <span className="res-ctx">
                {l.path} · {l.courseCount} courses{l.accessible ? "" : " · ⚠ not accessible"}
              </span>
            </span>
            <button className="chip" onClick={() => void doDelete(l.id)}>Remove</button>
          </li>
        ))}
        {libs && libs.length === 0 && (
          <li><span className="res-ctx">No libraries yet — add one below.</span></li>
        )}
      </ul>

      <div className="addbar">
        <input className="search" value={path} onChange={(e) => setPath(e.target.value)}
          placeholder="/path/inside/the/container" />
        <input className="search nameinput" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)" />
        <button className="chip" onClick={() => void doBrowse(path || "/")}>Browse…</button>
        <button className="btn" disabled={busy} onClick={() => void doAdd(path)}>
          {busy ? "Adding…" : "Add library"}
        </button>
        <button className="chip" onClick={() => void doRescan()}>Rescan all</button>
      </div>
      {msg && <p className="note ok-text">{msg}</p>}
      {err && <p className="note bad">{err}</p>}

      {bdata && (
        <div className="browser">
          <div className="sec-title">Browsing: {bdata.path}</div>
          <ul className="results">
            {bdata.parent && (
              <li><button className="linklike" onClick={() => void doBrowse(bdata.parent!)}>⬆ ..</button></li>
            )}
            {bdata.dirs.map((d) => (
              <li key={d.path}>
                <button className="linklike" onClick={() => void doBrowse(d.path)}>📁 {d.name}</button>
                <button className="chip" onClick={() => setPath(d.path)}>Select</button>
              </li>
            ))}
            {bdata.dirs.length === 0 && <li><span className="res-ctx">(no subfolders)</span></li>}
          </ul>
          <button className="btn" onClick={() => void doAdd(bdata.path)}>Add this folder</button>
        </div>
      )}
    </section>
  );
}
