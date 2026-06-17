"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic, MicOff, Square, Download,
  Volume2, VolumeX, Radio, Camera, CameraOff, SkipForward,
  AlertCircle, Loader2, Infinity, Hand
} from "lucide-react";
import { JOURNALISTS, JournalistProfile, Message } from "@/agents/journalist";
import JournalistAvatar from "./JournalistAvatar";

interface Props {
  journalist: JournalistProfile;
  storyTitle: string;
  storyContext: string;
  onEnd: (transcript: string) => void;
}

type Phase = "ready" | "opening" | "active" | "ended";
type MicMode = "push-to-talk" | "hands-free";

// VAD config — silence detection
const VAD_SILENCE_MS = 1800;      // stop after 1.8s of silence
const VAD_SPEECH_THRESHOLD = 14;  // RMS threshold to count as "speaking"
const VAD_MIN_SPEECH_MS = 600;    // must speak for at least 600ms to count

export default function InterviewStudio({ journalist, storyTitle, storyContext, onEnd }: Props) {
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
  const [vadLevel, setVadLevel] = useState(0); // 0-100 for the meter
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Push-to-talk refs
  const pttMediaRecorder = useRef<MediaRecorder | null>(null);
  const pttChunks = useRef<Blob[]>([]);

  // Hands-free VAD refs
  const hfStream = useRef<MediaStream | null>(null);
  const hfRecorder = useRef<MediaRecorder | null>(null);
  const hfChunks = useRef<Blob[]>([]);
  const hfAudioCtx = useRef<AudioContext | null>(null);
  const hfAnalyser = useRef<AnalyserNode | null>(null);
  const hfSilenceTimer = useRef<NodeJS.Timeout | null>(null);
  const hfSpeechStartTime = useRef<number | null>(null);
  const hfVadActive = useRef(false);
  const hfVadLoop = useRef<number | null>(null);
  const isJournalistSpeakingRef = useRef(false);
  const isProcessingRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { isJournalistSpeakingRef.current = isJournalistSpeaking; }, [isJournalistSpeaking]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);

  // Timer
  useEffect(() => {
    if (phase === "active" || phase === "opening") {
      timerRef.current = setInterval(() => setSessionTime(t => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [history]);

  // Cleanup hands-free on unmount
  useEffect(() => {
    return () => stopHandsFree();
  }, []);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ─── TTS playback ────────────────────────────────────────────
  const playAudio = async (base64: string): Promise<void> => {
    return new Promise((resolve) => {
      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      audioRef.current = audio;
      setIsJournalistSpeaking(true);
      audio.onended = () => { setIsJournalistSpeaking(false); resolve(); };
      audio.onerror = () => { setIsJournalistSpeaking(false); resolve(); };
      audio.play().catch(() => { setIsJournalistSpeaking(false); resolve(); });
    });
  };

  // ─── Core: ask journalist ─────────────────────────────────────
  const askJournalistWithHistory = useCallback(async (fullHistory: Message[]) => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/interview/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journalistId: journalist.id,
          storyTitle,
          storyContext,
          history: fullHistory,
          isOpening: false,
          ttsEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const msg: Message = { role: "journalist", content: data.text, timestamp: new Date() };
      setHistory(prev => [...prev, msg]);

      if (ttsEnabled && data.audioBase64) {
        await playAudio(data.audioBase64);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  }, [journalist.id, storyTitle, storyContext, ttsEnabled]);

  const askJournalist = useCallback(async (isOpening = false) => {
    setIsProcessing(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journalistId: journalist.id,
          storyTitle,
          storyContext,
          history,
          isOpening,
          ttsEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get response");

      const msg: Message = { role: "journalist", content: data.text, timestamp: new Date() };
      setHistory(prev => [...prev, msg]);

      if (ttsEnabled && data.audioBase64) {
        await playAudio(data.audioBase64);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  }, [journalist.id, storyTitle, storyContext, history, ttsEnabled]);

  const startInterview = async () => {
    setPhase("opening");
    await askJournalist(true);
    setPhase("active");
  };

  // ─── Submit audio to transcribe ───────────────────────────────
  const submitAudio = async (blob: Blob, currentHistory: Message[]) => {
    if (blob.size < 1000) return; // too small — likely silence
    const formData = new FormData();
    formData.append("audio", blob, "audio.webm");

    try {
      const res = await fetch("/api/interview/transcribe", { method: "POST", body: formData });
      const data = await res.json();
      const transcript = (data.transcript || "").trim();

      if (!transcript) return;

      const userMsg: Message = { role: "interviewee", content: transcript, timestamp: new Date() };
      const updated = [...currentHistory, userMsg];
      setHistory(updated);
      await askJournalistWithHistory(updated);
    } catch {
      setError("Transcription failed. Please try again.");
    }
  };

  // ─── PUSH-TO-TALK ─────────────────────────────────────────────
  const startPTT = async () => {
    if (isJournalistSpeaking || isProcessing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pttChunks.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = e => { if (e.data.size > 0) pttChunks.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsUserRecording(false);
        setIsProcessing(true);
        const blob = new Blob(pttChunks.current, { type: "audio/webm" });
        await submitAudio(blob, history);
        setIsProcessing(false);
      };
      pttMediaRecorder.current = recorder;
      recorder.start();
      setIsUserRecording(true);
    } catch {
      setError("Microphone access denied.");
    }
  };

  const stopPTT = () => {
    if (pttMediaRecorder.current?.state === "recording") {
      pttMediaRecorder.current.stop();
    }
  };

  // ─── HANDS-FREE VAD ───────────────────────────────────────────
  const startHandsFree = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      hfStream.current = stream;

      // Set up Web Audio analyser for VAD
      const ctx = new AudioContext();
      hfAudioCtx.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      hfAnalyser.current = analyser;

      hfVadActive.current = true;
      setHandsFreeActive(true);
      setVadState("waiting");
      runVAD();
    } catch {
      setError("Microphone access denied.");
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
    hfSpeechStartTime.current = null;
    setHandsFreeActive(false);
    setIsUserRecording(false);
    setVadState("waiting");
    setVadLevel(0);
  };

  const toggleHandsFree = () => {
    if (handsFreeActive) {
      stopHandsFree();
    } else {
      startHandsFree();
    }
  };

  // VAD loop — runs on animation frame
  const runVAD = useCallback(() => {
    if (!hfVadActive.current || !hfAnalyser.current) return;

    const analyser = hfAnalyser.current;
    const buf = new Uint8Array(analyser.fftSize);

    const tick = () => {
      if (!hfVadActive.current) return;

      analyser.getByteTimeDomainData(buf);

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const val = (buf[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / buf.length) * 100;
      setVadLevel(Math.min(100, rms * 3));

      const isSpeaking = rms > VAD_SPEECH_THRESHOLD;
      const jSpeaking = isJournalistSpeakingRef.current;
      const processing = isProcessingRef.current;

      // Don't pick up journalist's audio output as user speech
      if (jSpeaking || processing) {
        hfVadLoop.current = requestAnimationFrame(tick);
        return;
      }

      if (isSpeaking) {
        // Clear any silence timer
        if (hfSilenceTimer.current) {
          clearTimeout(hfSilenceTimer.current);
          hfSilenceTimer.current = null;
        }

        // Start recording if not already
        if (!hfRecorder.current && hfStream.current) {
          if (!hfSpeechStartTime.current) {
            hfSpeechStartTime.current = Date.now();
          }

          // Only start recorder after minimum speech duration
          if (Date.now() - hfSpeechStartTime.current > VAD_MIN_SPEECH_MS) {
            const recorder = new MediaRecorder(hfStream.current, { mimeType: "audio/webm" });
            hfChunks.current = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) hfChunks.current.push(e.data); };

            const capturedHistory = [...history];
            recorder.onstop = async () => {
              setIsUserRecording(false);
              setVadState("waiting");
              hfRecorder.current = null;
              hfSpeechStartTime.current = null;

              if (hfChunks.current.length > 0) {
                setIsProcessing(true);
                const blob = new Blob(hfChunks.current, { type: "audio/webm" });
                await submitAudio(blob, capturedHistory);
                setIsProcessing(false);
              }
            };

            hfRecorder.current = recorder;
            recorder.start();
            setIsUserRecording(true);
            setVadState("user-speaking");
          }
        }
      } else {
        // Silence
        if (hfSpeechStartTime.current && Date.now() - hfSpeechStartTime.current < VAD_MIN_SPEECH_MS) {
          // Too short — reset
          hfSpeechStartTime.current = null;
        }

        if (hfRecorder.current?.state === "recording") {
          // Start silence timer if not already running
          if (!hfSilenceTimer.current) {
            hfSilenceTimer.current = setTimeout(() => {
              if (hfRecorder.current?.state === "recording") {
                hfRecorder.current.stop();
                setVadState("silence");
              }
              hfSilenceTimer.current = null;
            }, VAD_SILENCE_MS);
          }
        } else {
          hfSpeechStartTime.current = null;
        }
      }

      hfVadLoop.current = requestAnimationFrame(tick);
    };

    hfVadLoop.current = requestAnimationFrame(tick);
  }, [history, submitAudio]);

  // Restart VAD loop whenever history changes (so captured history stays current)
  useEffect(() => {
    if (handsFreeActive && !isJournalistSpeaking && !isProcessing) {
      if (hfVadLoop.current) cancelAnimationFrame(hfVadLoop.current);
      runVAD();
    }
  }, [history, handsFreeActive, isJournalistSpeaking, isProcessing, runVAD]);

  // ─── Camera ───────────────────────────────────────────────────
  const toggleVideo = async () => {
    if (videoEnabled) {
      videoStream?.getTracks().forEach(t => t.stop());
      setVideoStream(null);
      setVideoEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setVideoStream(stream);
        setVideoEnabled(true);
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setError("Camera access denied.");
      }
    }
  };

  // ─── Download transcript ──────────────────────────────────────
  const downloadTranscript = () => {
    const lines = history.map(m =>
      `[${m.role === "journalist" ? journalist.name.toUpperCase() : "YOU"}]\n${m.content}\n`
    ).join("\n");

    const fullTranscript = `AI JOURNALIST INTERVIEW STUDIO
═══════════════════════════════════════
Story: ${storyTitle}
Journalist: ${journalist.name} — ${journalist.outlet}
Duration: ${formatTime(sessionTime)}
Date: ${new Date().toLocaleDateString()}
═══════════════════════════════════════

${lines}`;

    const blob = new Blob([fullTranscript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-${storyTitle.slice(0, 30).replace(/\s+/g, "-")}-${Date.now()}.txt`;
    a.click();
  };

  // ─── End interview ────────────────────────────────────────────
  const endInterview = () => {
    setPhase("ended");
    stopHandsFree();
    if (audioRef.current) audioRef.current.pause();
    videoStream?.getTracks().forEach(t => t.stop());

    const fullText = history.map(m =>
      `${m.role === "journalist" ? journalist.name : "Interviewee"}: ${m.content}`
    ).join("\n\n");

    onEnd(fullText);
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-studio-border bg-studio-panel">
        <div className="flex items-center gap-3">
          {phase === "active" && (
            <div className="flex items-center gap-1.5 text-red-400 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-red-500 rec-ring" />
              LIVE INTERVIEW
            </div>
          )}
          <span className="text-xs text-studio-muted font-mono">{formatTime(sessionTime)}</span>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setTtsEnabled(!ttsEnabled)} title={ttsEnabled ? "Voice on" : "Voice off"}
            className={`p-1.5 rounded-md transition-colors ${ttsEnabled ? "text-studio-accent" : "text-studio-muted hover:text-white"}`}>
            {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button onClick={toggleVideo} title={videoEnabled ? "Camera on" : "Camera off"}
            className={`p-1.5 rounded-md transition-colors ${videoEnabled ? "text-studio-accent" : "text-studio-muted hover:text-white"}`}>
            {videoEnabled ? <Camera size={16} /> : <CameraOff size={16} />}
          </button>
          {history.length > 0 && (
            <button onClick={downloadTranscript} title="Download transcript"
              className="p-1.5 rounded-md text-studio-muted hover:text-white transition-colors">
              <Download size={16} />
            </button>
          )}
          {phase === "active" && (
            <button onClick={endInterview}
              className="px-3 py-1 bg-red-700/30 text-red-400 border border-red-700/40 rounded-md text-xs font-semibold hover:bg-red-700/50 transition-colors">
              End Interview
            </button>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">

        {/* Left — Journalist */}
        <div className="w-64 flex-shrink-0 bg-studio-panel border-r border-studio-border flex flex-col items-center justify-start pt-8 px-4 gap-6">
          <JournalistAvatar
            name={journalist.name}
            title={journalist.title}
            outlet={journalist.outlet}
            accentColor={journalist.accentColor}
            isSpeaking={isJournalistSpeaking}
            isListening={isUserRecording}
            avatarStyle={journalist.avatarStyle}
          />
          <div className="w-full">
            <div className="text-[10px] uppercase tracking-widest text-studio-muted mb-2 font-medium">Story</div>
            <div className="text-xs text-white/80 leading-relaxed bg-studio-card rounded-lg p-3 border border-studio-border"
              style={{ borderLeft: `3px solid ${journalist.accentColor}` }}>
              {storyTitle || "General interview"}
            </div>
          </div>
        </div>

        {/* Center — Transcript */}
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-4">

            {phase === "ready" && (
              <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
                <div>
                  <div className="text-5xl mb-4 font-display" style={{ color: journalist.accentColor }}>🎙</div>
                  <h2 className="text-xl font-display text-white mb-2">{journalist.name} is ready</h2>
                  <p className="text-studio-muted text-sm max-w-xs">{journalist.outlet} · {journalist.specialty}</p>
                </div>
                <button onClick={startInterview}
                  className="flex items-center gap-2 px-8 py-3 rounded-xl text-black font-bold text-sm transition-all hover:scale-105 active:scale-95"
                  style={{ background: journalist.accentColor }}>
                  <Radio size={18} /> Begin Interview
                </button>
              </div>
            )}

            {(phase === "opening") && isProcessing && history.length === 0 && (
              <div className="flex items-center gap-3 p-4 bg-studio-card rounded-xl border border-studio-border">
                <Loader2 size={18} className="animate-spin" style={{ color: journalist.accentColor }} />
                <span className="text-sm text-studio-muted">{journalist.name} is preparing the opening...</span>
              </div>
            )}

            {history.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "interviewee" ? "flex-row-reverse" : ""}`}>
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: msg.role === "journalist" ? `${journalist.accentColor}22` : "rgba(26,107,255,0.15)",
                    border: `1px solid ${msg.role === "journalist" ? journalist.accentColor + "44" : "rgba(26,107,255,0.3)"}`,
                    color: msg.role === "journalist" ? journalist.accentColor : "#1a6bff",
                  }}>
                  {msg.role === "journalist" ? journalist.name[0] : "Y"}
                </div>
                <div className={`flex-1 max-w-[80%] ${msg.role === "interviewee" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  <div className="text-[10px] text-studio-muted">
                    {msg.role === "journalist" ? journalist.name : "You"} · {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="rounded-xl px-4 py-3 text-sm leading-relaxed"
                    style={{
                      background: msg.role === "journalist" ? "rgba(22,22,31,0.9)" : "rgba(26,107,255,0.12)",
                      border: `1px solid ${msg.role === "journalist" ? "#252535" : "rgba(26,107,255,0.25)"}`,
                      borderLeft: msg.role === "journalist" ? `3px solid ${journalist.accentColor}` : undefined,
                      color: "#e8e8f0",
                    }}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}

            {isProcessing && history.length > 0 && (
              <div className="flex items-center gap-2 pl-11">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                      style={{ background: journalist.accentColor, animationDelay: `${i * 0.15}s`, opacity: 0.7 }} />
                  ))}
                </div>
                <span className="text-xs text-studio-muted">{journalist.name} is formulating...</span>
              </div>
            )}

            {phase === "ended" && (
              <div className="text-center py-8">
                <div className="text-2xl mb-2">🎬</div>
                <div className="text-white font-semibold">Interview Complete</div>
                <div className="text-xs text-studio-muted mt-1">{history.length} exchanges · {formatTime(sessionTime)}</div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-700/40 rounded-lg text-xs text-red-300">
              <AlertCircle size={14} />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">×</button>
            </div>
          )}

          {/* ── CONTROL BAR ─────────────────────────────────────── */}
          {phase === "active" && (
            <div className="border-t border-studio-border bg-studio-panel px-4 py-3">

              {/* Mode toggle tabs */}
              <div className="flex items-center justify-center mb-3">
                <div className="flex bg-studio-card border border-studio-border rounded-lg p-0.5 gap-0.5">
                  <button
                    onClick={() => { setMicMode("push-to-talk"); if (handsFreeActive) stopHandsFree(); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      micMode === "push-to-talk"
                        ? "bg-studio-accent text-black"
                        : "text-studio-muted hover:text-white"
                    }`}
                  >
                    <Hand size={12} />
                    Push-to-Talk
                  </button>
                  <button
                    onClick={() => setMicMode("hands-free")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      micMode === "hands-free"
                        ? "text-white"
                        : "text-studio-muted hover:text-white"
                    }`}
                    style={micMode === "hands-free" ? {
                      background: `${journalist.accentColor}22`,
                      color: journalist.accentColor,
                      border: `1px solid ${journalist.accentColor}44`,
                    } : {}}
                  >
                    <Infinity size={12} />
                    Hands-Free
                  </button>
                </div>
              </div>

              {/* PUSH-TO-TALK controls */}
              {micMode === "push-to-talk" && (
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => askJournalist(false)}
                    disabled={isProcessing || isJournalistSpeaking}
                    title="Skip — ask next question"
                    className="p-2 rounded-lg text-studio-muted hover:text-white hover:bg-studio-card transition-colors disabled:opacity-40"
                  >
                    <SkipForward size={18} />
                  </button>

                  <button
                    onMouseDown={startPTT}
                    onMouseUp={stopPTT}
                    onTouchStart={startPTT}
                    onTouchEnd={stopPTT}
                    disabled={isProcessing || isJournalistSpeaking}
                    className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 ${
                      isUserRecording ? "bg-red-600 rec-ring" : "bg-studio-accent hover:bg-yellow-400"
                    }`}
                  >
                    {isUserRecording
                      ? <Square size={20} className="text-white" fill="white" />
                      : <Mic size={22} className="text-black" />}
                  </button>

                  <div className="text-xs text-studio-muted text-center w-16">
                    {isUserRecording ? "Release to send" : "Hold to speak"}
                  </div>
                </div>
              )}

              {/* HANDS-FREE controls */}
              {micMode === "hands-free" && (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex items-center gap-4">
                    {/* Skip */}
                    <button
                      onClick={() => askJournalist(false)}
                      disabled={isProcessing || isJournalistSpeaking}
                      title="Ask next question"
                      className="p-2 rounded-lg text-studio-muted hover:text-white hover:bg-studio-card transition-colors disabled:opacity-40"
                    >
                      <SkipForward size={18} />
                    </button>

                    {/* Hands-free toggle button */}
                    <button
                      onClick={toggleHandsFree}
                      className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
                        handsFreeActive
                          ? vadState === "user-speaking"
                            ? "bg-red-600 rec-ring"
                            : "bg-green-700"
                          : "bg-studio-card border-2 border-studio-border hover:border-studio-accent"
                      }`}
                    >
                      {handsFreeActive
                        ? vadState === "user-speaking"
                          ? <Mic size={22} className="text-white" />
                          : <Infinity size={22} className="text-white" />
                        : <Mic size={22} className="text-studio-muted" />}
                    </button>

                    {/* VAD level meter */}
                    <div className="flex flex-col items-center gap-1 w-16">
                      <div className="w-full h-2 bg-studio-card rounded-full overflow-hidden border border-studio-border">
                        <div
                          className="h-full rounded-full transition-all duration-75"
                          style={{
                            width: `${vadLevel}%`,
                            background: vadLevel > 50
                              ? "#cc2936"
                              : vadLevel > 20
                              ? journalist.accentColor
                              : "#252535",
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-studio-muted">
                        {!handsFreeActive
                          ? "Tap to enable"
                          : isJournalistSpeaking
                          ? "AI speaking"
                          : vadState === "user-speaking"
                          ? "● You're speaking"
                          : "Listening..."}
                      </span>
                    </div>
                  </div>

                  {/* Hands-free status strip */}
                  {handsFreeActive && (
                    <div className="flex items-center gap-2 text-[10px] text-studio-muted">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: handsFreeActive ? "#22c55e" : "#555" }}
                      />
                      Open mic active · AI detects when you finish speaking · {VAD_SILENCE_MS / 1000}s silence auto-sends
                    </div>
                  )}
                </div>
              )}

              {/* Shared status line */}
              <div className="text-center text-[10px] text-studio-muted mt-2">
                {isJournalistSpeaking
                  ? `${journalist.name} is speaking...`
                  : isProcessing
                  ? "Processing..."
                  : micMode === "push-to-talk"
                  ? "Your turn to respond"
                  : handsFreeActive
                  ? "Two-way mic is open"
                  : "Enable hands-free for two-way conversation"}
              </div>
            </div>
          )}
        </div>

        {/* Right — User webcam */}
        {videoEnabled && (
          <div className="w-48 flex-shrink-0 bg-studio-panel border-l border-studio-border flex flex-col items-center justify-start pt-8 px-3 gap-3">
            <div className="relative w-36 h-36 rounded-full overflow-hidden border-2 border-blue-600/50 bg-black">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover"
                onLoadedMetadata={() => { if (videoRef.current) videoRef.current.srcObject = videoStream; }} />
              {isUserRecording && (
                <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-red-500 rec-ring" />
              )}
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-white">You</div>
              <div className="text-xs text-studio-muted">Interviewee</div>
            </div>
            <div className="px-2 py-1 rounded-full text-xs font-medium text-blue-400 border border-blue-600/30 bg-blue-900/20">
              {isUserRecording ? "● Recording" : "○ Camera On"}
            </div>
          </div>
        )}
      </div>

      {/* Breaking news ticker */}
      <div className="bg-studio-red text-white text-xs py-1 overflow-hidden">
        <div className="ticker-inner whitespace-nowrap">
          ● LIVE INTERVIEW SESSION &nbsp;&nbsp;|&nbsp;&nbsp; {journalist.name} · {journalist.outlet} &nbsp;&nbsp;|&nbsp;&nbsp; Story: {storyTitle || "Untitled"} &nbsp;&nbsp;|&nbsp;&nbsp; {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} &nbsp;&nbsp;|&nbsp;&nbsp; EXCLUSIVE &nbsp;&nbsp;|&nbsp;&nbsp; ● LIVE INTERVIEW SESSION
        </div>
      </div>
    </div>
  );
}
