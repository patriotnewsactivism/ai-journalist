/**
 * useSessionRecorder.ts
 * ─────────────────────────────────────────────────────────────────
 * Records the full interview session as a downloadable audio file.
 *
 * Strategy:
 *   - Captures the system audio output (journalist TTS) via a hidden
 *     <audio> element hooked into AudioContext.createMediaElementSource
 *   - Captures the user's microphone
 *   - Merges both into a single MediaRecorder stream
 *   - On stop → produces a webm blob → download link
 *
 * Fallback: if system audio capture isn't available (browser/OS
 * restrictions), records mic only and appends the journalist text
 * to the transcript for the written record.
 * ─────────────────────────────────────────────────────────────────
 */

import { useRef, useState, useCallback } from "react";

export type RecordingState = "idle" | "recording" | "stopped";

export interface SessionRecorderHandle {
  startSession: (micStream: MediaStream, journalistAudioEl: HTMLAudioElement | null) => void;
  stopSession: () => void;
  downloadRecording: (filename: string) => void;
  recordingState: RecordingState;
  durationSecs: number;
}

export function useSessionRecorder(): SessionRecorderHandle {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [durationSecs, setDurationSecs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef<string>("audio/mp4");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const startSession = useCallback(
    (micStream: MediaStream, journalistAudioEl: HTMLAudioElement | null) => {
      if (recordingState === "recording") return;

      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();
        destRef.current = dest;

        // Mix mic track
        const micSource = ctx.createMediaStreamSource(micStream);
        micSource.connect(dest);

        // Mix journalist audio element if available
        if (journalistAudioEl) {
          try {
            const elSource = ctx.createMediaElementSource(journalistAudioEl);
            elSource.connect(dest);
            elSource.connect(ctx.destination); // still play it audibly
          } catch {
            // Already connected — ignore
          }
        }

        chunksRef.current = [];

        const mime = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        mimeRef.current = mime;

        const recorder = new MediaRecorder(dest.stream, { mimeType: mime });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          blobRef.current = new Blob(chunksRef.current, { type: mime });
          setRecordingState("stopped");
          if (timerRef.current) clearInterval(timerRef.current);
        };

        recorder.start(500); // collect chunks every 500ms
        recorderRef.current = recorder;
        setRecordingState("recording");
        setDurationSecs(0);

        timerRef.current = setInterval(() => setDurationSecs((s) => s + 1), 1000);
      } catch (err) {
        console.warn("Session recorder setup failed:", err);
        // Silent fail — interview still works without recording
      }
    },
    [recordingState]
  );

  const stopSession = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const downloadRecording = useCallback((filename: string) => {
    if (!blobRef.current) return;
    const ext = mimeRef.current.includes("mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(blobRef.current);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return { startSession, stopSession, downloadRecording, recordingState, durationSecs };
}
