import { useEffect, useRef, useState } from "react";
import mpegts from "mpegts.js";

import type { LectureItem } from "../api";

export default function Player({
  lecture,
  startPosition = 0,
  onProgress,
  onEnded,
}: {
  lecture: LectureItem;
  startPosition?: number;
  onProgress?: (positionSec: number, durationSec: number, ended: boolean) => void;
  onEnded?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const lastTick = useRef(0);
  const [err, setErr] = useState(false);

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
      video.src = mediaUrl; // native + remux (fragmented mp4)
    }

    return () => {
      if (player) {
        player.destroy();
      } else {
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
      <div className="player-doc">
        <iframe title={lecture.title} src={lecture.stream} className="doc-frame" />
        <a className="btn" href={lecture.stream} target="_blank" rel="noreferrer">
          Open document
        </a>
      </div>
    );
  }

  if (err) {
    return (
      <div className="player-msg">
        <p>Couldn’t play this file in the browser (remux/ffmpeg unavailable).</p>
        <a className="btn" href={lecture.stream}>Download</a>
      </div>
    );
  }

  return (
    <video
      ref={ref}
      className="player"
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
