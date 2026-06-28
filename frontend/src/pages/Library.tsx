import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { getCourses, getSearch, type CourseCard } from "../api";
import { useAuth } from "../auth";

function Card({ c }: { c: CourseCard }) {
  const pct = c.lectureCount ? Math.round((c.completedCount / c.lectureCount) * 100) : 0;
  return (
    <Link to={`/course/${encodeURIComponent(c.slug)}`} className="card">
      <div className="thumb">
        {c.cover ? <img src={c.cover} alt="" loading="lazy" /> : <div className="thumb-ph" />}
        {c.category && <span className="cat">{c.category}</span>}
      </div>
      <div className="card-body">
        <div className="card-title">{c.title}</div>
        <div className="card-meta">
          {c.completedCount > 0 ? `${c.completedCount}/${c.lectureCount} · ${pct}%` : `${c.lectureCount} lectures`}
        </div>
      </div>
      {c.completedCount > 0 && <div className="progress card-bar"><i style={{ width: `${pct}%` }} /></div>}
    </Link>
  );
}

export default function Library() {
  const { signOut } = useAuth();
  const { data, isLoading, isError } = useQuery({ queryKey: ["courses"], queryFn: getCourses });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const query = q.trim();
  const searching = query.length >= 2;

  const { data: search } = useQuery({
    queryKey: ["search", query],
    queryFn: () => getSearch(query),
    enabled: searching,
  });

  const browse = useMemo(() => {
    const courses = data?.courses ?? [];
    return courses.filter((c) => cat === "All" || c.category === cat);
  }, [data, cat]);

  const continueRow = useMemo(() => {
    const courses = data?.courses ?? [];
    return courses
      .filter((c) => c.lastActivity && c.completedCount < c.lectureCount)
      .sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""))
      .slice(0, 8);
  }, [data]);

  const byId = useMemo(() => {
    const m = new Map<string, CourseCard>();
    (data?.courses ?? []).forEach((c) => m.set(c.slug, c));
    return m;
  }, [data]);

  const results = search?.results ?? [];
  const courseHits = results.filter((r) => r.kind === "course");
  const lectureHits = results.filter((r) => r.kind === "lecture");

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand">Lecturn</Link>
        <input
          className="search"
          placeholder="Search courses & lessons…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Link to="/settings" className="chip">Libraries</Link>
        <button className="chip" onClick={() => void signOut()}>Logout</button>
      </header>

      {isLoading && <p className="note">Loading library…</p>}
      {isError && <p className="note bad">Couldn’t reach the backend.</p>}

      {searching ? (
        <>
          {courseHits.length > 0 && (
            <section>
              <h2 className="row-title">Courses</h2>
              <div className="grid">
                {courseHits.map((r) => {
                  const c = byId.get(r.slug);
                  return c ? <Card key={`c${r.refId}`} c={c} /> : null;
                })}
              </div>
            </section>
          )}
          <section>
            <h2 className="row-title">Lessons</h2>
            {lectureHits.length === 0 && <p className="note">No lessons match.</p>}
            <ul className="results">
              {lectureHits.map((r) => (
                <li key={`l${r.refId}`}>
                  <Link to={`/course/${encodeURIComponent(r.slug)}?lecture=${r.refId}`}>
                    <span className="res-title">{r.title}</span>
                    <span className="res-ctx">{r.context}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <>
          {continueRow.length > 0 && (
            <section className="continue">
              <h2 className="row-title">Continue learning</h2>
              <div className="row">
                {continueRow.map((c) => (
                  <div className="row-item" key={c.id}>
                    <Card c={c} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {data && (
            <div className="filters">
              {["All", ...data.categories].map((c) => (
                <button key={c} className={`chip ${c === cat ? "active" : ""}`} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {data && data.courses.length === 0 ? (
            <p className="note">
              No courses yet. <Link to="/settings">Add a library →</Link> (point it at a folder
              of your downloaded courses).
            </p>
          ) : (
            <div className="grid">
              {browse.map((c) => (
                <Card key={c.id} c={c} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
