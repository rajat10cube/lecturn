import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, FileText, Music, Paperclip, PlayCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import AppHeader from "@/components/AppHeader";
import Player from "@/components/Player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCourse, putProgress, type LectureItem } from "@/api";

interface Prog {
  positionSec: number;
  completed: boolean;
}

function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const c = cn("size-4 shrink-0", className);
  if (kind === "document") return <FileText className={c} />;
  if (kind === "audio") return <Music className={c} />;
  return <PlayCircle className={c} />;
}

function fmtDur(s?: number | null): string {
  if (!s || s <= 0) return "";
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function fmtTotal(s: number): string {
  if (s <= 0) return "";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function CoursePage() {
  const { slug = "" } = useParams();
  const [searchParams] = useSearchParams();
  const deepLinkId = searchParams.get("lecture");
  const qc = useQueryClient();
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
  const idx = current ? flat.findIndex((l) => l.id === current.id) : -1;

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
    if (ended) qc.invalidateQueries({ queryKey: ["courses"] });
  };

  const playNext = () => {
    if (idx >= 0 && idx + 1 < flat.length) setCurrentId(flat[idx + 1].id);
  };

  if (isLoading || isError || !data) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <AppHeader />
        <p className={cn("container py-6", isError ? "text-destructive" : "text-muted-foreground")}>
          {isError ? "Course not found." : "Loading…"}
        </p>
      </div>
    );
  }

  const completedCount = Object.values(progress).filter((p) => p.completed).length;
  const coursePct = data.lectureCount ? Math.round((completedCount / data.lectureCount) * 100) : 0;
  const totalSec = flat.reduce((a, l) => a + (l.durationSec || 0), 0);
  const curProg = current ? progress[current.id] : undefined;
  const startPosition = curProg && !curProg.completed ? curProg.positionSec : 0;

  return (
    <div className="flex flex-col md:h-screen md:overflow-hidden">
      <AppHeader />
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[340px_1fr]">
        {/* curriculum — title/progress pinned, lecture list scrolls */}
        <aside className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
          <div className="border-b p-4">
            <h1 className="text-lg font-semibold leading-tight">{data.title}</h1>
            {data.category && <Badge variant="muted" className="mt-2">{data.category}</Badge>}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${coursePct}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {completedCount}/{data.lectureCount} · {coursePct}%
              {totalSec > 0 && ` · ${fmtTotal(totalSec)}`}
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            {data.sections.map((s) => (
              <div key={s.id}>
                <div className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {s.title}
                </div>
                <ul className="space-y-0.5">
                  {s.lectures.map((l) => {
                    const p = progress[l.id];
                    const active = l.id === currentId;
                    const dur = fmtDur(l.durationSec);
                    const partial = !p?.completed && (p?.positionSec ?? 0) > 2 && (l.durationSec ?? 0) > 0;
                    const barPct = partial ? Math.min(100, (p!.positionSec / (l.durationSec as number)) * 100) : 0;
                    return (
                      <li key={l.id}>
                        <button
                          onClick={() => setCurrentId(l.id)}
                          className={cn(
                            "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {p?.completed ? (
                              <Check className={cn("size-4 shrink-0", !active && "text-primary")} />
                            ) : (
                              <KindIcon kind={l.kind} className={cn(!active && "text-muted-foreground")} />
                            )}
                            <span className="flex-1 truncate">{l.title}</span>
                            {dur && (
                              <span
                                className={cn(
                                  "shrink-0 text-xs tabular-nums",
                                  active ? "text-primary-foreground/80" : "text-muted-foreground",
                                )}
                              >
                                {dur}
                              </span>
                            )}
                          </div>
                          {partial && (
                            <div className="ml-6 mt-1 h-0.5 overflow-hidden rounded-full bg-foreground/15">
                              <div className="h-full bg-primary" style={{ width: `${barPct}%` }} />
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {data.attachments.length > 0 && (
              <div>
                <div className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Resources
                </div>
                <ul className="space-y-0.5">
                  {data.attachments.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                      <Paperclip className="size-4 shrink-0" /> <span className="truncate">{a.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>

        {/* stage */}
        <main className="min-h-0 overflow-y-auto">
          <div className="mx-auto max-w-5xl p-4 md:p-6">
            {current ? (
              <>
                <Player
                  key={current.id}
                  lecture={current}
                  startPosition={startPosition}
                  onProgress={(pos, dur, ended) => report(current.id, pos, dur, ended)}
                  onEnded={playNext}
                />
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-medium">{current.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      Lecture {idx + 1} of {flat.length}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={playNext} disabled={idx < 0 || idx + 1 >= flat.length}>
                    Next <ChevronRight />
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Select a lecture to begin.</p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
