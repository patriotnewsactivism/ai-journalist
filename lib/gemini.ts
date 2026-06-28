// ─────────────────────────────────────────────
//  Groq (llama-3.3-70b) — Interview Brain
//  Replaces Gemini — same function signatures
// ─────────────────────────────────────────────

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

function getGroqKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");
  return key;
}

export async function groqChatStream(systemPrompt: string, userPrompt: string, maxTokens = 800): Promise<Response> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + getGroqKey() },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.85,
      max_tokens: maxTokens,
      stream: true,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error("Groq error " + res.status + ": " + (await res.text()));
  return res;
}

export async function groqChatJSON(systemPrompt: string, userPrompt: string, maxTokens = 600): Promise<any> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + getGroqKey() },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.5,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error("Groq error " + res.status + ": " + (await res.text()));
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
}

async function groqChat(systemPrompt: string, userPrompt: string, maxTokens = 800): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + getGroqKey() },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.85,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error("Groq error " + res.status + ": " + (await res.text()));
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function generateJournalistResponse(prompt: string): Promise<string> {
  return groqChat(
    "You are a sharp, professional investigative journalist conducting a real interview. Ask incisive, targeted questions. Be direct and persistent. Keep responses concise — one question at a time.",
    prompt,
    800
  );
}

export async function extractStoryContext(rawText: string, storyTitle?: string): Promise<string> {
  return groqChat(
    "You are a research assistant for an investigative journalist. Extract and summarize the key facts, people, events, and allegations from the provided documents into a clear, structured briefing.",
    "Extract the key story context from this document:\n\n" + rawText,
    1200
  );
}

export async function generateInterviewSummary(
  transcript: string,
  storyTitle: string,
  journalistName: string
): Promise<string> {
  return groqChat(
    journalistName + " is a professional investigative journalist. Write a concise, compelling post-interview summary suitable for publication.",
    "Story: " + storyTitle + "\n\nInterview transcript:\n" + transcript + "\n\nWrite a structured summary with key findings, quotes, and next steps.",
    1200
  );
}
