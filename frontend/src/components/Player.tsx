import mpegts from "mpegts.js";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { LectureItem } from "@/api";

export default function Player({
  lecture,
  startPosition = 0,
  onProgress,
  onEnded,
  onNext,
}: {
  lecture: LectureItem;
  startPosition?: number;
  onProgress?: (positionSec: number, durationSec: number, ended: boolean) => void;
  onEnded?: () => void;
  onNext?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastTick = useRef(0);
  const [err, setErr] = useState(false);

  // keyboard shortcuts (ignored while typing in a field)
  useEffect(() => {
    if (lecture.playback === "document") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const v = ref.current;
      if (!v) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (v.paused) void v.play();
          else v.pause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case "ArrowRight":
          e.preventDefault();
          v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 5);
          break;
        case "n":
        case "N":
          onNext?.();
          break;
        case "f":
        case "F":
          if (document.fullscreenElement) void document.exitFullscreen();
          else void v.requestFullscreen?.();
          break;
        case "m":
        case "M":
          v.muted = !v.muted;
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lecture.playback, onNext]);

  const mediaUrl =
    lecture.playback === "remux" ? `/api/lectures/${lecture.id}/remux` : lecture.stream;

  useEffect(() => {
    setErr(false);
    const video = ref.current;
    if (!video || lecture.playback === "document") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any = null;

    if (lecture.playback === "mpegts" && mpegts.isSupported()) {
      player = mpegts.createPlayer({ type: "mpegts", url: lecture.stream, isLive: false });
      player.attachMediaElement(video);
      player.load();
    } else {
      video.src = mediaUrl;
    }

    return () => {
      if (player) player.destroy();
      else {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [lecture.id, lecture.playback, lecture.stream, mediaUrl]);

  const handleLoaded = () => {
    const v = ref.current;
    if (!v) return;
    if (startPosition > 2 && (!v.duration || startPosition < v.duration - 1)) {
      try {
        v.currentTime = startPosition;
      } catch {
        /* not seekable yet */
      }
    }
  };
  const handleTime = () => {
    const v = ref.current;
    if (!v) return;
    const now = Date.now();
    if (now - lastTick.current > 5000) {
      lastTick.current = now;
      onProgress?.(v.currentTime, v.duration || 0, false);
    }
  };
  const flush = () => {
    const v = ref.current;
    if (v) onProgress?.(v.currentTime, v.duration || 0, false);
  };
  const handleEnded = () => {
    const v = ref.current;
    const d = v?.duration || 0;
    onProgress?.(d, d, true);
    onEnded?.();
  };

  if (lecture.playback === "document") {
    return (
      <div className="space-y-3">
        <iframe
          title={lecture.title}
          src={lecture.stream}
          className="aspect-video w-full rounded-lg border bg-white"
        />
        <Button asChild variant="secondary">
          <a href={lecture.stream} target="_blank" rel="noreferrer">Open document</a>
        </Button>
      </div>
    );
  }

  if (err) {
    return (
      <div className="grid aspect-video w-full place-items-center gap-3 rounded-lg border bg-card text-center">
        <div>
          <p className="text-muted-foreground">Couldn’t play this file in the browser.</p>
          <Button asChild className="mt-3">
            <a href={lecture.stream}>Download</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <video
      ref={ref}
      className="aspect-video w-full rounded-lg border bg-black"
      controls
      autoPlay
      onLoadedMetadata={handleLoaded}
      onTimeUpdate={handleTime}
      onPause={flush}
      onSeeked={flush}
      onEnded={handleEnded}
      onError={() => setErr(true)}
    >
      {lecture.subtitle && (
        <track default kind="subtitles" src={lecture.subtitle} srcLang="en" label="English" />
      )}
    </video>
  );
}
