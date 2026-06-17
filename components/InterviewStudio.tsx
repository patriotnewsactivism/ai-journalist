"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic, MicOff, Square, Play, Pause, Download, FileText,
  Volume2, VolumeX, Radio, Camera, CameraOff, SkipForward,
  AlertCircle, Loader2, ChevronRight
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

export default function InterviewStudio({ journalist, storyTitle, storyContext, onEnd }: Props) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [history, setHistory] = useState<Message[]>([]);
  const [isJournalistSpeaking, setIsJournalistSpeaking] = useState(false);
  const [isUserRecording, setIsUserRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [sessionTime, setSessionTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [isRecordingSession, setIsRecordingSession] = useState(false);
  const [sessionRecorder, setSessionRecorder] = useState<MediaRecorder | null>(null);
  const [sessionChunks, setSessionChunks] = useState<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // Play TTS audio
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

  // Get journalist's next question
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

      const msg: Message = {
        role: "journalist",
        content: data.text,
        timestamp: new Date(),
      };
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

  // Start interview
  const startInterview = async () => {
    setPhase("opening");
    await askJournalist(true);
    setPhase("active");
  };

  // Start user recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsUserRecording(false);
        setIsProcessing(true);

        const blob = new Blob(chunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", blob, "audio.webm");

        try {
          const res = await fetch("/api/interview/transcribe", { method: "POST", body: formData });
          const data = await res.json();
          const transcript = data.transcript || "";

          if (transcript.trim()) {
            const userMsg: Message = {
              role: "interviewee",
              content: transcript,
              timestamp: new Date(),
            };
            setHistory(prev => {
              const updated = [...prev, userMsg];
              return updated;
            });
            setCurrentTranscript("");
            // Get journalist response after state update
            setTimeout(() => askJournalistWithHistory([...history, userMsg]), 100);
          }
        } catch (err) {
          setError("Transcription failed. Please try again.");
        } finally {
          setIsProcessing(false);
        }
      };

      setAudioChunks(chunks);
      setMediaRecorder(recorder);
      recorder.start();
      setIsUserRecording(true);
    } catch (err: any) {
      setError("Microphone access denied. Please allow microphone access.");
    }
  };

  const askJournalistWithHistory = async (fullHistory: Message[]) => {
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

      const msg: Message = {
        role: "journalist",
        content: data.text,
        timestamp: new Date(),
      };
      setHistory(prev => [...prev, msg]);

      if (ttsEnabled && data.audioBase64) {
        await playAudio(data.audioBase64);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  };

  // Toggle webcam
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

  // Download transcript
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

  // End interview
  const endInterview = async () => {
    setPhase("ended");
    if (audioRef.current) audioRef.current.pause();
    videoStream?.getTracks().forEach(t => t.stop());

    const fullText = history.map(m =>
      `${m.role === "journalist" ? journalist.name : "Interviewee"}: ${m.content}`
    ).join("\n\n");

    onEnd(fullText);
  };

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
          {/* TTS toggle */}
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            title={ttsEnabled ? "Voice on" : "Voice off"}
            className={`p-1.5 rounded-md transition-colors ${ttsEnabled ? "text-studio-accent" : "text-studio-muted hover:text-white"}`}
          >
            {ttsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Camera toggle */}
          <button
            onClick={toggleVideo}
            title={videoEnabled ? "Camera on" : "Camera off"}
            className={`p-1.5 rounded-md transition-colors ${videoEnabled ? "text-studio-accent" : "text-studio-muted hover:text-white"}`}
          >
            {videoEnabled ? <Camera size={16} /> : <CameraOff size={16} />}
          </button>

          {/* Download transcript */}
          {history.length > 0 && (
            <button
              onClick={downloadTranscript}
              title="Download transcript"
              className="p-1.5 rounded-md text-studio-muted hover:text-white transition-colors"
            >
              <Download size={16} />
            </button>
          )}

          {/* End button */}
          {phase === "active" && (
            <button
              onClick={endInterview}
              className="px-3 py-1 bg-red-700/30 text-red-400 border border-red-700/40 rounded-md text-xs font-semibold hover:bg-red-700/50 transition-colors"
            >
              End Interview
            </button>
          )}
        </div>
      </div>

      {/* Main studio area */}
      <div className="flex flex-1 gap-0 min-h-0">
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

          {/* Story brief */}
          <div className="w-full">
            <div className="text-[10px] uppercase tracking-widest text-studio-muted mb-2 font-medium">Story</div>
            <div
              className="text-xs text-white/80 leading-relaxed bg-studio-card rounded-lg p-3 border border-studio-border"
              style={{ borderLeft: `3px solid ${journalist.accentColor}` }}
            >
              {storyTitle || "General interview"}
            </div>
          </div>

          {/* Specialty tag */}
          <div className="w-full">
            <div className="text-[10px] text-studio-muted leading-relaxed text-center italic">
              "{journalist.specialty}"
            </div>
          </div>
        </div>

        {/* Center — Transcript */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Transcript scroll area */}
          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {phase === "ready" && (
              <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
                <div>
                  <div
                    className="text-5xl mb-4 font-display"
                    style={{ color: journalist.accentColor }}
                  >
                    🎙
                  </div>
                  <h2 className="text-xl font-display text-white mb-2">
                    {journalist.name} is ready
                  </h2>
                  <p className="text-studio-muted text-sm max-w-xs">
                    {journalist.outlet} · {journalist.specialty}
                  </p>
                </div>
                <button
                  onClick={startInterview}
                  className="flex items-center gap-2 px-8 py-3 rounded-xl text-black font-bold text-sm transition-all hover:scale-105 active:scale-95"
                  style={{ background: journalist.accentColor }}
                >
                  <Radio size={18} />
                  Begin Interview
                </button>
              </div>
            )}

            {(phase === "opening" || phase === "active") && history.length === 0 && isProcessing && (
              <div className="flex items-center gap-3 p-4 bg-studio-card rounded-xl border border-studio-border">
                <Loader2 size={18} className="animate-spin" style={{ color: journalist.accentColor }} />
                <span className="text-sm text-studio-muted">{journalist.name} is preparing the opening...</span>
              </div>
            )}

            {history.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === "interviewee" ? "flex-row-reverse" : ""}`}
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    background: msg.role === "journalist"
                      ? `${journalist.accentColor}22`
                      : "rgba(26,107,255,0.15)",
                    border: `1px solid ${msg.role === "journalist" ? journalist.accentColor + "44" : "rgba(26,107,255,0.3)"}`,
                    color: msg.role === "journalist" ? journalist.accentColor : "#1a6bff",
                  }}
                >
                  {msg.role === "journalist" ? journalist.name[0] : "Y"}
                </div>

                <div className={`flex-1 max-w-[80%] ${msg.role === "interviewee" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  <div className="text-[10px] text-studio-muted">
                    {msg.role === "journalist" ? journalist.name : "You"} · {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div
                    className="rounded-xl px-4 py-3 text-sm leading-relaxed"
                    style={{
                      background: msg.role === "journalist"
                        ? "rgba(22,22,31,0.9)"
                        : "rgba(26,107,255,0.12)",
                      border: `1px solid ${msg.role === "journalist" ? "#252535" : "rgba(26,107,255,0.25)"}`,
                      borderLeft: msg.role === "journalist" ? `3px solid ${journalist.accentColor}` : undefined,
                      color: "#e8e8f0",
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}

            {/* Processing indicator */}
            {isProcessing && history.length > 0 && (
              <div className="flex items-center gap-2 pl-11">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full animate-bounce"
                      style={{
                        background: journalist.accentColor,
                        animationDelay: `${i * 0.15}s`,
                        opacity: 0.7,
                      }}
                    />
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

          {/* Control bar */}
          {phase === "active" && (
            <div className="border-t border-studio-border bg-studio-panel p-4">
              <div className="flex items-center justify-center gap-4">
                {/* Skip journalist */}
                <button
                  onClick={() => askJournalist(false)}
                  disabled={isProcessing || isJournalistSpeaking}
                  title="Ask next question"
                  className="p-2 rounded-lg text-studio-muted hover:text-white hover:bg-studio-card transition-colors disabled:opacity-40"
                >
                  <SkipForward size={18} />
                </button>

                {/* Main mic button */}
                <button
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  disabled={isProcessing || isJournalistSpeaking}
                  className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 ${
                    isUserRecording
                      ? "bg-red-600 rec-ring"
                      : "bg-studio-accent hover:bg-yellow-400"
                  }`}
                >
                  {isUserRecording ? (
                    <Square size={20} className="text-white" fill="white" />
                  ) : (
                    <Mic size={22} className="text-black" />
                  )}
                </button>

                {/* Text hint */}
                <div className="text-xs text-studio-muted">
                  {isUserRecording ? "Release to send" : "Hold to speak"}
                </div>
              </div>

              <div className="text-center text-[10px] text-studio-muted mt-2">
                {isJournalistSpeaking ? `${journalist.name} is speaking...` : "Your turn"}
              </div>
            </div>
          )}
        </div>

        {/* Right — User webcam */}
        {videoEnabled && (
          <div className="w-48 flex-shrink-0 bg-studio-panel border-l border-studio-border flex flex-col items-center justify-start pt-8 px-3 gap-3">
            <div className="relative w-36 h-36 rounded-full overflow-hidden border-2 border-blue-600/50 bg-black">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                onLoadedMetadata={() => { if (videoRef.current) videoRef.current.srcObject = videoStream; }}
              />
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
