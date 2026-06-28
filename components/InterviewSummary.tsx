"use client";
import { useState } from "react";
import { FileText, Loader2, Download, RefreshCw, ChevronRight, Star, TrendingUp, Award } from "lucide-react";

interface Props {
  transcript: string;
  storyTitle: string;
  journalistId: string;
  onRestart: () => void;
}

interface CoachingResult {
  scores: { clarity: number; specificity: number; confidence: number; evasiveness: number };
  overall: string;
  strengths: string[];
  improvements: string[];
  bestMoment: string;
}

type Tab = "transcript" | "brief" | "coaching";

function ScoreBar({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  const display = invert ? 11 - value : value;
  const color = display >= 8 ? "#22c55e" : display >= 5 ? "#e8b84b" : "#cc2936";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-studio-muted">{label}{invert ? " (lower = better)" : ""}</span>
        <span className="font-bold" style={{ color }}>{value}/10</span>
      </div>
      <div className="w-full h-2 bg-studio-card rounded-full overflow-hidden border border-studio-border">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${display * 10}%`, background: color }} />
      </div>
    </div>
  );
}

export default function InterviewSummary({ transcript, storyTitle, journalistId, onRestart }: Props) {
  const [tab, setTab] = useState<Tab>("transcript");
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [coaching, setCoaching] = useState<CoachingResult | null>(null);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [coachingError, setCoachingError] = useState("");

  const generateSummary = async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/interview/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, storyTitle, journalistId }),
      });
      const data = await res.json();
      setSummary(data.summary || "");
    } catch {
      setSummary("Summary generation failed. Please try again.");
    } finally {
      setSummaryLoading(false);
    }
  };

  const generateCoaching = async () => {
    setCoachingLoading(true);
    setCoachingError("");
    try {
      const res = await fetch("/api/interview/coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, storyTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCoaching(data);
    } catch (err: any) {
      setCoachingError(err.message || "Coaching analysis failed.");
    } finally {
      setCoachingLoading(false);
    }
  };

  const downloadAll = () => {
    const coachingText = coaching ? `\n\nINTERVIEW COACHING REPORT:\n${"─".repeat(40)}\nOverall: ${coaching.overall}\n\nScores:\n  Clarity: ${coaching.scores.clarity}/10\n  Specificity: ${coaching.scores.specificity}/10\n  Confidence: ${coaching.scores.confidence}/10\n  Evasiveness: ${coaching.scores.evasiveness}/10 (lower = better)\n\nStrengths:\n${coaching.strengths.map(s => `  • ${s}`).join("\n")}\n\nImprovements:\n${coaching.improvements.map(s => `  • ${s}`).join("\n")}\n\nBest Moment:\n  "${coaching.bestMoment}"` : "";
    const content = `AI JOURNALIST INTERVIEW — POST-SESSION REPORT\n${"═".repeat(50)}\nStory: ${storyTitle}\nDate: ${new Date().toLocaleDateString()}\n${"═".repeat(50)}\n\nFULL TRANSCRIPT:\n${transcript}${summary ? `\n\nAI STORY BRIEF:\n${summary}` : ""}${coachingText}`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-report-${storyTitle.slice(0, 30).replace(/\s+/g, "-")}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printTranscript = () => window.print();

  return (
    <div className="flex flex-col h-full bg-studio-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-studio-border flex-shrink-0">
        <div>
          <h2 className="text-xl font-display text-white">Interview Complete</h2>
          <p className="text-sm text-studio-muted mt-0.5">{storyTitle}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={printTranscript} title="Print / Save as PDF"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-studio-card border border-studio-border text-sm text-white hover:border-studio-muted transition-colors">
            <FileText size={13} /> Print
          </button>
          <button onClick={downloadAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-studio-card border border-studio-border text-sm text-white hover:border-studio-accent transition-colors">
            <Download size={13} /> Download All
          </button>
          <button onClick={onRestart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-studio-accent text-black text-sm font-semibold hover:bg-yellow-400 transition-colors">
            <RefreshCw size={13} /> New Interview
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-studio-border flex-shrink-0 px-6">
        {([["transcript", "Transcript", FileText], ["brief", "AI Brief", ChevronRight], ["coaching", "Coaching", TrendingUp]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
              tab === id ? "border-studio-accent text-white" : "border-transparent text-studio-muted hover:text-white"
            }`}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">

        {tab === "transcript" && (
          <div className="bg-studio-card rounded-xl border border-studio-border p-4">
            <pre className="text-xs text-studio-muted whitespace-pre-wrap leading-relaxed font-sans">
              {transcript}
            </pre>
          </div>
        )}

        {tab === "brief" && (
          <div className="space-y-4">
            {!summary && !summaryLoading && (
              <button onClick={generateSummary}
                className="w-full py-3 rounded-xl bg-studio-accent text-black font-semibold hover:bg-yellow-400 transition-colors">
                Generate AI Story Brief
              </button>
            )}
            {summaryLoading && (
              <div className="flex items-center gap-2 text-sm text-studio-muted py-4 justify-center">
                <Loader2 size={16} className="animate-spin text-studio-accent" />
                Generating broadcast brief...
              </div>
            )}
            {summary && (
              <div className="bg-studio-card rounded-xl border border-studio-border p-4">
                <div className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">{summary}</div>
              </div>
            )}
            {!summary && !summaryLoading && (
              <p className="text-xs text-studio-muted text-center">
                Generate an AI-written broadcast brief with headline, lead paragraph, key quotes, and next steps.
              </p>
            )}
          </div>
        )}

        {tab === "coaching" && (
          <div className="space-y-4">
            {!coaching && !coachingLoading && (
              <button onClick={generateCoaching}
                className="w-full py-3 rounded-xl bg-studio-accent text-black font-semibold hover:bg-yellow-400 transition-colors flex items-center justify-center gap-2">
                <Award size={15} /> Analyze My Performance
              </button>
            )}
            {coachingLoading && (
              <div className="flex items-center gap-2 text-sm text-studio-muted py-4 justify-center">
                <Loader2 size={16} className="animate-spin text-studio-accent" />
                Analyzing your interview performance...
              </div>
            )}
            {coachingError && (
              <p className="text-xs text-red-400 text-center">{coachingError}</p>
            )}
            {coaching && (
              <div className="space-y-4">
                {/* Scores */}
                <div className="bg-studio-card rounded-xl border border-studio-border p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-studio-accent mb-3">Performance Scores</h3>
                  <ScoreBar label="Clarity" value={coaching.scores.clarity} />
                  <ScoreBar label="Specificity" value={coaching.scores.specificity} />
                  <ScoreBar label="Confidence" value={coaching.scores.confidence} />
                  <ScoreBar label="Evasiveness" value={coaching.scores.evasiveness} invert />
                </div>

                {/* Overall */}
                <div className="bg-studio-card rounded-xl border border-studio-border p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-studio-accent mb-2">Overall</h3>
                  <p className="text-sm text-white/85 leading-relaxed">{coaching.overall}</p>
                </div>

                {/* Strengths + Improvements */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-green-900/10 border border-green-700/30 rounded-xl p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-green-400 mb-2 flex items-center gap-1.5"><Star size={11} /> Strengths</h3>
                    <ul className="space-y-1.5">
                      {coaching.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-white/75 leading-relaxed flex gap-2">
                          <span className="text-green-400 flex-shrink-0">✓</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-yellow-900/10 border border-yellow-700/30 rounded-xl p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-yellow-400 mb-2 flex items-center gap-1.5"><TrendingUp size={11} /> To Improve</h3>
                    <ul className="space-y-1.5">
                      {coaching.improvements.map((s, i) => (
                        <li key={i} className="text-xs text-white/75 leading-relaxed flex gap-2">
                          <span className="text-yellow-400 flex-shrink-0">→</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Best moment */}
                {coaching.bestMoment && (
                  <div className="bg-studio-card border border-studio-border rounded-xl p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-studio-accent mb-2">Best Moment</h3>
                    <blockquote className="text-sm text-white/80 italic leading-relaxed border-l-2 border-studio-accent pl-3">
                      "{coaching.bestMoment}"
                    </blockquote>
                  </div>
                )}
              </div>
            )}
            {!coaching && !coachingLoading && (
              <p className="text-xs text-studio-muted text-center">
                Get AI-scored feedback on clarity, specificity, confidence, and directness.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
