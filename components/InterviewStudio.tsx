"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Mic, Square, Download, Volume2, VolumeX,
  SkipForward, AlertCircle, Loader2, Infinity, Hand,
  CircleDot, StopCircle, Video, VideoOff,
  ChevronDown, ChevronUp, Camera, CameraOff, Radio
} from "lucide-react";
import { JournalistProfile, Message } from "@/agents/journalist";
import JournalistAvatar from "./JournalistAvatar";
import { useSessionRecorder } from "@/hooks/useSessionRecorder";
import type { VideoJournalistHandle } from "./VideoJournalist";

const VideoJournalist = dynamic(() => import("./VideoJournalist"), { ssr: false });

interface Props {
  journalist: JournalistProfile;
  storyTitle: string;
  storyContext: string;
  didClientKey?: string;
  didAgentId?: string;
  onEnd: (transcript: string) => void;
}

type Phase = "ready" | "opening" | "active" | "ended";
type MicMode = "push-to-talk" | "hands-free";

const VAD_SILENCE_MS = 1800;
const VAD_SPEECH_THRESHOLD = 14;

function getSupportedAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "audio/webm";
}

function getSupportedVideoMime(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) return "video/webm;codecs=vp9,opus";
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) return "video/webm;codecs=vp8,opus";
  if (MediaRecorder.isTypeSupported("video/webm")) return "video/webm";
  if (MediaRecorder.isTypeSupported("video/mp4")) return "video/mp4";
  return "video/webm";
}

