"use client";
/**
 * AnamJournalist.tsx
 * ─────────────────────────────────────────────────────────────────
 * Lifelike Anam live-avatar journalist. Replaces the D-ID video
 * journalist in the same slot, with the same imperative handle
 * contract (connect / speak / disconnect / interrupt / isReady /
 * getSrcObject) so InterviewStudio needs no structural change.
 *
 * Pattern (proven in ~/workspace/don-avatar/anam-cartesia):
 * - Cartesia owns the voice (Sonic TTS, raw PCM s16le 16 kHz mono).
 * - Anam renders ONLY the face and lip-syncs it via audio passthrough.
 * - No voice or LLM is configured on the Anam side.
 * - The session token is minted server-side (POST /api/anam/session);
 *   ANAM_API_KEY never reaches the browser.
 * - Cartesia audio is NEVER played in the browser; the Anam <video>
 *   element is the single audio + video source, so there is no
 *   doubled speech.
 *
 * Order matters (live Anam docs):
 *   1. prefetch the session token on mount (it lives ~1 hour)
 *   2. on connect: createClient -> streamToVideoElement
 *   3. createAgentAudioInputStream ONLY after streamToVideoElement
 *      resolves (the session must be started first)
 *   4. sendAudioChunk per PCM chunk; endSequence() at the end of
 *      each turn and on barge-in (plus interruptPersona()).
 *
 * Voice: the journalist's Cartesia voiceId is passed in as a prop
 * (from agents/journalist.ts) and sent to /api/interview/anam-tts.
 * The Anam persona itself carries no voice — if the voiceId is
 * wrong for a persona, the face will still be right and the voice
 * will be wrong. Verify voiceIds before going live.
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";

export interface AnamJournalistHandle {
  speak: (text: string) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => void;
  interrupt: () => void;
  isReady: boolean;
  getSrcObject: () => MediaStream | null;
}

interface Props {
  journalistId: string;
  voiceId: string;
  onReady?: () => void;
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
  onError?: (err: string) => void;
  className?: string;
}

// Refresh tokens older than 45 min (Anam tokens live ~1 hour).
const TOKEN_MAX_AGE_MS = 45 * 60 * 1000;
const VIDEO_ELEMENT_ID = "anam-journalist-video";

const AnamJournalist = forwardRef<AnamJournalistHandle, Props>(
  ({ journalistId, voiceId, onReady, onSpeakStart, onSpeakEnd, onError, className }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const clientRef = useRef<any>(null);
    const audioInputRef = useRef<any>(null);
    const tokenCacheRef = useRef<{ token: string; fetchedAt: number } | null>(null);
    const speakAbortRef = useRef<AbortController | null>(null);
    const [connectionState, setConnectionState] = useState<
      "idle" | "connecting" | "connected" | "error"
    >("idle");
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [sdkLoaded, setSdkLoaded] = useState(false);

    // Dynamically import the Anam SDK (client-side only) and prefetch a
    // session token on mount, so the connect gesture only attaches the stream.
    useEffect(() => {
      let cancelled = false;
      import("@anam-ai/js-sdk")
        .then(() => {
          if (!cancelled) setSdkLoaded(true);
        })
        .catch(() => onError?.("Anam SDK failed to load"));
      fetchToken().catch((err) =>
        onError?.("Could not warm up an Anam session token: " + err.message)
      );
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function fetchToken(): Promise<string> {
      const res = await fetch("/api/anam/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journalistId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Session token request failed (${res.status})`);
      tokenCacheRef.current = { token: data.sessionToken, fetchedAt: Date.now() };
      return data.sessionToken;
    }

    async function getToken(): Promise<string> {
      const cached = tokenCacheRef.current;
      if (cached && Date.now() - cached.fetchedAt < TOKEN_MAX_AGE_MS) return cached.token;
      return fetchToken();
    }

    const connect = async () => {
      if (!sdkLoaded) {
        onError?.("Anam SDK not loaded yet");
        return;
      }
      setConnectionState("connecting");
      try {
        const { createClient } = await import("@anam-ai/js-sdk");
        const sessionToken = await getToken();

        const client = createClient(sessionToken, { disableInputAudio: true });
        clientRef.current = client;
        await client.streamToVideoElement(VIDEO_ELEMENT_ID);

        // ONLY after streamToVideoElement resolves (the session must be started).
        audioInputRef.current = client.createAgentAudioInputStream({
          encoding: "pcm_s16le",
          sampleRate: 16000,
          channels: 1,
        });

        setConnectionState("connected");
        onReady?.();
      } catch (err: any) {
        setConnectionState("error");
        onError?.(err.message || "Failed to connect to Anam");
      }
    };

    const speak = async (text: string): Promise<void> => {
      if (!clientRef.current || !audioInputRef.current || connectionState !== "connected") {
        throw new Error("Anam journalist not connected");
      }
      const abort = new AbortController();
      speakAbortRef.current = abort;
      try {
        const res = await fetch("/api/interview/anam-tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceId }),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Anam TTS failed (${res.status})`);
        }
        setIsSpeaking(true);
        onSpeakStart?.();
        // Stream raw PCM chunks straight into the Anam audio input.
        // Never played in the browser — the Anam video is the only audio source.
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (abort.signal.aborted) break;
          if (value && audioInputRef.current) {
            audioInputRef.current.sendAudioChunk(value);
          }
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          // Barge-in: the sequence is ended below; not an error.
        } else {
          onError?.(err.message || "Anam speak failed");
          throw err;
        }
      } finally {
        // End of turn (or barge-in): close the audio sequence cleanly
        // so the avatar's lips stop and the next turn starts clean.
        try {
          audioInputRef.current?.endSequence();
        } catch {}
        speakAbortRef.current = null;
        setIsSpeaking(false);
        onSpeakEnd?.();
      }
    };

    const interrupt = () => {
      // Barge-in: stop the avatar mid-sentence, end the audio sequence,
      // abort the in-flight TTS fetch so the next turn starts clean.
      if (clientRef.current && isSpeaking) {
        try {
          clientRef.current.interruptPersona();
        } catch {}
      }
      try {
        audioInputRef.current?.endSequence();
      } catch {}
      speakAbortRef.current?.abort();
      setIsSpeaking(false);
    };

    const disconnect = () => {
      try {
        speakAbortRef.current?.abort();
      } catch {}
      if (clientRef.current) {
        try {
          clientRef.current.stopStreaming();
        } catch {}
        clientRef.current = null;
      }
      audioInputRef.current = null;
      setConnectionState("idle");
      setIsSpeaking(false);
    };

    useEffect(() => disconnect, []);

    useImperativeHandle(ref, () => ({
      speak,
      connect,
      disconnect,
      interrupt,
      isReady: connectionState === "connected",
      getSrcObject: () =>
        (videoRef.current?.srcObject as MediaStream | null) ?? null,
    }));

    return (
      <div className={`relative ${className || ""}`}>
        {/* The Anam live video — also the single audio source */}
        <video
          ref={videoRef}
          id={VIDEO_ELEMENT_ID}
          autoPlay
          playsInline
          className="w-full h-full object-cover rounded-2xl"
          style={{ background: "#0a0a0f" }}
        />

        {/* Connection overlay states */}
        {connectionState === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-studio-panel border border-studio-border gap-3">
            <div className="text-4xl">🎙</div>
            <p className="text-xs text-studio-muted text-center px-4">
              Live video journalist ready to connect
            </p>
          </div>
        )}

        {connectionState === "connecting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-studio-panel border border-studio-border gap-3">
            <div className="w-8 h-8 border-2 border-studio-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-studio-muted">Connecting to video journalist...</p>
          </div>
        )}

        {connectionState === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-studio-panel border border-red-700/40 gap-3">
            <div className="text-3xl">⚠️</div>
            <p className="text-xs text-red-400 text-center px-4">
              Could not connect to video journalist.
              <br />
              Check your ANAM_API_KEY.
            </p>
          </div>
        )}

        {/* Speaking indicator */}
        {isSpeaking && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            ON AIR
          </div>
        )}
      </div>
    );
  }
);

AnamJournalist.displayName = "AnamJournalist";
export default AnamJournalist;
