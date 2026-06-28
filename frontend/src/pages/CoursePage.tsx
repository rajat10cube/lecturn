import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Music, Paperclip, PlayCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import AppHeader from "@/components/AppHeader";
import Player from "@/components/Player";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getCourse, putProgress, type LectureItem } from "@/api";

interface Prog {
  positionSec: number;
  completed: boolean;
}

function KindIcon({ kind }: { kind: string }) {
  if (kind === "document") return <FileText className="size-4 shrink-0" />;
  if (kind === "audio") return <Music className="size-4 shrink-0" />;
  return <PlayCircle className="size-4 shrink-0" />;
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
    if (!current) return;
    const idx = flat.findIndex((l) => l.id === current.id);
    if (idx >= 0 && idx + 1 < flat.length) setCurrentId(flat[idx + 1].id);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="container py-6 text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="container py-6 text-destructive">Course not found.</p>
      </div>
    );
  }

  const completedCount = Object.values(progress).filter((p) => p.completed).length;
  const coursePct = data.lectureCount ? Math.round((completedCount / data.lectureCount) * 100) : 0;
  const curProg = current ? progress[current.id] : undefined;
  const startPosition = curProg && !curProg.completed ? curProg.positionSec : 0;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="container grid gap-6 py-6 md:grid-cols-[330px_1fr]">
        <aside className="md:sticky md:top-20 md:max-h-[calc(100vh-6rem)] md:overflow-y-auto">
          <h1 className="text-xl font-semibold leading-tight">{data.title}</h1>
          {data.category && <Badge variant="muted" className="mt-2">{data.category}</Badge>}

          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${coursePct}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {completedCount}/{data.lectureCount} · {coursePct}%
            </p>
          </div>

          <div className="mt-5 space-y-5">
            {data.sections.map((s) => (
              <div key={s.id}>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {s.title}
                </div>
                <ul className="space-y-0.5">
                  {s.lectures.map((l) => {
                    const p = progress[l.id];
                    const active = l.id === currentId;
                    return (
                      <li key={l.id}>
                        <button
                          onClick={() => setCurrentId(l.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                          )}
                        >
                          {p?.completed ? (
                            <Check className={cn("size-4 shrink-0", active ? "" : "text-primary")} />
                          ) : (
                            <KindIcon kind={l.kind} />
                          )}
                          <span className="truncate">{l.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {data.attachments.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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

        <main>
          {current ? (
            <>
              <Player
                key={current.id}
                lecture={current}
                startPosition={startPosition}
                onProgress={(pos, dur, ended) => report(current.id, pos, dur, ended)}
                onEnded={playNext}
              />
              <h2 className="mt-4 text-lg font-medium">{current.title}</h2>
            </>
          ) : (
            <p className="text-muted-foreground">Select a lecture to begin.</p>
          )}
        </main>
      </div>
    </div>
  );
}
