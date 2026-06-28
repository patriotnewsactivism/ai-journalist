import { useState, useCallback } from "react";

export interface SavedSession {
  id: string;
  storyTitle: string;
  journalistId: string;
  journalistName: string;
  journalistAccentColor: string;
  transcript: string;
  date: string;
  exchangeCount: number;
}

const KEY = "wtpn_sessions";
const MAX = 10;

function load(): SavedSession[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function useSessions() {
  const [sessions, setSessions] = useState<SavedSession[]>(load);

  const saveSession = useCallback((
    storyTitle: string,
    journalistId: string,
    journalistName: string,
    journalistAccentColor: string,
    transcript: string,
    exchangeCount: number,
  ) => {
    const session: SavedSession = {
      id: `s-${Date.now()}`,
      storyTitle: storyTitle || "Untitled Interview",
      journalistId,
      journalistName,
      journalistAccentColor,
      transcript,
      date: new Date().toISOString(),
      exchangeCount,
    };
    setSessions(prev => {
      const updated = [session, ...prev].slice(0, MAX);
      try { localStorage.setItem(KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
    return session.id;
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      try { localStorage.setItem(KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const downloadSession = useCallback((session: SavedSession) => {
    const blob = new Blob([session.transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-${session.storyTitle.slice(0, 30).replace(/\s+/g, "-")}-${session.date.slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return { sessions, saveSession, deleteSession, downloadSession };
}
