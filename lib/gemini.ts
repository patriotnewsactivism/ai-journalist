// ─────────────────────────────────────────────
//  Gemini 2.5 Flash — Interview Brain
// ─────────────────────────────────────────────

export async function generateJournalistResponse(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          topK: 40,
          topP: 0.92,
          maxOutputTokens: 800,
          stopSequences: ["Interviewee:"],
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

export async function extractStoryContext(documentText: string, storyTitle: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const prompt = `You are a research assistant preparing a briefing for a journalist conducting an interview.
  
Story Title: ${storyTitle}

Source Documents:
${documentText.slice(0, 30000)}

You are a senior investigative journalist's research director preparing a briefing before a live recorded interview.

Extract and organize the following from the documents:
- Named individuals (full names, titles, roles, organizations)
- Key dates and timeline of events
- Specific allegations, incidents, and violations (include case numbers, statute references if present)
- Causal chains: what led to what, who knew what and when
- Contradictions, gaps, or inconsistencies in the record
- Legal citations, court filings, agency findings
- Direct quotes that are most newsworthy or damning
- Suggested angles and follow-up threads a journalist should press on

Format as a tight journalist briefing with clear headers. Preserve specificity — names, dates, numbers matter. Flag the top 3 most explosive or legally significant facts. Max 800 words.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
    }
  );

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

export async function generateInterviewSummary(
  transcript: string,
  storyTitle: string,
  journalistName: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const prompt = `You are a news producer. Here is a raw interview transcript:

Interview: "${storyTitle}"
Journalist: ${journalistName}

TRANSCRIPT:
${transcript}

Generate:
1. A broadcast-ready headline (1 line)
2. A 3-sentence lead paragraph (inverted pyramid — most important first)
3. Top 3 key quotes from the interviewee (exact, with context)
4. What follows / next steps suggested

Format cleanly with headers.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
      }),
    }
  );

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}
