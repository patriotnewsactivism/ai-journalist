import type { NextApiRequest, NextApiResponse } from "next";

/**
 * One-Click Publish API
 * Generates a polished article from interview transcript + coaching summary,
 * then publishes to the selected platform (WordPress, Medium, Substack, or
 * generates a downloadable PDF press release).
 */

interface PublishRequest {
  platform: "wordpress" | "medium" | "substack" | "pdf";
  transcript: string;
  storyTitle: string;
  journalistName: string;
  outlet: string;
  coachingSummary?: any;
  tags?: string[];
  // WordPress
  wpUrl?: string;
  wpUser?: string;
  wpAppPassword?: string;
  // Medium
  mediumToken?: string;
  // Substack
  substackEmail?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const body: PublishRequest = req.body;
  if (!body.transcript?.trim() || !body.storyTitle?.trim()) {
    return res.status(400).json({ error: "transcript and storyTitle are required" });
  }

  try {
    // Step 1: Generate the article from transcript
    const article = await generateArticle(body);

    // Step 2: Publish to the selected platform
    let publishResult: any;

    switch (body.platform) {
      case "wordpress":
        publishResult = await publishToWordPress(body, article);
        break;
      case "medium":
        publishResult = await publishToMedium(body, article);
        break;
      case "substack":
        publishResult = await publishToSubstack(body, article);
        break;
      case "pdf":
        // Return the article as HTML for client-side PDF generation
        publishResult = { html: article.html, title: body.storyTitle, type: "pdf" };
        break;
      default:
        return res.status(400).json({ error: "Invalid platform" });
    }

    res.status(200).json({
      success: true,
      platform: body.platform,
      ...publishResult,
    });
  } catch (error: any) {
    console.error("Publish error:", error);
    res.status(500).json({ error: error.message || "Publishing failed" });
  }
}

// ─── Generate polished article from transcript ───────────────────
async function generateArticle(body: PublishRequest) {
  const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY not set");

  const coachingContext = body.coachingSummary
    ? `\n\nCoaching analysis scores: ${JSON.stringify(body.coachingSummary.scores || {})}`
    : "";

  const prompt = `You are an expert editor. Convert this interview transcript into a polished, publish-ready article.

Title: ${body.storyTitle}
Journalist: ${body.journalistName}, ${body.outlet}
${coachingContext}

TRANSCRIPT:
${body.transcript.slice(0, 8000)}

Write a compelling news article in HTML format. Include:
1. A strong headline (h1)
2. A byline with the journalist's name and outlet
3. A 2-sentence lede that hooks the reader
4. Key quotes from the interviewee in blockquote tags
5. Context and background woven throughout
6. A closing that points to next steps or unresolved questions

Output ONLY the HTML article body (no <html>, <head>, or <body> tags). Start with <h1>.`;

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 2000,
      messages: [
        { role: "system", content: "You are an expert news editor. Output clean, semantic HTML only." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) throw new Error(`AI generation failed: ${res.status}`);
  const data = await res.json();
  const html = data.choices?.[0]?.message?.content || "";

  return { html, title: body.storyTitle };
}

// ─── WordPress REST API publish ──────────────────────────────────
async function publishToWordPress(body: PublishRequest, article: { html: string; title: string }) {
  if (!body.wpUrl || !body.wpUser || !body.wpAppPassword) {
    throw new Error("WordPress requires wpUrl, wpUser, and wpAppPassword");
  }

  const endpoint = `${body.wpUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts`;
  const auth = Buffer.from(`${body.wpUser}:${body.wpAppPassword}`).toString("base64");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      title: article.title,
      content: article.html,
      status: "draft",
      tags: body.tags || [],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WordPress API error: ${res.status} — ${text}`);
  }

  const post = await res.json();
  return {
    url: post.link,
    editUrl: `${body.wpUrl}/wp-admin/post.php?post=${post.id}&action=edit`,
    postId: post.id,
    status: "draft",
  };
}

// ─── Medium API publish ──────────────────────────────────────────
async function publishToMedium(body: PublishRequest, article: { html: string; title: string }) {
  if (!body.mediumToken) throw new Error("Medium requires mediumToken");

  // Get user ID first
  const userRes = await fetch("https://api.medium.com/v1/me", {
    headers: { Authorization: `Bearer ${body.mediumToken}`, Accept: "application/json" },
  });

  if (!userRes.ok) throw new Error("Medium auth failed — check token");
  const userData = await userRes.json();
  const userId = userData.data.id;

  // Convert HTML to Medium's markdown-ish format (strip tags, keep structure)
  const content = article.html
    .replace(/<h1>/g, "# ").replace(/<\/h1>/g, "\n\n")
    .replace(/<h2>/g, "## ").replace(/<\/h2>/g, "\n\n")
    .replace(/<h3>/g, "### ").replace(/<\/h3>/g, "\n\n")
    .replace(/<blockquote>/g, "> ").replace(/<\/blockquote>/g, "\n\n")
    .replace(/<p>/g, "").replace(/<\/p>/g, "\n\n")
    .replace(/<strong>/g, "**").replace(/<\/strong>/g, "**")
    .replace(/<em>/g, "_").replace(/<\/em>/g, "_")
    .replace(/<[^>]+>/g, "");

  const postRes = await fetch(`https://api.medium.com/v1/users/${userId}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${body.mediumToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      title: article.title,
      contentFormat: "markdown",
      content,
      tags: body.tags || [],
      publishStatus: "draft",
    }),
  });

  if (!postRes.ok) throw new Error(`Medium post failed: ${postRes.status}`);
  const post = await postRes.json();
  return { url: post.data.url, status: "draft" };
}

// ─── Substack (email draft) ──────────────────────────────────────
async function publishToSubstack(body: PublishRequest, article: { html: string; title: string }) {
  // Substack doesn't have a public API — return the article for manual paste
  // with a pre-filled mailto link for convenience
  const subject = encodeURIComponent(article.title);
  const mailto = body.substackEmail
    ? `mailto:${body.substackEmail}?subject=${subject}`
    : null;

  return {
    html: article.html,
    title: article.title,
    instructions: "Substack doesn't have a public API. The article HTML is ready to paste into a new Substack post.",
    mailto,
  };
}
