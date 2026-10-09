"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type CapturedFrame = {
  image: string;
  capturedAt: string;
  videoTime: number;
};
export type VideoFeedHandle = { capture: () => CapturedFrame };

const SAMPLE_URL = "/samples/street-traffic.mp4";
const SAMPLE_LABEL = "Street traffic · sample clip";

export const VideoFeed = forwardRef<
  VideoFeedHandle,
  { onSourceChange: () => void; onReady: (ready: boolean) => void }
>(function VideoFeed({ onSourceChange, onReady }, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const objectUrl = useRef<string | null>(null);
  const generation = useRef(0);
  const [source, setSource] = useState(SAMPLE_LABEL);
  const [error, setError] = useState("");
  const [cameraPending, setCameraPending] = useState(false);

  function release() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    if (video.current) {
      video.current.pause();
      video.current.srcObject = null;
      video.current.removeAttribute("src");
      video.current.load();
    }
  }

  function reset() {
    generation.current += 1;
    release();
    setSource("");
    setError("");
    setCameraPending(false);
    onReady(false);
    onSourceChange();
  }

  function loadSample() {
    reset();
    setSource(SAMPLE_LABEL);
    if (video.current) {
      video.current.src = SAMPLE_URL;
      video.current.play().catch(() => {});
    }
  }

  useEffect(() => {
    // A server URL works in fresh tabs and other browsers. User-selected files
    // still use private, tab-scoped blob URLs and are never uploaded as videos.
    if (video.current) {
      video.current.src = SAMPLE_URL;
      video.current.play().catch(() => {});
    }
    return () => {
      generation.current += 1;
      release();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    capture() {
      const element = video.current;
      if (!element || element.readyState < 2 || !element.videoWidth)
        throw new Error("Load a video or start the camera first.");
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        768 / Math.max(element.videoWidth, element.videoHeight),
      );
      canvas.width = Math.round(element.videoWidth * scale);
      canvas.height = Math.round(element.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Your browser could not capture the frame.");
      context.drawImage(element, 0, 0, canvas.width, canvas.height);
      return {
        image: canvas.toDataURL("image/jpeg", 0.8).split(",")[1],
        capturedAt: new Date().toISOString(),
        videoTime: element.currentTime,
      };
    },
  }));

  async function startCamera() {
    reset();
    const current = generation.current;
    setCameraPending(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (current !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      setSource("Laptop camera");
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
    } catch {
      if (current === generation.current) {
        release();
        setSource("");
        setError(
          "Camera unavailable. Allow camera access in your browser, or choose a local video.",
        );
      }
    } finally {
      if (current === generation.current) setCameraPending(false);
    }
  }

  return (
    <section className="panel feed-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">01 / INPUT</span>
          <h2>Video feed</h2>
        </div>
        <span className="tag">{source ? "LOCAL SOURCE" : "NO SOURCE"}</span>
      </div>
      <div className="video-stage">
        <video
          ref={video}
          controls={!!source}
          preload="auto"
          poster={
            source === SAMPLE_LABEL ? "/samples/street-traffic.jpg" : undefined
          }
          playsInline
          muted
          loop
          onLoadedData={() => onReady(true)}
          onEmptied={() => onReady(false)}
          onError={() => {
            onReady(false);
            setError(
              "This video could not be decoded. Try an H.264 MP4 or WebM file.",
            );
          }}
        />
        {!source && (
          <div className="video-empty">
            <div className="viewfinder" aria-hidden="true">
              ◉
            </div>
            <h3>Your view, understood locally.</h3>
            <p>
              Choose a dashcam clip or use your camera.
              <br />
              Only sampled frames go to the model on this laptop.
            </p>
          </div>
        )}
        {source && <div className="source-label">{source}</div>}
      </div>
      <div className="source-controls">
        <button onClick={loadSample}>Load sample clip</button>
        <label className="button primary">
          Choose video
          <input
            type="file"
            accept="video/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              reset();
              objectUrl.current = URL.createObjectURL(file);
              setSource(file.name);
              if (video.current) {
                video.current.src = objectUrl.current;
                video.current.play().catch(() => {});
              }
              event.target.value = "";
            }}
          />
        </label>
        <button onClick={startCamera} disabled={cameraPending}>
          {cameraPending ? "Opening camera…" : "Use camera"}
        </button>
        {(source || cameraPending) && (
          <button className="text-button" onClick={reset}>
            Clear source
          </button>
        )}
        <span className="muted">MP4 / WebM · stays on your laptop</span>
      </div>
      {source === SAMPLE_LABEL && (
        <p className="muted" style={{ padding: "0 20px 16px", margin: 0 }}>
          Street traffic by Editor ·{" "}
          <a href="/samples/attribution.txt" target="_blank" rel="noreferrer">
            CC BY 3.0 · source and changes
          </a>
          . If playback is paused, press Play.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
});
