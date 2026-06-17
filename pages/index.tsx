"use client";
import { useState } from "react";
import Head from "next/head";
import { JOURNALISTS, JournalistProfile } from "@/agents/journalist";
import DocumentUploader from "@/components/DocumentUploader";
import InterviewStudio from "@/components/InterviewStudio";
import InterviewSummary from "@/components/InterviewSummary";
import { Radio, Mic, ChevronRight, Star } from "lucide-react";

type Stage = "setup" | "studio" | "summary";

export default function Home() {
  const [stage, setStage] = useState<Stage>("setup");
  const [selectedJournalist, setSelectedJournalist] = useState<JournalistProfile>(JOURNALISTS[0]);
  const [storyTitle, setStoryTitle] = useState("");
  const [storyContext, setStoryContext] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");

  const handleContextReady = (context: string, title: string) => {
    setStoryContext(context);
    setStoryTitle(title);
  };

  const handleStart = () => {
    if (!storyTitle.trim()) {
      setStoryTitle("Exclusive Interview");
    }
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
  };

  return (
    <>
      <Head>
        <title>AI Journalist Studio — People's Press</title>
        <meta name="description" content="AI-powered interview studio with realistic journalist avatars" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="h-screen flex flex-col bg-studio-dark overflow-hidden">
        {/* Network header */}
        <header className="flex items-center gap-4 px-6 py-3 bg-studio-panel border-b border-studio-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-studio-red flex items-center justify-center">
              <Radio size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-tight font-display">AI Journalist Studio</div>
              <div className="text-[10px] text-studio-muted uppercase tracking-wide">The People's Press · Exclusive Interview Platform</div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {stage === "studio" && (
              <div className="flex items-center gap-1.5 text-red-400 text-xs font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                LIVE
              </div>
            )}
            <div className="text-xs text-studio-muted">
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 min-h-0">
          {stage === "setup" && (
            <div className="h-full flex">
              {/* Left — journalist selector */}
              <div className="w-80 bg-studio-panel border-r border-studio-border flex flex-col">
                <div className="px-5 py-4 border-b border-studio-border">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide">Select Your Journalist</h2>
                  <p className="text-xs text-studio-muted mt-0.5">Choose who will conduct the interview</p>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {JOURNALISTS.map(j => (
                    <button
                      key={j.id}
                      onClick={() => setSelectedJournalist(j)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        selectedJournalist.id === j.id
                          ? "border-opacity-100 bg-studio-card"
                          : "border-studio-border hover:border-studio-border/80 bg-transparent hover:bg-studio-card/50"
                      }`}
                      style={{
                        borderColor: selectedJournalist.id === j.id ? j.accentColor : undefined,
                        boxShadow: selectedJournalist.id === j.id
                          ? `0 0 0 1px ${j.accentColor}33, 0 4px 20px ${j.accentColor}11`
                          : undefined,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-base flex-shrink-0 font-bold"
                          style={{ background: `${j.accentColor}22`, color: j.accentColor, border: `1px solid ${j.accentColor}44` }}
                        >
                          {j.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white">{j.name}</div>
                          <div className="text-xs mt-0.5" style={{ color: j.accentColor }}>{j.title}</div>
                          <div className="text-xs text-studio-muted">{j.outlet}</div>
                          <div className="text-xs text-studio-muted/70 mt-1.5 leading-relaxed">{j.specialty}</div>
                        </div>
                        {selectedJournalist.id === j.id && (
                          <Star size={14} fill="currentColor" style={{ color: j.accentColor }} className="flex-shrink-0 mt-0.5" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right — setup */}
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-xl mx-auto">
                  <h1 className="text-2xl font-display text-white mb-1">
                    Set Up Your Interview
                  </h1>
                  <p className="text-sm text-studio-muted mb-6">
                    Upload your story documents and {selectedJournalist.name} will study them before asking you targeted, informed questions.
                  </p>

                  {/* Selected journalist preview */}
                  <div
                    className="rounded-xl border p-4 mb-6 flex items-center gap-4"
                    style={{
                      borderColor: `${selectedJournalist.accentColor}44`,
                      background: `${selectedJournalist.accentColor}08`,
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold"
                      style={{ background: `${selectedJournalist.accentColor}22`, color: selectedJournalist.accentColor }}
                    >
                      {selectedJournalist.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{selectedJournalist.name}</div>
                      <div className="text-xs" style={{ color: selectedJournalist.accentColor }}>{selectedJournalist.outlet}</div>
                      <div className="text-xs text-studio-muted italic mt-0.5">"{selectedJournalist.personality}"</div>
                    </div>
                  </div>

                  <DocumentUploader
                    onContextReady={handleContextReady}
                    storyTitle={storyTitle}
                    onTitleChange={setStoryTitle}
                  />

                  <button
                    onClick={handleStart}
                    className="mt-6 w-full py-3 rounded-xl text-black font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
                    style={{ background: selectedJournalist.accentColor }}
                  >
                    <Mic size={18} />
                    Start Interview with {selectedJournalist.name}
                    <ChevronRight size={16} />
                  </button>

                  <p className="text-center text-xs text-studio-muted mt-3">
                    Hold the mic button to speak · Release to send · Your interview is recorded as text
                  </p>
                </div>
              </div>
            </div>
          )}

          {stage === "studio" && (
            <InterviewStudio
              journalist={selectedJournalist}
              storyTitle={storyTitle}
              storyContext={storyContext}
              onEnd={handleEnd}
            />
          )}

          {stage === "summary" && (
            <InterviewSummary
              transcript={finalTranscript}
              storyTitle={storyTitle}
              journalistId={selectedJournalist.id}
              onRestart={handleRestart}
            />
          )}
        </main>
      </div>
    </>
  );
}
