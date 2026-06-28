import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  addLibrary,
  browse,
  deleteLibrary,
  getLibraries,
  rescanAll,
  type BrowseResult,
} from "../api";

export default function Settings() {
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
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand">Lecturn</Link>
        <Link to="/" className="chip">← Library</Link>
      </header>

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
            <button className="chip" onClick={() => doDelete(l.id)}>Remove</button>
          </li>
        ))}
        {libs && libs.length === 0 && (
          <li><span className="res-ctx">No libraries yet — add one below.</span></li>
        )}
      </ul>

      <div className="addbar">
        <input
          className="search"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/path/inside/the/container"
        />
        <input
          className="search nameinput"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
        />
        <button className="chip" onClick={() => doBrowse(path || "/")}>Browse…</button>
        <button className="btn" disabled={busy} onClick={() => doAdd(path)}>
          {busy ? "Adding…" : "Add library"}
        </button>
        <button className="chip" onClick={doRescan}>Rescan all</button>
      </div>

      {msg && <p className="note ok-text">{msg}</p>}
      {err && <p className="note bad">{err}</p>}

      {bdata && (
        <div className="browser">
          <div className="sec-title">Browsing: {bdata.path}</div>
          <ul className="results">
            {bdata.parent && (
              <li>
                <button className="linklike" onClick={() => doBrowse(bdata.parent!)}>⬆ ..</button>
              </li>
            )}
            {bdata.dirs.map((d) => (
              <li key={d.path}>
                <button className="linklike" onClick={() => doBrowse(d.path)}>📁 {d.name}</button>
                <button className="chip" onClick={() => setPath(d.path)}>Select</button>
              </li>
            ))}
            {bdata.dirs.length === 0 && <li><span className="res-ctx">(no subfolders)</span></li>}
          </ul>
          <button className="btn" onClick={() => doAdd(bdata.path)}>Add this folder</button>
        </div>
      )}
    </div>
  );
}
