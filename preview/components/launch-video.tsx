"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A muted looping video. It plays while at least half of it is on screen (unless the visitor prefers
 * reduced motion or paused it), and a small play/pause button in the corner has a ring that fills with
 * the playback progress.
 */
export function LaunchVideo({ src, className = "" }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const pausedByUser = useRef(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { if (!pausedByUser.current) video.play().catch(() => {}); }
      else video.pause();
    }, { threshold: 0.5 });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  // The ring follows playback from the frame loop, writing the style directly so playing never re-renders.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      const ring = ringRef.current;
      if (video && ring && video.duration > 0) ring.style.strokeDashoffset = String(1 - video.currentTime / video.duration);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    pausedByUser.current = !video.paused;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  return <div className={`relative w-full overflow-hidden rounded-[24px] border border-ds-outline-subtle bg-ds-surface-screen ${className}`}>
    <video ref={videoRef} src={src} loop muted playsInline preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} className="block h-full w-full object-contain" />
    <button type="button" onClick={toggle} className="absolute top-4 right-4 size-6 cursor-pointer rounded-full">
      <span className="relative flex size-full items-center justify-center rounded-full bg-ds-surface-control/60 backdrop-blur-[8px]">
        {playing
          ? <svg width="10.08" height="10.08" viewBox="0 0 20 20" fill="#ffffff"><rect x="5" y="4" width="3.5" height="12" rx="1" /><rect x="11.5" y="4" width="3.5" height="12" rx="1" /></svg>
          : <svg width="10.08" height="10.08" viewBox="0 0 20 20" fill="#ffffff" style={{ marginLeft: 0.8064 }}><path d="M16.0918 10L6 16.21V3.78906L16.0918 10Z" /></svg>}
        <svg viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute inset-0 size-full">
          <circle ref={ringRef} cx="12" cy="12" r="9" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset="1" style={{ transformOrigin: "center", transform: "rotate(-90deg)" }} />
        </svg>
      </span>
    </button>
  </div>;
}
