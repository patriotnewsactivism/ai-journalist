"use client";
import { useState } from "react";
import { FileText, Loader2, Download, RefreshCw, ChevronRight } from "lucide-react";

interface Props {
  transcript: string;
  storyTitle: string;
  journalistId: string;
  onRestart: () => void;
}

export default function InterviewSummary({ transcript, storyTitle, journalistId, onRestart }: Props) {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  const generateSummary = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  const downloadAll = () => {
    const content = `AI JOURNALIST INTERVIEW — POST-SESSION REPORT
═══════════════════════════════════════════════
Story: ${storyTitle}
Date: ${new Date().toLocaleDateString()}
═══════════════════════════════════════════════

FULL TRANSCRIPT:
${transcript}

${summary ? `\nAI STORY BRIEF:\n${summary}` : ""}`;

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-report-${Date.now()}.txt`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full bg-studio-panel p-6 gap-6 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-display text-white">Interview Complete</h2>
          <p className="text-sm text-studio-muted mt-0.5">{storyTitle}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={downloadAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-studio-card border border-studio-border text-sm text-white hover:border-studio-accent transition-colors"
          >
            <Download size={14} />
            Download All
          </button>
          <button
            onClick={onRestart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-studio-accent text-black text-sm font-semibold hover:bg-yellow-400 transition-colors"
          >
            <RefreshCw size={14} />
            New Interview
          </button>
        </div>
      </div>

      {/* Transcript */}
      <div className="bg-studio-card rounded-xl border border-studio-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className="text-studio-accent" />
          <span className="text-sm font-semibold text-white">Full Transcript</span>
        </div>
        <pre className="text-xs text-studio-muted whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto font-sans">
          {transcript}
        </pre>
      </div>

      {/* AI Story Brief */}
      <div className="bg-studio-card rounded-xl border border-studio-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ChevronRight size={16} className="text-studio-accent" />
            <span className="text-sm font-semibold text-white">AI Story Brief</span>
          </div>
          {!summary && !loading && (
            <button
              onClick={generateSummary}
              className="text-xs px-3 py-1 rounded-lg bg-studio-accent text-black font-semibold hover:bg-yellow-400 transition-colors"
            >
              Generate Brief
            </button>
          )}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-studio-muted">
            <Loader2 size={14} className="animate-spin text-studio-accent" />
            Generating broadcast brief...
          </div>
        )}

        {summary && (
          <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
            {summary}
          </div>
        )}

        {!summary && !loading && (
          <p className="text-xs text-studio-muted">
            Generate an AI-written broadcast brief with headline, lead paragraph, key quotes, and next steps.
          </p>
        )}
      </div>
    </div>
  );
}
