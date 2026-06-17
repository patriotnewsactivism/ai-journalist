"use client";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, Upload, X, Loader2, CheckCircle } from "lucide-react";

interface Props {
  onContextReady: (context: string, title: string) => void;
  storyTitle: string;
  onTitleChange: (t: string) => void;
}

export default function DocumentUploader({ onContextReady, storyTitle, onTitleChange }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(false);
  const [rawText, setRawText] = useState("");

  const onDrop = useCallback((accepted: File[]) => {
    setFiles(prev => [...prev, ...accepted]);
    setExtracted(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/plain": [".txt"],
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    multiple: true,
  });

  const readFiles = async () => {
    let combined = "";
    for (const file of files) {
      const text = await file.text();
      combined += `\n\n=== ${file.name} ===\n${text}`;
    }
    return combined;
  };

  const handleExtract = async () => {
    setExtracting(true);
    try {
      const text = files.length > 0 ? await readFiles() : rawText;

      const res = await fetch("/api/interview/extract-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentText: text, storyTitle }),
      });

      const data = await res.json();
      if (data.context) {
        onContextReady(data.context, storyTitle);
        setExtracted(true);
      }
    } catch (err) {
      console.error("Extract error:", err);
    } finally {
      setExtracting(false);
    }
  };

  const removeFile = (i: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setExtracted(false);
  };

  return (
    <div className="space-y-4">
      {/* Story title */}
      <div>
        <label className="block text-xs font-medium text-studio-muted mb-1.5 uppercase tracking-wide">
          Story Title / Interview Subject
        </label>
        <input
          type="text"
          value={storyTitle}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="e.g. Systematic Civil Rights Violations in County Jail System"
          className="w-full bg-studio-dark border border-studio-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-studio-muted focus:outline-none focus:border-studio-accent"
        />
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? "border-studio-accent bg-studio-accent/5"
            : "border-studio-border hover:border-studio-accent/50 bg-studio-dark"
        }`}
      >
        <input {...getInputProps()} />
        <Upload size={24} className="mx-auto mb-2 text-studio-muted" />
        <p className="text-sm text-studio-muted">
          {isDragActive ? "Drop files here..." : "Drop documents here, or click to browse"}
        </p>
        <p className="text-xs text-studio-muted/60 mt-1">.txt, .pdf, .doc, .docx supported</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-2 bg-studio-card rounded-lg px-3 py-2">
              <FileText size={14} className="text-studio-accent flex-shrink-0" />
              <span className="text-xs text-white flex-1 truncate">{file.name}</span>
              <span className="text-xs text-studio-muted">{(file.size / 1024).toFixed(0)}KB</span>
              <button onClick={() => removeFile(i)} className="text-studio-muted hover:text-red-400 ml-1">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Manual text input */}
      {files.length === 0 && (
        <div>
          <label className="block text-xs font-medium text-studio-muted mb-1.5 uppercase tracking-wide">
            Or paste document text directly
          </label>
          <textarea
            value={rawText}
            onChange={e => { setRawText(e.target.value); setExtracted(false); }}
            placeholder="Paste court filings, police reports, evidence summaries, depositions..."
            rows={5}
            className="w-full bg-studio-dark border border-studio-border rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-studio-muted focus:outline-none focus:border-studio-accent resize-none"
          />
        </div>
      )}

      {/* Extract button */}
      {(files.length > 0 || rawText.trim()) && (
        <button
          onClick={handleExtract}
          disabled={extracting || extracted}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
            extracted
              ? "bg-green-800/30 text-green-400 border border-green-700/40 cursor-default"
              : "bg-studio-accent text-black hover:bg-yellow-400 active:scale-98"
          }`}
        >
          {extracting ? (
            <><Loader2 size={14} className="animate-spin" /> Analyzing Documents...</>
          ) : extracted ? (
            <><CheckCircle size={14} /> Story Brief Ready</>
          ) : (
            <><FileText size={14} /> Build Story Brief</>
          )}
        </button>
      )}

      {/* Skip option */}
      {!extracted && (
        <button
          onClick={() => onContextReady("", storyTitle)}
          className="w-full py-1.5 text-xs text-studio-muted hover:text-white transition-colors"
        >
          Skip documents — do a general interview
        </button>
      )}
    </div>
  );
}
