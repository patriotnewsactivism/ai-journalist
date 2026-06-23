// ─────────────────────────────────────────────
//  Groq (llama-3.3-70b) — Interview Brain
//  Replaces Gemini — same function signatures
// ─────────────────────────────────────────────

async function groqChat(systemPrompt: string, userPrompt: string, maxTokens = 800): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.85,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("Groq error " + res.status + ": " + err);
  }

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
