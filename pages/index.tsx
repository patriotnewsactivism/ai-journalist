"use client";
import { useState } from "react";
import Head from "next/head";
import { JOURNALISTS, JournalistProfile } from "@/agents/journalist";
import DocumentUploader from "@/components/DocumentUploader";
import InterviewStudio from "@/components/InterviewStudio";
import InterviewSummary from "@/components/InterviewSummary";
import { Radio, Mic, ChevronRight, Star, Video, Info, ChevronDown } from "lucide-react";

type Stage = "setup" | "studio" | "summary";

export default function Home() {
  const [stage, setStage] = useState<Stage>("setup");
  const [selectedJournalist, setSelectedJournalist] = useState<JournalistProfile>(JOURNALISTS[0]);
  const [storyTitle, setStoryTitle] = useState("");
  const [storyContext, setStoryContext] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [showVideoInfo, setShowVideoInfo] = useState(false);
  const [showJournalists, setShowJournalists] = useState(false);

  const didClientKey = process.env.NEXT_PUBLIC_DID_CLIENT_KEY || "";
  const didAgentId = process.env.NEXT_PUBLIC_DID_AGENT_ID || "";
  const hasDID = !!(didClientKey && didAgentId);

  const handleContextReady = (context: string, title: string) => {
    setStoryContext(context);
    setStoryTitle(title);
  };

  const handleStart = () => {
    if (!storyTitle.trim()) setStoryTitle("Exclusive Interview");
    setStage("studio");
  };

  const handleEnd = (transcript: string) => {
    setFinalTranscript(transcript);
    setStage("summary");
  };

  const handleRestart = () => {
    setStage("setup");
    setStoryContext("");
    setFinalTranscript("");
    setSelectedJournalist(JOURNALISTS[0]);
    setShowJournalists(false);
  };

  return (
    <>
      <Head>
        <title>AI Journalist Studio — People's Press</title>
        <meta name="description" content="AI-powered interview studio with realistic journalist avatars" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-[100dvh] flex flex-col bg-studio-dark">

        {/* ── Header ────────────────────────────────────────────── */}
        <header className="flex items-center gap-3 px-4 py-3 bg-studio-panel border-b border-studio-border flex-shrink-0 sticky top-0 z-20">
          <div className="w-8 h-8 rounded-lg bg-studio-red flex items-center justify-center flex-shrink-0">
            <Radio size={15} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white leading-tight font-display">AI Journalist Studio</div>
            <div className="text-[9px] text-studio-muted uppercase tracking-wide">The People's Press · Exclusive Interview Platform</div>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {stage === "studio" && (
              <div className="flex items-center gap-1.5 text-red-400 text-xs font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                LIVE
              </div>
            )}
          </div>
        </header>

        {/* ── Main ──────────────────────────────────────────────── */}
        <main className="flex-1">

          {/* ═══════════════════════════════════════════════════
              SETUP STAGE
          ═══════════════════════════════════════════════════ */}
          {stage === "setup" && (
            <div className="flex flex-col md:flex-row md:h-[calc(100dvh-53px)]">

              {/* ── Journalist Selector ──────────────────────── */}
              <div className="md:w-72 lg:w-80 bg-studio-panel border-b md:border-b-0 md:border-r border-studio-border md:flex md:flex-col md:overflow-hidden flex-shrink-0">

                {/* Mobile: compact pill showing selected journalist + tap to change */}
                <button
                  className="md:hidden flex items-center justify-between w-full px-4 py-3 active:bg-studio-card/40 transition-colors"
                  onClick={() => setShowJournalists(!showJournalists)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ background: `${selectedJournalist.accentColor}22`, color: selectedJournalist.accentColor, border: `1px solid ${selectedJournalist.accentColor}55` }}
                    >
                      {selectedJournalist.name.split(" ").map((n: string) => n[0]).join("")}
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-semibold text-white leading-tight">{selectedJournalist.name}</div>
                      <div className="text-[11px]" style={{ color: selectedJournalist.accentColor }}>{selectedJournalist.title}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-studio-muted">
                    <span>Change</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${showJournalists ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {/* Mobile: expanded journalist list (slides down) */}
                {showJournalists && (
                  <div className="md:hidden border-t border-studio-border bg-studio-panel/95 divide-y divide-studio-border/50">
                    {JOURNALISTS.map((j: JournalistProfile) => (
                      <button
                        key={j.id}
                        onClick={() => { setSelectedJournalist(j); setShowJournalists(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 active:bg-studio-card/40 transition-colors"
                      >
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ background: `${j.accentColor}22`, color: j.accentColor, border: `1px solid ${j.accentColor}44` }}
                        >
                          {j.name.split(" ").map((n: string) => n[0]).join("")}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-sm font-semibold text-white">{j.name}</div>
                          <div className="text-[11px]" style={{ color: j.accentColor }}>{j.title}</div>
                          <div className="text-[10px] text-studio-muted truncate">{j.specialty}</div>
                        </div>
                        {selectedJournalist.id === j.id && (
                          <Star size={14} fill="currentColor" style={{ color: j.accentColor }} className="flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Desktop: full sidebar */}
                <div className="hidden md:block px-4 py-3 border-b border-studio-border flex-shrink-0">
                  <h2 className="text-xs font-bold text-white uppercase tracking-wide">Select Your Journalist</h2>
                  <p className="text-[10px] text-studio-muted mt-0.5">Choose who will conduct the interview</p>
                </div>
                <div className="hidden md:block md:flex-1 md:overflow-y-auto p-3 space-y-2">
                  {JOURNALISTS.map((j: JournalistProfile) => (
                    <button
                      key={j.id}
                      onClick={() => setSelectedJournalist(j)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selectedJournalist.id === j.id ? "bg-studio-card" : "border-studio-border hover:bg-studio-card/50"
                      }`}
                      style={{
                        borderColor: selectedJournalist.id === j.id ? j.accentColor : undefined,
                        boxShadow: selectedJournalist.id === j.id ? `0 0 0 1px ${j.accentColor}33` : undefined,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ background: `${j.accentColor}22`, color: j.accentColor, border: `1px solid ${j.accentColor}44` }}
                        >
                          {j.name.split(" ").map((n: string) => n[0]).join("")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white leading-tight">{j.name}</div>
                          <div className="text-[11px] mt-0.5" style={{ color: j.accentColor }}>{j.title}</div>
                          <div className="text-[10px] text-studio-muted">{j.outlet}</div>
                          <div className="text-[10px] text-studio-muted/70 mt-1 leading-relaxed line-clamp-2">{j.specialty}</div>
                        </div>
                        {selectedJournalist.id === j.id && (
                          <Star size={13} fill="currentColor" style={{ color: j.accentColor }} className="flex-shrink-0 mt-0.5" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Setup Form ───────────────────────────────── */}
              <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 md:px-8 md:py-8">
                <div className="max-w-xl mx-auto">

                  <h1 className="text-xl font-display text-white mb-1">Set Up Your Interview</h1>
                  <p className="text-xs text-studio-muted mb-5">
                    Upload your story documents and {selectedJournalist.name} will study them before asking targeted questions.
                  </p>

                  {/* Video journalist info */}
                  {hasDID ? (
                    <div className="rounded-xl border border-blue-600/30 bg-blue-600/8 p-3 mb-4 flex items-start gap-3">
                      <Video size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-blue-300">Live Video Journalist Available</div>
                        <div className="text-[11px] text-studio-muted">D-ID streaming avatar configured. Toggle inside the studio.</div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-studio-border bg-studio-card p-3 mb-4">
                      <button
                        onClick={() => setShowVideoInfo(!showVideoInfo)}
                        className="w-full flex items-center gap-2 text-xs text-studio-muted hover:text-white transition-colors"
                      >
                        <Video size={14} />
                        <span className="font-semibold">Want a lifelike video journalist?</span>
                        <Info size={12} className="ml-auto" />
                      </button>
                      {showVideoInfo && (
                        <div className="mt-3 text-xs text-studio-muted leading-relaxed space-y-2 border-t border-studio-border pt-3">
                          <p>To enable a real talking video journalist (powered by D-ID):</p>
                          <ol className="list-decimal list-inside space-y-1 text-white/70 text-[11px]">
                            <li>Sign up at <a href="https://studio.d-id.com" target="_blank" rel="noreferrer" className="text-blue-400 underline">studio.d-id.com</a></li>
                            <li>Create a new Agent — pick a presenter photo and voice</li>
                            <li>Copy the <strong className="text-white">Agent ID</strong> and <strong className="text-white">Client Key</strong></li>
                            <li>Add to Vercel env: <code className="text-[10px] bg-studio-dark px-1 rounded">NEXT_PUBLIC_DID_AGENT_ID</code> and <code className="text-[10px] bg-studio-dark px-1 rounded">NEXT_PUBLIC_DID_CLIENT_KEY</code></li>
                          </ol>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Document uploader */}
                  <div className="mb-4">
                    <DocumentUploader onContextReady={handleContextReady} storyTitle={storyTitle} onTitleChange={setStoryTitle} />
                  </div>

                  {/* Start button */}
                  <button
                    onClick={handleStart}
                    className="w-full flex items-center justify-center gap-2 bg-studio-red hover:bg-studio-red/90 active:scale-[0.98] text-white font-bold text-sm py-4 rounded-xl transition-all"
                  >
                    <Mic size={16} />
                    Start Interview with {selectedJournalist.name.split(" ")[0]}
                    <ChevronRight size={16} />
                  </button>
                  <p className="text-center text-[10px] text-studio-muted/60 mt-2">
                    Your session is private and not recorded by us
                  </p>

                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════
              STUDIO STAGE
          ═══════════════════════════════════════════════════ */}
          {stage === "studio" && (
            <InterviewStudio
              journalist={selectedJournalist}
              storyContext={storyContext}
              storyTitle={storyTitle}
              didClientKey={didClientKey}
              didAgentId={didAgentId}
              onEnd={handleEnd}
            />
          )}

          {/* ═══════════════════════════════════════════════════
              SUMMARY STAGE
          ═══════════════════════════════════════════════════ */}
          {stage === "summary" && (
            <InterviewSummary
              journalistId={selectedJournalist.id}
              storyTitle={storyTitle}
              transcript={finalTranscript}
              onRestart={handleRestart}
            />
          )}

        </main>
      </div>
    </>
  );
}
