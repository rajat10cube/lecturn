import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { getCourse, putProgress, type LectureItem } from "../api";
import Player from "../components/Player";

interface Prog {
  positionSec: number;
  completed: boolean;
}

export default function CoursePage() {
  const { slug = "" } = useParams();
  const [searchParams] = useSearchParams();
  const deepLinkId = searchParams.get("lecture");
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["course", slug],
    queryFn: () => getCourse(slug),
  });

  const flat = useMemo<LectureItem[]>(
    () => (data ? data.sections.flatMap((s) => s.lectures) : []),
    [data],
  );

  const [progress, setProgress] = useState<Record<number, Prog>>({});
  const [currentId, setCurrentId] = useState<number | null>(null);
  const lastPut = useRef<{ id: number; t: number }>({ id: -1, t: 0 });

  useEffect(() => {
    if (!data) return;
    const map: Record<number, Prog> = {};
    for (const s of data.sections)
      for (const l of s.lectures) map[l.id] = { positionSec: l.positionSec, completed: l.completed };
    setProgress(map);
    const deepId = deepLinkId ? Number(deepLinkId) : null;
    const valid = deepId && flat.some((l) => l.id === deepId) ? deepId : null;
    setCurrentId(
      (prev) => prev ?? valid ?? data.resumeLectureId ?? data.sections[0]?.lectures[0]?.id ?? null,
    );
  }, [data, deepLinkId, flat]);

  const current = flat.find((l) => l.id === currentId) ?? null;

  const report = (lecId: number, pos: number, dur: number, ended: boolean) => {
    const now = Date.now();
    if (ended || lastPut.current.id !== lecId || now - lastPut.current.t > 4000) {
      lastPut.current = { id: lecId, t: now };
      void putProgress(lecId, {
        position_sec: pos,
        duration_sec: dur || null,
        completed: ended ? true : undefined,
      }).catch(() => {});
    }
    setProgress((p) => {
      const completed = p[lecId]?.completed || ended || (dur > 0 && pos / dur >= 0.9);
      return { ...p, [lecId]: { positionSec: pos, completed } };
    });
    if (ended) queryClient.invalidateQueries({ queryKey: ["courses"] });
  };

  const playNext = () => {
    if (!current) return;
    const idx = flat.findIndex((l) => l.id === current.id);
    if (idx >= 0 && idx + 1 < flat.length) setCurrentId(flat[idx + 1].id);
  };

  if (isLoading) return <p className="note">Loading…</p>;
  if (isError || !data) return <p className="note bad">Course not found.</p>;

  const completedCount = Object.values(progress).filter((p) => p.completed).length;
  const pct = data.lectureCount ? Math.round((completedCount / data.lectureCount) * 100) : 0;
  const curProg = current ? progress[current.id] : undefined;
  const startPosition = curProg && !curProg.completed ? curProg.positionSec : 0;

  return (
    <div className="course">
      <aside className="sidebar">
        <Link to="/" className="back">← Library</Link>
        <h2 className="course-title">{data.title}</h2>
        {data.category && <div className="course-cat">{data.category}</div>}
        <div className="course-prog">
          <div className="progress"><i style={{ width: `${pct}%` }} /></div>
          <span>{completedCount}/{data.lectureCount} · {pct}%</span>
        </div>

        {data.sections.map((s) => (
          <div key={s.id} className="sec">
            <div className="sec-title">{s.title}</div>
            {s.lectures.map((l) => {
              const p = progress[l.id];
              const state = p?.completed ? "done" : p && p.positionSec > 2 ? "partial" : "";
              return (
                <button
                  key={l.id}
                  className={`lec ${l.id === currentId ? "active" : ""}`}
                  onClick={() => setCurrentId(l.id)}
                >
                  <span className={`mark ${state}`}>{p?.completed ? "✓" : ""}</span>
                  <span className="lec-title">{l.title}</span>
                </button>
              );
            })}
          </div>
        ))}

        {data.attachments.length > 0 && (
          <div className="sec">
            <div className="sec-title">Resources</div>
            {data.attachments.map((a) => (
              <div key={a.id} className="lec res">{a.title}</div>
            ))}
          </div>
        )}
      </aside>

      <main className="stage">
        {current ? (
          <>
            <Player
              key={current.id}
              lecture={current}
              startPosition={startPosition}
              onProgress={(pos, dur, ended) => report(current.id, pos, dur, ended)}
              onEnded={playNext}
            />
            <h3 className="now">{current.title}</h3>
          </>
        ) : (
          <p className="note">Select a lecture to begin.</p>
        )}
      </main>
    </div>
  );
}
