"use client";
/**
 * VideoJournalist.tsx
 * ─────────────────────────────────────────────────────────────────
 * Lifelike D-ID streaming avatar journalist.
 * Uses @d-id/client-sdk to connect a pre-created D-ID Agent,
 * stream real-time video over WebRTC, and speak journalist lines.
 *
 * Requirements (set in .env.local):
 *   DID_CLIENT_KEY   — from D-ID Studio → Agent → Embed → data-client-key
 *   DID_AGENT_ID     — from D-ID Studio → Agent → Embed → data-agent-id
 *
 * Flow:
 *   1. connect()  — establishes WebRTC, idle video shows
 *   2. speak(text) — streams the journalist's line as talking video
 *   3. disconnect() — cleans up on end
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";

export interface VideoJournalistHandle {
  speak: (text: string) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => void;
  isReady: boolean;
  getSrcObject: () => MediaStream | null;
}

interface Props {
  clientKey: string;
  agentId: string;
  onReady?: () => void;
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
  onError?: (err: string) => void;
  className?: string;
}

const VideoJournalist = forwardRef<VideoJournalistHandle, Props>(
  ({ clientKey, agentId, onReady, onSpeakStart, onSpeakEnd, onError, className }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const agentManagerRef = useRef<any>(null);
    const srcObjectRef = useRef<MediaStream | null>(null);
    const [connectionState, setConnectionState] = useState<
      "idle" | "connecting" | "connected" | "error"
    >("idle");
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [sdkLoaded, setSdkLoaded] = useState(false);

    // Dynamically import the D-ID SDK (client-side only)
    useEffect(() => {
      import("@d-id/client-sdk")
        .then(() => setSdkLoaded(true))
        .catch(() => onError?.("D-ID SDK failed to load"));
    }, []);

    const connect = async () => {
      if (!sdkLoaded || !clientKey || !agentId) return;
      setConnectionState("connecting");

      try {
        const { createAgentManager } = await import("@d-id/client-sdk");

        const callbacks = {
          onSrcObjectReady(value: MediaStream) {
            srcObjectRef.current = value;
            if (videoRef.current) {
              videoRef.current.srcObject = value;
            }
          },

          onVideoStateChange(state: string) {
            if (state === "STOP") {
              // Revert to idle video
              if (videoRef.current && agentManagerRef.current?.agent?.presenter?.idle_video) {
                videoRef.current.srcObject = undefined as any;
                videoRef.current.src = agentManagerRef.current.agent.presenter.idle_video;
              }
              setIsSpeaking(false);
              onSpeakEnd?.();
            } else {
              // Actively speaking
              if (videoRef.current && srcObjectRef.current) {
                videoRef.current.src = "";
                videoRef.current.srcObject = srcObjectRef.current;
              }
              setIsSpeaking(true);
              onSpeakStart?.();
            }
          },

          onConnectionStateChange(state: string) {
            if (state === "connected") {
              setConnectionState("connected");
              onReady?.();
            } else if (state === "fail" || state === "closed") {
              setConnectionState("error");
              onError?.(`Connection ${state}`);
            }
          },

          onError(error: any) {
            console.error("D-ID error:", error);
            setConnectionState("error");
            onError?.(error?.message || "D-ID streaming error");
          },
        };

        const manager = await createAgentManager(agentId, {
          auth: { type: "key", clientKey },
          callbacks,
          streamOptions: { compatibilityMode: "auto", streamWarmup: true },
        });

        agentManagerRef.current = manager;
        await manager.connect();
      } catch (err: any) {
        setConnectionState("error");
        onError?.(err.message || "Failed to connect to D-ID");
      }
    };

    const speak = async (text: string): Promise<void> => {
      if (!agentManagerRef.current || connectionState !== "connected") {
        throw new Error("D-ID agent not connected");
      }
      await agentManagerRef.current.speak({ type: "text", input: text });
    };

    const disconnect = () => {
      agentManagerRef.current?.disconnect();
      agentManagerRef.current = null;
      setConnectionState("idle");
      setIsSpeaking(false);
    };

    useImperativeHandle(ref, () => ({
      speak,
      connect,
      disconnect,
      isReady: connectionState === "connected",
      getSrcObject: () => srcObjectRef.current,
    }));

    return (
      <div className={`relative ${className || ""}`}>
        {/* The actual streaming video */}
        <video
          ref={videoRef}
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
              Video journalist ready to connect
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
              <br />Check your D-ID API keys.
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

VideoJournalist.displayName = "VideoJournalist";
export default VideoJournalist;
