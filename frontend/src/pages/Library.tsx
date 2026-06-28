import { useQuery } from "@tanstack/react-query";
import { Library as LibraryIcon, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AppHeader from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCourses, getSearch, type CourseCard } from "@/api";

function pct(c: CourseCard) {
  return c.lectureCount ? Math.round((c.completedCount / c.lectureCount) * 100) : 0;
}

function CourseCardView({ c }: { c: CourseCard }) {
  const p = pct(c);
  return (
    <Link
      to={`/course/${encodeURIComponent(c.slug)}`}
      className="group overflow-hidden rounded-lg border bg-card transition hover:border-primary/50 hover:shadow-md"
    >
      <div className="relative aspect-video bg-muted">
        {c.cover ? (
          <img src={c.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-muted to-accent text-muted-foreground">
            <LibraryIcon className="size-7 opacity-40" />
          </div>
        )}
        {c.category && (
          <Badge variant="muted" className="absolute left-2 top-2 bg-black/60 text-white backdrop-blur">
            {c.category}
          </Badge>
        )}
        {c.completedCount > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
            <div className="h-full bg-primary" style={{ width: `${p}%` }} />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="line-clamp-2 font-medium leading-snug">{c.title}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {c.completedCount > 0 ? `${c.completedCount}/${c.lectureCount} · ${p}%` : `${c.lectureCount} lectures`}
        </div>
      </div>
    </Link>
  );
}

export default function Library() {
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

  const browse = useMemo(
    () => (data?.courses ?? []).filter((c) => cat === "All" || c.category === cat),
    [data, cat],
  );
  const continueRow = useMemo(
    () =>
      (data?.courses ?? [])
        .filter((c) => c.lastActivity && c.completedCount < c.lectureCount)
        .sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""))
        .slice(0, 6),
    [data],
  );
  const bySlug = useMemo(() => {
    const m = new Map<string, CourseCard>();
    (data?.courses ?? []).forEach((c) => m.set(c.slug, c));
    return m;
  }, [data]);

  const results = search?.results ?? [];
  const courseHits = results.filter((r) => r.kind === "course");
  const lessonHits = results.filter((r) => r.kind === "lecture");

  return (
    <div className="min-h-screen">
      <AppHeader
        center={
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search courses & lessons…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        }
      />

      <main className="container py-6">
        {isLoading && <p className="text-muted-foreground">Loading library…</p>}
        {isError && <p className="text-destructive">Couldn’t reach the backend.</p>}

        {searching ? (
          <div className="space-y-8">
            {courseHits.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Courses</h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                  {courseHits.map((r) => {
                    const c = bySlug.get(r.slug);
                    return c ? <CourseCardView key={`c${r.refId}`} c={c} /> : null;
                  })}
                </div>
              </section>
            )}
            <section>
              <h2 className="mb-3 text-lg font-semibold">Lessons</h2>
              {lessonHits.length === 0 ? (
                <p className="text-muted-foreground">No lessons match.</p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {lessonHits.map((r) => (
                    <Link
                      key={`l${r.refId}`}
                      to={`/course/${encodeURIComponent(r.slug)}?lecture=${r.refId}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-accent"
                    >
                      <span className="font-medium">{r.title}</span>
                      <span className="truncate text-sm text-muted-foreground">{r.context}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-8">
            {continueRow.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Continue learning</h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                  {continueRow.map((c) => <CourseCardView key={c.id} c={c} />)}
                </div>
              </section>
            )}

            {data && (
              <div className="flex flex-wrap gap-2">
                {["All", ...data.categories].map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    variant={c === cat ? "default" : "outline"}
                    onClick={() => setCat(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            )}

            {data && data.courses.length === 0 ? (
              <div className="grid place-items-center rounded-lg border border-dashed py-16 text-center">
                <LibraryIcon className="mb-3 size-8 text-muted-foreground" />
                <p className="font-medium">No courses yet</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  Add a library that points at a folder of your downloaded courses.
                </p>
                <Button asChild>
                  <Link to="/settings">Add a library</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                {browse.map((c) => <CourseCardView key={c.id} c={c} />)}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
