// Typed API client. Grows alongside the backend.

const BASE = "/api";

export interface Health {
  status: string;
  service: string;
  version: string;
}

export interface CourseCard {
  id: number;
  slug: string;
  title: string;
  category: string | null;
  cover: string | null;
  lectureCount: number;
  completedCount: number;
  lastActivity: string | null;
}

export interface LibraryResponse {
  courses: CourseCard[];
  categories: string[];
}

export type Playback = "native" | "mpegts" | "remux" | "document";

export interface LectureItem {
  id: number;
  title: string;
  kind: string;
  playback: Playback;
  needsTranscode: boolean;
  hasSubtitle: boolean;
  durationSec: number | null;
  positionSec: number;
  completed: boolean;
  stream: string;
  subtitle: string | null;
}

export interface SectionItem {
  id: number;
  title: string;
  lectures: LectureItem[];
}

export interface CourseDetail {
  slug: string;
  title: string;
  category: string | null;
  cover: string | null;
  lectureCount: number;
  completedCount: number;
  resumeLectureId: number | null;
  sections: SectionItem[];
  attachments: { id: number; title: string; kind: string }[];
}

export interface ProgressIn {
  position_sec: number;
  duration_sec?: number | null;
  completed?: boolean;
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export interface SearchResult {
  kind: "course" | "lecture";
  refId: number;
  slug: string;
  title: string;
  context: string;
}

export const getHealth = () => getJSON<Health>("/health");
export const getCourses = () => getJSON<LibraryResponse>("/courses");
export const getCourse = (slug: string) =>
  getJSON<CourseDetail>(`/courses/${encodeURIComponent(slug)}`);
export const getSearch = (q: string) =>
  getJSON<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(q)}`);

export async function putProgress(lectureId: number, body: ProgressIn): Promise<void> {
  await fetch(`${BASE}/progress/${lectureId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
