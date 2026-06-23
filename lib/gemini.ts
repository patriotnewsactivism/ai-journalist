// ─────────────────────────────────────────────
//  OpenAI GPT-4o — Interview Brain
//  (Replaced Gemini 2.5 Flash — same function signatures)
// ─────────────────────────────────────────────

async function openAIChat(systemPrompt: string, userPrompt: string, maxTokens = 800): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": ,
    },
    body: JSON.stringify({
      model: "gpt-4o",
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
    throw new Error();
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function generateJournalistResponse(prompt: string): Promise<string> {
  return openAIChat(
    "You are a sharp, professional investigative journalist conducting a real interview. Ask incisive, targeted questions. Be direct and persistent. Keep responses concise — one question at a time.",
    prompt,
    800
  );
}

export async function extractStoryContext(rawText: string): Promise<string> {
  return openAIChat(
    "You are a research assistant for an investigative journalist. Extract and summarize the key facts, people, events, and allegations from the provided documents into a clear, structured briefing.",
    ,
    1200
  );
}

export async function generateInterviewSummary(
  transcript: string,
  storyTitle: string,
  journalistName: string
): Promise<string> {
  return openAIChat(
    ,
    ,
    1200
  );
}
