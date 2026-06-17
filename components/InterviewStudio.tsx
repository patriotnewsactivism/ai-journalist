"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Mic, Square, Download, Volume2, VolumeX,
  Radio, Camera, CameraOff, SkipForward,
  AlertCircle, Loader2, Infinity, Hand,
  CircleDot, StopCircle, Video, VideoOff
} from "lucide-react";
import { JOURNALISTS, JournalistProfile, Message } from "@/agents/journalist";
import JournalistAvatar from "./JournalistAvatar";
import { useSessionRecorder } from "@/hooks/useSessionRecorder";
import type { VideoJournalistHandle } from "./VideoJournalist";

// Dynamically import VideoJournalist (uses browser APIs)
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
const VAD_MIN_SPEECH_MS = 600;

export default function InterviewStudio({
  journalist, storyTitle, storyContext,
  didClientKey, didAgentId, onEnd
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
  const [error, setError] = useState<string | null>(null);

  // Audio recording
  const sessionRecorder = useSessionRecorder();
  const [sessionRecording, setSessionRecording] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);           // webcam
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const didRef = useRef<VideoJournalistHandle | null>(null);

  // PTT refs
  const pttRecorder = useRef<MediaRecorder | null>(null);
  const pttChunks = useRef<Blob[]>([]);
  const pttMicStream = useRef<MediaStream | null>(null);

  // Hands-free refs
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

  useEffect(() => {
    if (transcriptRef.current)
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [history]);

  useEffect(() => { return () => stopHandsFree(); }, []);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ─── TTS via Deepgram ────────────────────────────────────────
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

  // ─── Core journalist response ─────────────────────────────────
  const askJournalistWithHistory = useCallback(async (fullHistory: Message[]) => {
    setIsProcessing(true);
    try {
      const res = await fetch("/api/interview/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journalistId: journalist.id,
          storyTitle, storyContext,
          history: fullHistory,
          isOpening: false,
          // Always request audio — used for either TTS or D-ID speak
          ttsEnabled: ttsEnabled || videoMode === "video",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const msg: Message = { role: "journalist", content: data.text, timestamp: new Date() };
      setHistory(prev => [...prev, msg]);

      // Video journalist speaks (D-ID)
      if (videoMode === "video" && didReady && didRef.current) {
        setIsJournalistSpeaking(true);
        try {
          await didRef.current.speak(data.text);
        } catch {
          // Fallback to TTS if D-ID fails
          if (data.audioBase64) await playAudio(data.audioBase64);
        }
        setIsJournalistSpeaking(false);
      } else if (ttsEnabled && data.audioBase64) {
        await playAudio(data.audioBase64);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  }, [journalist.id, storyTitle, storyContext, ttsEnabled, videoMode, didReady]);

  const askJournalist = useCallback(async (isOpening = false) => {
    setIsProcessing(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journalistId: journalist.id,
          storyTitle, storyContext,
          history,
          isOpening,
          ttsEnabled: ttsEnabled || videoMode === "video",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get response");

      const msg: Message = { role: "journalist", content: data.text, timestamp: new Date() };
      setHistory(prev => [...prev, msg]);

      if (videoMode === "video" && didReady && didRef.current) {
        setIsJournalistSpeaking(true);
        try {
          await didRef.current.speak(data.text);
        } catch {
          if (data.audioBase64) await playAudio(data.audioBase64);
        }
        setIsJournalistSpeaking(false);
      } else if (ttsEnabled && data.audioBase64) {
        await playAudio(data.audioBase64);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  }, [journalist.id, storyTitle, storyContext, history, ttsEnabled, videoMode, didReady]);

  const startInterview = async () => {
    setPhase("opening");
    await askJournalist(true);
    setPhase("active");
  };

  // ─── Submit audio ────────────────────────────────────────────
  const submitAudio = useCallback(async (blob: Blob, currentHistory: Message[]) => {
    if (blob.size < 1000) return;
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
  }, [askJournalistWithHistory]);

  // ─── PTT ────────────────────────────────────────────────────
  const startPTT = async () => {
    if (isJournalistSpeaking || isProcessing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      pttMicStream.current = stream;
      pttChunks.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorder.ondataavailable = e => { if (e.data.size > 0) pttChunks.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsUserRecording(false);
        setIsProcessing(true);
        await submitAudio(new Blob(pttChunks.current, { type: "audio/webm" }), historyRef.current);
        setIsProcessing(false);
      };
      pttRecorder.current = recorder;
      recorder.start();
      setIsUserRecording(true);

      // Start session recording on first mic use
      if (sessionRecording && sessionRecorder.recordingState === "idle") {
        sessionRecorder.startSession(stream, audioRef.current);
      }
    } catch {
      setError("Microphone access denied.");
    }
  };

  const stopPTT = () => {
    if (pttRecorder.current?.state === "recording") pttRecorder.current.stop();
  };

  // ─── Hands-free VAD ─────────────────────────────────────────
  const startHandsFree = async () => {
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
    if (handsFreeActive) stopHandsFree();
    else startHandsFree();
  };

  const runVAD = useCallback(() => {
    if (!hfVadActive.current || !hfAnalyser.current) return;
    const analyser = hfAnalyser.current;
    const buf = new Uint8Array(analyser.fftSize);

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

      const speaking = rms > VAD_SPEECH_THRESHOLD;
      if (isJournalistSpeakingRef.current || isProcessingRef.current) {
        hfVadLoop.current = requestAnimationFrame(tick);
        return;
      }

      if (speaking) {
        if (hfSilenceTimer.current) { clearTimeout(hfSilenceTimer.current); hfSilenceTimer.current = null; }
        if (!hfRecorder.current && hfStream.current) {
          if (!hfSpeechStartTime.current) hfSpeechStartTime.current = Date.now();
          if (Date.now() - hfSpeechStartTime.current > VAD_MIN_SPEECH_MS) {
            const recorder = new MediaRecorder(hfStream.current, { mimeType: "audio/webm" });
            hfChunks.current = [];
            recorder.ondataavailable = e => { if (e.data.size > 0) hfChunks.current.push(e.data); };
            const capturedHistory = [...historyRef.current];
            recorder.onstop = async () => {
              setIsUserRecording(false);
              setVadState("waiting");
              hfRecorder.current = null;
              hfSpeechStartTime.current = null;
              if (hfChunks.current.length > 0) {
                setIsProcessing(true);
                await submitAudio(new Blob(hfChunks.current, { type: "audio/webm" }), capturedHistory);
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
        if (hfSpeechStartTime.current && Date.now() - hfSpeechStartTime.current < VAD_MIN_SPEECH_MS)
          hfSpeechStartTime.current = null;
        if (hfRecorder.current?.state === "recording" && !hfSilenceTimer.current) {
          hfSilenceTimer.current = setTimeout(() => {
            if (hfRecorder.current?.state === "recording") hfRecorder.current.stop();
            hfSilenceTimer.current = null;
            setVadState("silence");
          }, VAD_SILENCE_MS);
        } else if (!hfRecorder.current) {
          hfSpeechStartTime.current = null;
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
      setWebcamStream(null);
      setWebcamEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setWebcamStream(stream);
        setWebcamEnabled(true);
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        setError("Camera access denied.");
      }
    }
  };

  // ─── Session recording toggle ────────────────────────────────
  const toggleSessionRecording = () => {
    if (sessionRecording) {
      sessionRecorder.stopSession();
      setSessionRecording(false);
    } else {
      setSessionRecording(true);
      // Will start on next mic use
    }
  };

  // ─── Download transcript ─────────────────────────────────────
  const downloadTranscript = () => {
    const lines = history.map(m =>
      `[${m.role === "journalist" ? journalist.name.toUpperCase() : "YOU"}]\n${m.content}\n`
    ).join("\n");
    const full = `AI JOURNALIST INTERVIEW STUDIO\n${"═".repeat(40)}\nStory: ${storyTitle}\nJournalist: ${journalist.name} — ${journalist.outlet}\nDuration: ${formatTime(sessionTime)}\nDate: ${new Date().toLocaleDateString()}\n${"═".repeat(40)}\n\n${lines}`;
    const blob = new Blob([full], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-${storyTitle.slice(0, 30).replace(/\s+/g, "-")}-${Date.now()}.txt`;
    a.click();
  };

  // ─── End interview ───────────────────────────────────────────
  const endInterview = () => {
    setPhase("ended");
    stopHandsFree();
    sessionRecorder.stopSession();
    if (audioRef.current) audioRef.current.pause();
    webcamStream?.getTracks().forEach(t => t.stop());
    didRef.current?.disconnect();

    const fullText = history.map(m =>
      `${m.role === "journalist" ? journalist.name : "Interviewee"}: ${m.content}`
    ).join("\n\n");
    onEnd(fullText);
  };

  const hasDID = !!(didClientKey && didAgentId);

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

          {/* Session recording indicator */}
          {sessionRecording && (
            <div className="flex items-center gap-1 text-red-400 text-xs">
              <CircleDot size={12} className="animate-pulse" />
              REC {formatTime(sessionRecorder.durationSecs)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Video mode toggle — only if D-ID keys provided */}
          {hasDID && (
            <button
              onClick={() => setVideoMode(m => m === "avatar" ? "video" : "avatar")}
              title={videoMode === "video" ? "Switch to SVG avatar" : "Switch to video journalist"}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
                videoMode === "video"
                  ? "bg-blue-600/20 text-blue-400 border border-blue-600/40"
                  : "text-studio-muted hover:text-white"
              }`}
            >
              {videoMode === "video" ? <Video size={13} /> : <VideoOff size={13} />}
              {videoMode === "video" ? "Live Video" : "Live Video"}
            </button>
          )}

          <button onClick={() => setTtsEnabled(!ttsEnabled)} title={ttsEnabled ? "Voice on" : "Voice off"}
            className={`p-1.5 rounded-md transition-colors ${ttsEnabled ? "text-studio-accent" : "text-studio-muted hover:text-white"}`}>
            {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button onClick={toggleWebcam} title={webcamEnabled ? "Webcam on" : "Webcam off"}
            className={`p-1.5 rounded-md transition-colors ${webcamEnabled ? "text-studio-accent" : "text-studio-muted hover:text-white"}`}>
            {webcamEnabled ? <Camera size={16} /> : <CameraOff size={16} />}
          </button>

          {/* Session audio record */}
          <button
            onClick={toggleSessionRecording}
            title={sessionRecording ? "Stop recording" : "Record interview audio"}
            className={`p-1.5 rounded-md transition-colors ${
              sessionRecording ? "text-red-400" : "text-studio-muted hover:text-white"
            }`}
          >
            {sessionRecording ? <StopCircle size={16} /> : <CircleDot size={16} />}
          </button>

          {/* Download recording */}
          {sessionRecorder.recordingState === "stopped" && (
            <button
              onClick={() => sessionRecorder.downloadRecording(
                `interview-audio-${storyTitle.slice(0,20).replace(/\s+/g,"-")}-${Date.now()}`
              )}
              title="Download audio recording"
              className="p-1.5 rounded-md text-green-400 hover:text-green-300 transition-colors"
            >
              <Download size={16} />
            </button>
          )}

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

      {/* Main */}
      <div className="flex flex-1 min-h-0">

        {/* Left — journalist panel */}
        <div className="w-64 flex-shrink-0 bg-studio-panel border-r border-studio-border flex flex-col items-center justify-start pt-6 px-4 gap-4">
          {videoMode === "video" && hasDID ? (
            <div className="w-full">
              {/* D-ID Video journalist */}
              <VideoJournalist
                ref={didRef}
                clientKey={didClientKey!}
                agentId={didAgentId!}
                onReady={() => setDidReady(true)}
                onSpeakStart={() => setIsJournalistSpeaking(true)}
                onSpeakEnd={() => setIsJournalistSpeaking(false)}
                onError={(e) => setError(`Video journalist: ${e}`)}
                className="w-full aspect-[3/4] rounded-2xl"
              />
              {!didReady && phase === "ready" && (
                <button
                  onClick={() => didRef.current?.connect()}
                  className="mt-3 w-full py-2 rounded-lg text-xs font-semibold text-black transition-all hover:opacity-90"
                  style={{ background: journalist.accentColor }}
                >
                  Connect Video Journalist
                </button>
              )}
              {didReady && (
                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Video journalist connected
                </div>
              )}
            </div>
          ) : (
            /* SVG Avatar fallback */
            <JournalistAvatar
              name={journalist.name}
              title={journalist.title}
              outlet={journalist.outlet}
              accentColor={journalist.accentColor}
              isSpeaking={isJournalistSpeaking}
              isListening={isUserRecording}
              avatarStyle={journalist.avatarStyle}
            />
          )}

          {/* Story label */}
          <div className="w-full">
            <div className="text-[10px] uppercase tracking-widest text-studio-muted mb-1.5 font-medium">Story</div>
            <div className="text-xs text-white/80 leading-relaxed bg-studio-card rounded-lg p-3 border border-studio-border"
              style={{ borderLeft: `3px solid ${journalist.accentColor}` }}>
              {storyTitle || "General interview"}
            </div>
          </div>

          {/* Recording hint */}
          <div className="w-full text-center">
            {sessionRecording ? (
              <div className="text-[10px] text-red-400 flex items-center justify-center gap-1">
                <CircleDot size={10} className="animate-pulse" />
                Audio recording in progress
              </div>
            ) : (
              <div className="text-[10px] text-studio-muted">
                Tap <CircleDot size={10} className="inline" /> in toolbar to record audio
              </div>
            )}
          </div>
        </div>

        {/* Center — transcript */}
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-4">

            {phase === "ready" && (
              <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
                <div>
                  <div className="text-5xl mb-4" style={{ color: journalist.accentColor }}>🎙</div>
                  <h2 className="text-xl font-display text-white mb-2">{journalist.name} is ready</h2>
                  <p className="text-studio-muted text-sm max-w-xs">{journalist.outlet} · {journalist.specialty}</p>
                  {hasDID && videoMode === "video" && !didReady && (
                    <p className="text-xs text-yellow-400/80 mt-2">Connect the video journalist first ↑</p>
                  )}
                </div>
                <button
                  onClick={startInterview}
                  disabled={videoMode === "video" && hasDID && !didReady}
                  className="flex items-center gap-2 px-8 py-3 rounded-xl text-black font-bold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
                  style={{ background: journalist.accentColor }}
                >
                  <Radio size={18} /> Begin Interview
                </button>
              </div>
            )}

            {phase === "opening" && isProcessing && history.length === 0 && (
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
                  {[0,1,2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                      style={{ background: journalist.accentColor, animationDelay: `${i * 0.15}s`, opacity: 0.7 }} />
                  ))}
                </div>
                <span className="text-xs text-studio-muted">{journalist.name} is formulating...</span>
              </div>
            )}

            {phase === "ended" && (
              <div className="text-center py-8 space-y-3">
                <div className="text-2xl">🎬</div>
                <div className="text-white font-semibold">Interview Complete</div>
                <div className="text-xs text-studio-muted">{history.length} exchanges · {formatTime(sessionTime)}</div>
                {sessionRecorder.recordingState === "stopped" && (
                  <button
                    onClick={() => sessionRecorder.downloadRecording(
                      `interview-audio-${storyTitle.slice(0,20).replace(/\s+/g,"-")}-${Date.now()}`
                    )}
                    className="flex items-center gap-2 mx-auto px-4 py-2 bg-green-800/30 text-green-400 border border-green-700/40 rounded-lg text-sm font-semibold hover:bg-green-800/50 transition-colors"
                  >
                    <Download size={14} />
                    Download Audio Recording (.webm)
                  </button>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-700/40 rounded-lg text-xs text-red-300">
              <AlertCircle size={14} />
              {error}
              <button onClick={() => setError(null)} className="ml-auto">×</button>
            </div>
          )}

          {/* Control bar */}
          {phase === "active" && (
            <div className="border-t border-studio-border bg-studio-panel px-4 py-3">
              {/* Mode tabs */}
              <div className="flex items-center justify-center mb-3">
                <div className="flex bg-studio-card border border-studio-border rounded-lg p-0.5 gap-0.5">
                  <button
                    onClick={() => { setMicMode("push-to-talk"); if (handsFreeActive) stopHandsFree(); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      micMode === "push-to-talk" ? "bg-studio-accent text-black" : "text-studio-muted hover:text-white"
                    }`}
                  >
                    <Hand size={12} /> Push-to-Talk
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
                    <Infinity size={12} /> Hands-Free
                  </button>
                </div>
              </div>

              {/* PTT */}
              {micMode === "push-to-talk" && (
                <div className="flex items-center justify-center gap-4">
                  <button onClick={() => askJournalist(false)} disabled={isProcessing || isJournalistSpeaking}
                    className="p-2 rounded-lg text-studio-muted hover:text-white hover:bg-studio-card transition-colors disabled:opacity-40">
                    <SkipForward size={18} />
                  </button>
                  <button
                    onMouseDown={startPTT} onMouseUp={stopPTT}
                    onTouchStart={startPTT} onTouchEnd={stopPTT}
                    disabled={isProcessing || isJournalistSpeaking}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 ${
                      isUserRecording ? "bg-red-600 rec-ring" : "bg-studio-accent hover:bg-yellow-400"
                    }`}
                  >
                    {isUserRecording ? <Square size={20} className="text-white" fill="white" /> : <Mic size={22} className="text-black" />}
                  </button>
                  <div className="text-xs text-studio-muted w-16 text-center">
                    {isUserRecording ? "Release to send" : "Hold to speak"}
                  </div>
                </div>
              )}

              {/* Hands-free */}
              {micMode === "hands-free" && (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-4">
                    <button onClick={() => askJournalist(false)} disabled={isProcessing || isJournalistSpeaking}
                      className="p-2 rounded-lg text-studio-muted hover:text-white hover:bg-studio-card transition-colors disabled:opacity-40">
                      <SkipForward size={18} />
                    </button>
                    <button
                      onClick={toggleHandsFree}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 ${
                        handsFreeActive
                          ? vadState === "user-speaking" ? "bg-red-600 rec-ring" : "bg-green-700"
                          : "bg-studio-card border-2 border-studio-border hover:border-studio-accent"
                      }`}
                    >
                      {handsFreeActive
                        ? vadState === "user-speaking" ? <Mic size={22} className="text-white" /> : <Infinity size={22} className="text-white" />
                        : <Mic size={22} className="text-studio-muted" />}
                    </button>
                    <div className="flex flex-col gap-1 w-16">
                      <div className="w-full h-2 bg-studio-card rounded-full overflow-hidden border border-studio-border">
                        <div className="h-full rounded-full transition-all duration-75"
                          style={{
                            width: `${vadLevel}%`,
                            background: vadLevel > 50 ? "#cc2936" : vadLevel > 20 ? journalist.accentColor : "#252535",
                          }} />
                      </div>
                      <span className="text-[10px] text-studio-muted text-center">
                        {!handsFreeActive ? "Tap to enable" : isJournalistSpeaking ? "AI speaking" : vadState === "user-speaking" ? "● Speaking" : "Listening..."}
                      </span>
                    </div>
                  </div>
                  {handsFreeActive && (
                    <div className="text-[10px] text-studio-muted flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      Open mic · {VAD_SILENCE_MS / 1000}s silence auto-sends
                    </div>
                  )}
                </div>
              )}

              <div className="text-center text-[10px] text-studio-muted mt-2">
                {isJournalistSpeaking ? `${journalist.name} is speaking...` : isProcessing ? "Processing..." : "Your turn"}
              </div>
            </div>
          )}
        </div>

        {/* Right — webcam */}
        {webcamEnabled && (
          <div className="w-48 flex-shrink-0 bg-studio-panel border-l border-studio-border flex flex-col items-center justify-start pt-8 px-3 gap-3">
            <div className="relative w-36 h-36 rounded-full overflow-hidden border-2 border-blue-600/50 bg-black">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover"
                onLoadedMetadata={() => { if (videoRef.current) videoRef.current.srcObject = webcamStream; }} />
              {isUserRecording && <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-red-500 rec-ring" />}
              {sessionRecording && <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-red-500 animate-pulse" />}
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
          ● LIVE INTERVIEW &nbsp;|&nbsp; {journalist.name} · {journalist.outlet} &nbsp;|&nbsp; {storyTitle || "Untitled"} &nbsp;|&nbsp; {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} &nbsp;|&nbsp; EXCLUSIVE &nbsp;|&nbsp; ● LIVE INTERVIEW
        </div>
      </div>
    </div>
  );
}