export default function InterviewStudio({
  journalist, storyTitle, storyContext,
  didClientKey, didAgentId, onEnd,
}: Props) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [history, setHistory] = useState<Message[]>([]);
  const [isJournalistSpeaking, setIsJournalistSpeaking] = useState(false);
  const [isUserRecording, setIsUserRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [sessionTime, setSessionTime] = useState(0);
  const [micMode, setMicMode] = useState<MicMode>("push-to-talk");
  const [handsFreeActive, setHandsFreeActive] = useState(false);
  const [vadState, setVadState] = useState<"waiting" | "user-speaking" | "silence">("waiting");
  const [vadLevel, setVadLevel] = useState(0);
  const [videoMode, setVideoMode] = useState<"avatar" | "video">("avatar");
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [didReady, setDidReady] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Recording state
  const sessionRecorder = useSessionRecorder();
  const [sessionRecording, setSessionRecording] = useState(false);
  const [userVideoBlob, setUserVideoBlob] = useState<Blob | null>(null);
  const [journalistAudioBlob, setJournalistAudioBlob] = useState<Blob | null>(null);

  // Core refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const didRef = useRef<VideoJournalistHandle | null>(null);

  // PTT refs
  const pttRecorder = useRef<MediaRecorder | null>(null);
  const pttChunks = useRef<Blob[]>([]);

  // Hands-free refs
  const hfStream = useRef<MediaStream | null>(null);
  const hfRecorder = useRef<MediaRecorder | null>(null);
  const hfChunks = useRef<Blob[]>([]);
  const hfAudioCtx = useRef<AudioContext | null>(null);
  const hfAnalyser = useRef<AnalyserNode | null>(null);
  const hfSilenceTimer = useRef<NodeJS.Timeout | null>(null);
  const hfRecordStartTime = useRef<number | null>(null);
  const hfVadActive = useRef(false);
  const hfVadLoop = useRef<number | null>(null);

  // Dual recording refs
  const userVideoRecorder = useRef<MediaRecorder | null>(null);
  const userVideoChunks = useRef<Blob[]>([]);
  const journalistAudioCtx = useRef<AudioContext | null>(null);
  const journalistAudioDest = useRef<MediaStreamAudioDestinationNode | null>(null);
  const journalistAudioRecorder = useRef<MediaRecorder | null>(null);
  const journalistAudioChunks = useRef<Blob[]>([]);

  // Sync refs for use in callbacks
  const isJournalistSpeakingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const historyRef = useRef<Message[]>([]);
  useEffect(() => { isJournalistSpeakingRef.current = isJournalistSpeaking; }, [isJournalistSpeaking]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { historyRef.current = history; }, [history]);

  // Timer
  useEffect(() => {
    if (phase === "active" || phase === "opening") {
      timerRef.current = setInterval(() => setSessionTime(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // Auto-scroll + auto-open transcript on new message
  useEffect(() => {
    if (transcriptRef.current)
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    if (history.length > 0) setTranscriptOpen(true);
  }, [history]);

  // Sync webcam to video element
  useEffect(() => {
    if (webcamEnabled && webcamStream && webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = webcamStream;
    }
  }, [webcamEnabled, webcamStream]);

  useEffect(() => { return () => stopHandsFree(); }, []);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const hasDID = !!(didClientKey && didAgentId);

  // ─── TTS playback ────────────────────────────────────────────
  const playAudio = async (base64: string): Promise<void> => {
    if (!base64) return;
    return new Promise((resolve) => {
      try {
        const audio = new Audio(`data:audio/mp3;base64,${base64}`);
        audioRef.current = audio;
        setIsJournalistSpeaking(true);

        // Pipe audio into journalist track recorder if active
        if (journalistAudioCtx.current && journalistAudioDest.current) {
          try {
            const elSrc = journalistAudioCtx.current.createMediaElementSource(audio);
            elSrc.connect(journalistAudioDest.current);
            elSrc.connect(journalistAudioCtx.current.destination);
          } catch { /* already connected */ }
        }

        audio.onended = () => { setIsJournalistSpeaking(false); resolve(); };
        audio.onerror = () => { setIsJournalistSpeaking(false); resolve(); };
        audio.play().catch(() => { setIsJournalistSpeaking(false); resolve(); });
      } catch {
        setIsJournalistSpeaking(false);
        resolve();
      }
    });
  };

  // ─── Journalist response (with existing history) ──────────────
  const askJournalistWithHistory = useCallback(async (fullHistory: Message[]) => {
    setIsProcessing(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch("/api/interview/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          journalistId: journalist.id, storyTitle, storyContext,
          history: fullHistory, isOpening: false,
          ttsEnabled: ttsEnabled || videoMode === "video",
        }),
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const msg: Message = { role: "journalist", content: data.text, timestamp: new Date() };
      setHistory(prev => [...prev, msg]);

      if (videoMode === "video" && didReady && didRef.current) {
        setIsJournalistSpeaking(true);
        try { await didRef.current.speak(data.text); }
        catch { if (data.audioBase64) await playAudio(data.audioBase64); }
        setIsJournalistSpeaking(false);
      } else if (ttsEnabled && data.audioBase64) {
        await playAudio(data.audioBase64);
      }
    } catch (err: any) {
      setError(err.name === "AbortError"
        ? "Request timed out. Check your API keys."
        : err.message);
    } finally {
      setIsProcessing(false);
    }
  }, [journalist.id, storyTitle, storyContext, ttsEnabled, videoMode, didReady]);

  // ─── Journalist response (uses current history state) ─────────
  const askJournalist = useCallback(async (isOpening = false) => {
    setIsProcessing(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch("/api/interview/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          journalistId: journalist.id, storyTitle, storyContext,
          history, isOpening,
          ttsEnabled: ttsEnabled || videoMode === "video",
        }),
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get response");

      const msg: Message = { role: "journalist", content: data.text, timestamp: new Date() };
      setHistory(prev => [...prev, msg]);

      if (videoMode === "video" && didReady && didRef.current) {
        setIsJournalistSpeaking(true);
        try { await didRef.current.speak(data.text); }
        catch { if (data.audioBase64) await playAudio(data.audioBase64); }
        setIsJournalistSpeaking(false);
      } else if (ttsEnabled && data.audioBase64) {
        await playAudio(data.audioBase64);
      }
    } catch (err: any) {
      setError(err.name === "AbortError"
        ? "Request timed out. Check your API keys."
        : err.message);
    } finally {
      setIsProcessing(false);
    }
  }, [journalist.id, storyTitle, storyContext, history, ttsEnabled, videoMode, didReady]);

  const startInterview = async () => {
    setPhase("opening");
    if (videoMode === "video" && hasDID && didRef.current && !didReady) {
      try { await didRef.current.connect(); } catch { /* handled via onError */ }
    }
    await askJournalist(true);
    setPhase("active");
  };

  // ─── Submit audio blob to Deepgram ────────────────────────────
  const submitAudio = useCallback(async (blob: Blob, mimeType: string, currentHistory: Message[]) => {
    if (blob.size < 1500) {
      console.warn("Audio blob too small:", blob.size, "bytes — skipping");
      return;
    }
    const formData = new FormData();
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    formData.append("audio", blob, `audio.${ext}`);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch("/api/interview/transcribe", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) { setError(`Transcription failed: ${data.error}`); return; }
      const transcript = (data.transcript || "").trim();
      if (!transcript) return;
      const userMsg: Message = { role: "interviewee", content: transcript, timestamp: new Date() };
      const updated = [...currentHistory, userMsg];
      setHistory(updated);
      await askJournalistWithHistory(updated);
    } catch (err: any) {
      setError(err.name === "AbortError"
        ? "Transcription timed out. Please try again."
        : "Could not send audio. Check your connection.");
    }
  }, [askJournalistWithHistory]);

  // ─── Push-to-talk ─────────────────────────────────────────────
  const startPTT = async () => {
    if (isJournalistSpeaking || isProcessing) return;
    const mime = getSupportedAudioMime();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pttChunks.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = e => { if (e.data.size > 0) pttChunks.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsUserRecording(false);
        setIsProcessing(true);
        const blob = new Blob(pttChunks.current, { type: mime });
        await submitAudio(blob, mime, historyRef.current);
        setIsProcessing(false);
      };
      pttRecorder.current = recorder;
      recorder.start();
      setIsUserRecording(true);
      if (sessionRecording && sessionRecorder.recordingState === "idle") {
        sessionRecorder.startSession(stream, audioRef.current);
      }
    } catch (err: any) {
      setError(
        err.name === "NotFoundError" ? "No microphone found." :
        err.name === "NotAllowedError" ? "Microphone access denied. Allow mic in browser settings." :
        `Microphone error: ${err.message}`
      );
    }
  };

  const stopPTT = () => {
    if (pttRecorder.current?.state === "recording") pttRecorder.current.stop();
  };

  // ─── Hands-free VAD ──────────────────────────────────────────
  const startHandsFree = async () => {
    const mime = getSupportedAudioMime();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      hfStream.current = stream;
      const ctx = new AudioContext();
      hfAudioCtx.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      hfAnalyser.current = analyser;
      if (sessionRecording && sessionRecorder.recordingState === "idle") {
        sessionRecorder.startSession(stream, audioRef.current);
      }
      hfVadActive.current = true;
      setHandsFreeActive(true);
      setVadState("waiting");
      runVAD();
    } catch (err: any) {
      setError(
        err.name === "NotFoundError" ? "No microphone found." :
        err.name === "NotAllowedError" ? "Microphone access denied." :
        `Microphone error: ${err.message}`
      );
    }
  };

  const stopHandsFree = () => {
    hfVadActive.current = false;
    if (hfVadLoop.current) cancelAnimationFrame(hfVadLoop.current);
    if (hfSilenceTimer.current) clearTimeout(hfSilenceTimer.current);
    if (hfRecorder.current?.state === "recording") hfRecorder.current.stop();
    hfStream.current?.getTracks().forEach(t => t.stop());
    hfAudioCtx.current?.close();
    hfAudioCtx.current = null;
    hfAnalyser.current = null;
    hfStream.current = null;
    hfRecorder.current = null;
    hfChunks.current = [];
    hfRecordStartTime.current = null;
    setHandsFreeActive(false);
    setIsUserRecording(false);
    setVadState("waiting");
    setVadLevel(0);
  };

  const toggleHandsFree = () => handsFreeActive ? stopHandsFree() : startHandsFree();

  const runVAD = useCallback(() => {
    if (!hfVadActive.current || !hfAnalyser.current) return;
    const analyser = hfAnalyser.current;
    const buf = new Uint8Array(analyser.fftSize);
    const mime = getSupportedAudioMime();

    const tick = () => {
      if (!hfVadActive.current) return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const val = (buf[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / buf.length) * 100;
      setVadLevel(Math.min(100, rms * 3));
      const isSpeaking = rms > VAD_SPEECH_THRESHOLD;

      if (isJournalistSpeakingRef.current || isProcessingRef.current) {
        hfVadLoop.current = requestAnimationFrame(tick);
        return;
      }

      if (isSpeaking) {
        if (hfSilenceTimer.current) { clearTimeout(hfSilenceTimer.current); hfSilenceTimer.current = null; }
        // Start recording immediately — no delay
        if (!hfRecorder.current && hfStream.current) {
          hfRecordStartTime.current = Date.now();
          const recorder = new MediaRecorder(hfStream.current, { mimeType: mime });
          hfChunks.current = [];
          recorder.ondataavailable = e => { if (e.data.size > 0) hfChunks.current.push(e.data); };
          const capturedHistory = [...historyRef.current];
          recorder.onstop = async () => {
            setIsUserRecording(false);
            setVadState("waiting");
            hfRecorder.current = null;
            const duration = Date.now() - (hfRecordStartTime.current || 0);
            hfRecordStartTime.current = null;
            const blob = new Blob(hfChunks.current, { type: mime });
            if (duration < 400 || blob.size < 1500) return; // discard noise
            setIsProcessing(true);
            await submitAudio(blob, mime, capturedHistory);
            setIsProcessing(false);
          };
          hfRecorder.current = recorder;
          recorder.start();
          setIsUserRecording(true);
          setVadState("user-speaking");
        }
      } else {
        if (hfRecorder.current?.state === "recording" && !hfSilenceTimer.current) {
          hfSilenceTimer.current = setTimeout(() => {
            if (hfRecorder.current?.state === "recording") hfRecorder.current.stop();
            hfSilenceTimer.current = null;
            setVadState("silence");
          }, VAD_SILENCE_MS);
        } else if (!hfRecorder.current) {
          hfRecordStartTime.current = null;
        }
      }
      hfVadLoop.current = requestAnimationFrame(tick);
    };
    hfVadLoop.current = requestAnimationFrame(tick);
  }, [submitAudio]);

  useEffect(() => {
    if (handsFreeActive && !isJournalistSpeaking && !isProcessing) {
      if (hfVadLoop.current) cancelAnimationFrame(hfVadLoop.current);
      runVAD();
    }
  }, [history, handsFreeActive, isJournalistSpeaking, isProcessing, runVAD]);

  // ─── Webcam ──────────────────────────────────────────────────
  const toggleWebcam = async () => {
    if (webcamEnabled) {
      webcamStream?.getTracks().forEach(t => t.stop());
      if (userVideoRecorder.current?.state === "recording") userVideoRecorder.current.stop();
      setWebcamStream(null);
      setWebcamEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setWebcamStream(stream);
        setWebcamEnabled(true);
      } catch (err: any) {
        setError(err.name === "NotAllowedError"
          ? "Camera/mic access denied."
          : "Could not access camera.");
      }
    }
  };

  // ─── User video recording ─────────────────────────────────────
  const startUserVideoRecording = () => {
    if (!webcamStream) return;
    const mime = getSupportedVideoMime();
    try {
      const recorder = new MediaRecorder(webcamStream, { mimeType: mime });
      userVideoChunks.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) userVideoChunks.current.push(e.data); };
      recorder.onstop = () => setUserVideoBlob(new Blob(userVideoChunks.current, { type: mime }));
      recorder.start(500);
      userVideoRecorder.current = recorder;
    } catch { /* browser may not support video recording */ }
  };

  const stopUserVideoRecording = () => {
    if (userVideoRecorder.current?.state === "recording") userVideoRecorder.current.stop();
  };

  const downloadUserVideo = () => {
    if (!userVideoBlob) return;
    const url = URL.createObjectURL(userVideoBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wtpn-you-${storyTitle.slice(0, 20).replace(/\s+/g, "-")}-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Journalist audio recording ──────────────────────────────
  const startJournalistAudioRecording = () => {
    try {
      const ctx = new AudioContext();
      journalistAudioCtx.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      journalistAudioDest.current = dest;
      const mime = getSupportedAudioMime();
      const recorder = new MediaRecorder(dest.stream, { mimeType: mime });
      journalistAudioChunks.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) journalistAudioChunks.current.push(e.data); };
      recorder.onstop = () => setJournalistAudioBlob(new Blob(journalistAudioChunks.current, { type: mime }));
      recorder.start(500);
      journalistAudioRecorder.current = recorder;
    } catch { /* ignore */ }
  };

  const stopJournalistAudioRecording = () => {
    if (journalistAudioRecorder.current?.state === "recording") journalistAudioRecorder.current.stop();
    journalistAudioCtx.current?.close();
    journalistAudioCtx.current = null;
    journalistAudioDest.current = null;
  };

  const downloadJournalistAudio = () => {
    if (!journalistAudioBlob) return;
    const url = URL.createObjectURL(journalistAudioBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wtpn-${journalist.name.replace(/\s+/g, "-")}-audio-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Session recording (all tracks) ──────────────────────────
  const toggleSessionRecording = () => {
    if (sessionRecording) {
      sessionRecorder.stopSession();
      stopUserVideoRecording();
      stopJournalistAudioRecording();
      setSessionRecording(false);
    } else {
      setSessionRecording(true);
      startJournalistAudioRecording();
      if (webcamStream) startUserVideoRecording();
    }
  };

  // ─── Download transcript ──────────────────────────────────────
  const downloadTranscript = () => {
    const lines = history.map(m =>
      `[${m.role === "journalist" ? journalist.name.toUpperCase() : "YOU"}]\n${m.content}\n`
    ).join("\n");
    const full = `WE THE PEOPLE NEWS — EXCLUSIVE INTERVIEW\n${"═".repeat(50)}\nStory: ${storyTitle}\nJournalist: ${journalist.name} — ${journalist.outlet}\nDuration: ${formatTime(sessionTime)}\nDate: ${new Date().toLocaleDateString()}\n${"═".repeat(50)}\n\n${lines}`;
    const blob = new Blob([full], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wtpn-interview-${storyTitle.slice(0, 30).replace(/\s+/g, "-")}-${Date.now()}.txt`;
    a.click();
  };

  // ─── End interview ────────────────────────────────────────────
  const endInterview = () => {
    setPhase("ended");
    stopHandsFree();
    sessionRecorder.stopSession();
    stopUserVideoRecording();
    stopJournalistAudioRecording();
    if (audioRef.current) audioRef.current.pause();
    webcamStream?.getTracks().forEach(t => t.stop());
    didRef.current?.disconnect();
    const fullText = history.map(m =>
      `${m.role === "journalist" ? journalist.name : "Interviewee"}: ${m.content}`
    ).join("\n\n");
    onEnd(fullText);
  };

  // ──────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-studio-border bg-studio-panel flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-9 h-7 rounded-sm bg-studio-red flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black leading-none" style={{ fontSize: "8px", letterSpacing: "-0.5px" }}>WTP<br/>NEWS</span>
            </div>
          </div>
          {(phase === "active" || phase === "opening") && (
            <div className="flex items-center gap-1.5 text-red-400 text-xs font-bold animate-pulse">
              <span className="w-2 h-2 rounded-full bg-red-500" />LIVE
            </div>
          )}
          <span className="text-xs text-studio-muted font-mono">{formatTime(sessionTime)}</span>
          {sessionRecording && (
            <div className="flex items-center gap-1 text-red-400 text-xs">
              <CircleDot size={11} className="animate-pulse" />
              REC {formatTime(sessionRecorder.durationSecs)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {hasDID && (
            <button
              onClick={() => setVideoMode(m => m === "avatar" ? "video" : "avatar")}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
                videoMode === "video"
                  ? "bg-blue-600/20 text-blue-400 border border-blue-600/40"
                  : "text-studio-muted hover:text-white"
              }`}
            >
              {videoMode === "video" ? <Video size={12} /> : <VideoOff size={12} />}
              Live Video
            </button>
          )}
          <button onClick={() => setTtsEnabled(!ttsEnabled)} className={`p-1.5 rounded-md transition-colors ${ttsEnabled ? "text-studio-accent" : "text-studio-muted hover:text-white"}`}>
            {ttsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <button onClick={toggleWebcam} className={`p-1.5 rounded-md transition-colors ${webcamEnabled ? "text-studio-accent" : "text-studio-muted hover:text-white"}`}>
            {webcamEnabled ? <Camera size={15} /> : <CameraOff size={15} />}
          </button>
          <button onClick={toggleSessionRecording} className={`p-1.5 rounded-md transition-colors ${sessionRecording ? "text-red-400" : "text-studio-muted hover:text-white"}`}>
            {sessionRecording ? <StopCircle size={15} /> : <CircleDot size={15} />}
          </button>
          {sessionRecorder.recordingState === "stopped" && (
            <button onClick={() => sessionRecorder.downloadRecording(`wtpn-session-${storyTitle.slice(0,20).replace(/\s+/g,"-")}-${Date.now()}`)}
              title="Download full session" className="p-1.5 rounded-md text-green-400 hover:text-green-300 transition-colors">
              <Download size={15} />
            </button>
          )}
          {journalistAudioBlob && (
            <button onClick={downloadJournalistAudio} title="Download journalist audio" className="p-1.5 rounded-md text-blue-400 hover:text-blue-300 transition-colors">
              <Download size={15} />
            </button>
          )}
          {userVideoBlob && (
            <button onClick={downloadUserVideo} title="Download your video" className="p-1.5 rounded-md text-purple-400 hover:text-purple-300 transition-colors">
              <Download size={15} />
            </button>
          )}
          {history.length > 0 && (
            <button onClick={downloadTranscript} title="Download transcript" className="p-1.5 rounded-md text-studio-muted hover:text-white transition-colors">
              <Download size={15} />
            </button>
          )}
          {phase === "active" && (
            <button onClick={endInterview}
              className="ml-1 px-3 py-1 bg-red-700/30 text-red-400 border border-red-700/40 rounded-md text-xs font-semibold hover:bg-red-700/50 transition-colors">
              End Interview
            </button>
          )}
        </div>
      </div>

      {/* ── BROADCAST VIDEO PANELS ── */}
      <div className="flex flex-1 min-h-0">

        {/* LEFT — Journalist */}
        <div className="flex-1 relative bg-black overflow-hidden">
          {videoMode === "video" && hasDID ? (
            <VideoJournalist
              ref={didRef}
              clientKey={didClientKey!}
              agentId={didAgentId!}
              onReady={() => setDidReady(true)}
              onSpeakStart={() => setIsJournalistSpeaking(true)}
              onSpeakEnd={() => setIsJournalistSpeaking(false)}
              onError={(e) => setError(`Video journalist: ${e}`)}
              className="w-full h-full rounded-none"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: `radial-gradient(ellipse at center, ${journalist.accentColor}11 0%, #0a0a0f 70%)` }}>
              <JournalistAvatar
                name={journalist.name}
                title={journalist.title}
                outlet={journalist.outlet}
                accentColor={journalist.accentColor}
                isSpeaking={isJournalistSpeaking}
                isListening={isUserRecording}
                avatarStyle={journalist.avatarStyle}
              />
            </div>
          )}

          {/* Lower-third — journalist */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent pt-10 pb-3 px-4 pointer-events-none">
            <div className="flex items-end justify-between">
              <div style={{ borderLeft: `3px solid ${journalist.accentColor}` }} className="pl-2">
                <div className="text-white text-sm font-bold leading-tight">{journalist.name}</div>
                <div className="text-xs" style={{ color: journalist.accentColor }}>{journalist.title}</div>
                <div className="text-[10px] text-white/60">{journalist.outlet}</div>
              </div>
              {isJournalistSpeaking && (
                <div className="flex items-center gap-1 bg-studio-red text-white text-[9px] font-bold px-2 py-0.5 rounded mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />ON AIR
                </div>
              )}
              {isProcessing && !isJournalistSpeaking && (
                <div className="flex gap-1 mb-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: journalist.accentColor, animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Ready overlay */}
          {phase === "ready" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[1px]">
              {hasDID && videoMode === "video" && !didReady && (
                <button onClick={() => didRef.current?.connect()}
                  className="mb-4 px-5 py-2 rounded-lg text-black text-sm font-bold transition-all hover:opacity-90"
                  style={{ background: journalist.accentColor }}>
                  Connect Video Feed
                </button>
              )}
              <button
                onClick={startInterview}
                className="flex items-center gap-2 px-10 py-4 rounded-xl text-black font-bold text-base transition-all hover:scale-105 active:scale-95"
                style={{ background: journalist.accentColor }}
              >
                <Radio size={20} /> Begin Interview
              </button>
              <p className="mt-3 text-xs text-white/50">{storyTitle || "General interview"}</p>
            </div>
          )}

          {phase === "opening" && isProcessing && history.length === 0 && (
            <div className="absolute bottom-16 left-4 right-4 flex items-center gap-2 bg-black/80 rounded-lg px-3 py-2">
              <Loader2 size={14} className="animate-spin" style={{ color: journalist.accentColor }} />
              <span className="text-xs text-white/70">{journalist.name} is preparing the opening...</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px bg-studio-border flex-shrink-0" />

        {/* RIGHT — User */}
        <div className="flex-1 relative bg-black overflow-hidden">
          {webcamEnabled && webcamStream ? (
            <video ref={webcamVideoRef} autoPlay muted playsInline
              className="w-full h-full object-cover" />
          ) : (
            <div onClick={toggleWebcam}
              className="w-full h-full flex flex-col items-center justify-center cursor-pointer bg-gradient-to-b from-studio-dark to-black group transition-colors hover:bg-studio-panel/10">
              <div className="w-20 h-20 rounded-full border-2 border-dashed border-studio-border flex items-center justify-center mb-3 group-hover:border-studio-accent transition-colors">
                <Camera size={28} className="text-studio-muted group-hover:text-studio-accent transition-colors" />
              </div>
              <p className="text-sm text-studio-muted group-hover:text-white transition-colors">Click to enable your camera</p>
              <p className="text-xs text-studio-muted/60 mt-1">Records you independently</p>
            </div>
          )}

          {/* Lower-third — user */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent pt-10 pb-3 px-4 pointer-events-none">
            <div className="flex items-end justify-between">
              <div style={{ borderLeft: "3px solid #1a6bff" }} className="pl-2">
                <div className="text-white text-sm font-bold leading-tight">You</div>
                <div className="text-xs text-blue-400">Interviewee</div>
                <div className="text-[10px] text-white/60">We The People News · Exclusive</div>
              </div>
              <div className="flex items-center gap-1.5 mb-0.5">
                {isUserRecording && (
                  <div className="flex items-center gap-1 bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE MIC
                  </div>
                )}
                {sessionRecording && (
                  <div className="flex items-center gap-1 bg-black/60 border border-red-600/50 text-red-400 text-[9px] font-bold px-1.5 py-0.5 rounded">
                    <CircleDot size={8} className="animate-pulse" />REC
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── TRANSCRIPT (collapsible) ── */}
      {history.length > 0 && (
        <>
          <div
            className="flex items-center justify-between px-4 py-1.5 border-t border-studio-border bg-studio-panel cursor-pointer hover:bg-studio-card transition-colors flex-shrink-0"
            onClick={() => setTranscriptOpen(o => !o)}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-studio-muted">Transcript</span>
              <span className="text-[10px] text-studio-muted">· {history.length} exchanges</span>
            </div>
            {transcriptOpen ? <ChevronDown size={13} className="text-studio-muted" /> : <ChevronUp size={13} className="text-studio-muted" />}
          </div>
          {transcriptOpen && (
            <div ref={transcriptRef} className="h-36 overflow-y-auto bg-studio-dark border-t border-studio-border flex-shrink-0 p-3 space-y-2">
              {history.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "interviewee" ? "flex-row-reverse" : ""}`}>
                  <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
                    style={{
                      background: msg.role === "journalist" ? `${journalist.accentColor}22` : "rgba(26,107,255,0.15)",
                      border: `1px solid ${msg.role === "journalist" ? journalist.accentColor + "44" : "rgba(26,107,255,0.3)"}`,
                      color: msg.role === "journalist" ? journalist.accentColor : "#1a6bff",
                    }}>
                    {msg.role === "journalist" ? journalist.name[0] : "Y"}
                  </div>
                  <div className={`flex-1 max-w-[85%] flex flex-col gap-0.5 ${msg.role === "interviewee" ? "items-end" : "items-start"}`}>
                    <div className="text-[9px] text-studio-muted">
                      {msg.role === "journalist" ? journalist.name : "You"} · {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="rounded-lg px-3 py-1.5 text-xs leading-relaxed"
                      style={{
                        background: msg.role === "journalist" ? "rgba(22,22,31,0.9)" : "rgba(26,107,255,0.12)",
                        border: `1px solid ${msg.role === "journalist" ? "#252535" : "rgba(26,107,255,0.25)"}`,
                        borderLeft: msg.role === "journalist" ? `2px solid ${journalist.accentColor}` : undefined,
                        color: "#e8e8f0",
                      }}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── ERROR ── */}
      {error && (
        <div className="mx-3 my-1 flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-700/40 rounded-lg text-xs text-red-300 flex-shrink-0">
          <AlertCircle size={13} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200 text-base leading-none">×</button>
        </div>
      )}

      {/* ── CONTROL BAR ── */}
      {phase === "active" && (
        <div className="border-t border-studio-border bg-studio-panel px-4 py-2.5 flex-shrink-0">
          <div className="flex items-center justify-center mb-2">
            <div className="flex bg-studio-card border border-studio-border rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => { setMicMode("push-to-talk"); if (handsFreeActive) stopHandsFree(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  micMode === "push-to-talk" ? "bg-studio-accent text-black" : "text-studio-muted hover:text-white"
                }`}
              >
                <Hand size={11} /> Push-to-Talk
              </button>
              <button
                onClick={() => setMicMode("hands-free")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  micMode === "hands-free" ? "text-white" : "text-studio-muted hover:text-white"
                }`}
                style={micMode === "hands-free" ? {
                  background: `${journalist.accentColor}22`,
                  color: journalist.accentColor,
                  border: `1px solid ${journalist.accentColor}44`,
                } : {}}
              >
                <Infinity size={11} /> Hands-Free
              </button>
            </div>
          </div>

          {micMode === "push-to-talk" && (
            <div className="flex items-center justify-center gap-5">
              <button onClick={() => askJournalist(false)} disabled={isProcessing || isJournalistSpeaking}
                title="Skip to next question"
                className="p-2 rounded-lg text-studio-muted hover:text-white hover:bg-studio-card transition-colors disabled:opacity-40">
                <SkipForward size={17} />
              </button>
              <button
                onMouseDown={startPTT} onMouseUp={stopPTT}
                onTouchStart={startPTT} onTouchEnd={stopPTT}
                disabled={isProcessing || isJournalistSpeaking}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 ${
                  isUserRecording ? "bg-red-600 rec-ring" : "bg-studio-accent hover:bg-yellow-400"
                }`}
              >
                {isUserRecording ? <Square size={18} className="text-white" fill="white" /> : <Mic size={20} className="text-black" />}
              </button>
              <div className="text-xs text-studio-muted w-20 text-center leading-tight">
                {isJournalistSpeaking
                  ? `${journalist.name.split(" ")[0]} speaking…`
                  : isProcessing ? "Processing…"
                  : isUserRecording ? "Release to send"
                  : "Hold to speak"}
              </div>
            </div>
          )}

          {micMode === "hands-free" && (
            <div className="flex items-center justify-center gap-5">
              <button onClick={() => askJournalist(false)} disabled={isProcessing || isJournalistSpeaking}
                title="Skip to next question"
                className="p-2 rounded-lg text-studio-muted hover:text-white hover:bg-studio-card transition-colors disabled:opacity-40">
                <SkipForward size={17} />
              </button>
              <button
                onClick={toggleHandsFree}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
                  handsFreeActive
                    ? vadState === "user-speaking" ? "bg-red-600 rec-ring" : "bg-green-700"
                    : "bg-studio-card border-2 border-studio-border hover:border-studio-accent"
                }`}
              >
                {handsFreeActive
                  ? vadState === "user-speaking" ? <Mic size={20} className="text-white" /> : <Infinity size={20} className="text-white" />
                  : <Mic size={20} className="text-studio-muted" />}
              </button>
              <div className="flex flex-col gap-1 w-20">
                <div className="w-full h-2 bg-studio-card rounded-full overflow-hidden border border-studio-border">
                  <div className="h-full rounded-full transition-all duration-75"
                    style={{
                      width: `${vadLevel}%`,
                      background: vadLevel > 50 ? "#cc2936" : vadLevel > 20 ? journalist.accentColor : "#252535",
                    }} />
                </div>
                <span className="text-[10px] text-studio-muted text-center">
                  {!handsFreeActive ? "Tap to start"
                    : isJournalistSpeaking ? "AI speaking"
                    : vadState === "user-speaking" ? "● Speaking"
                    : "Listening…"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ENDED STATE ── */}
      {phase === "ended" && (
        <div className="border-t border-studio-border bg-studio-panel px-4 py-3 flex-shrink-0 text-center">
          <div className="text-sm font-semibold text-white mb-1">Interview Complete · {history.length} exchanges · {formatTime(sessionTime)}</div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {sessionRecorder.recordingState === "stopped" && (
              <button onClick={() => sessionRecorder.downloadRecording(`wtpn-session-${storyTitle.slice(0,20).replace(/\s+/g,"-")}-${Date.now()}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-800/30 text-green-400 border border-green-700/40 rounded-lg text-xs font-semibold hover:bg-green-800/50 transition-colors">
                <Download size={12} /> Full Session
              </button>
            )}
            {journalistAudioBlob && (
              <button onClick={downloadJournalistAudio}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-800/30 text-blue-400 border border-blue-700/40 rounded-lg text-xs font-semibold hover:bg-blue-800/50 transition-colors">
                <Download size={12} /> Journalist Audio
              </button>
            )}
            {userVideoBlob && (
              <button onClick={downloadUserVideo}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-800/30 text-purple-400 border border-purple-700/40 rounded-lg text-xs font-semibold hover:bg-purple-800/50 transition-colors">
                <Download size={12} /> Your Video
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── TICKER ── */}
      <div className="bg-studio-red text-white text-xs py-1 overflow-hidden flex-shrink-0">
        <div className="ticker-inner whitespace-nowrap">
          ● LIVE &nbsp;|&nbsp; We The People News &nbsp;|&nbsp; {journalist.name} · {journalist.outlet} &nbsp;|&nbsp; {storyTitle || "Exclusive Interview"} &nbsp;|&nbsp; {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} &nbsp;|&nbsp; EXCLUSIVE &nbsp;|&nbsp; ● LIVE
        </div>
      </div>
    </div>
  );
}
