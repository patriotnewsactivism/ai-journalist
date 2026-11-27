// POST /api/anam/session
// Mints an Anam session token server-side. ANAM_API_KEY never leaves
// the server and never reaches the browser.
//
// Body: { "journalistId": "marcus-cole" | "hank-vance" | "victoria-hayes" }
//   (A request for an unknown journalist, or one without an Anam
//   avatar, returns 400, and the studio falls back to the
//   animated SVG avatar.)
//
// The token is minted with personaConfig:
//   { name, avatarId, avatarModel: "cara-4.1-express",
//     enableAudioPassthrough: true }
// No voice and no LLM are configured on the Anam side — Cartesia
// owns the voice, your stack owns the brain. Anam renders ONLY
// the face and lip-syncs it to Cartesia audio via passthrough.
import type { NextApiRequest, NextApiResponse } from "next";
import { getAnamAvatar } from "@/lib/anam";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { journalistId } = req.body ?? {};
  const persona =
    typeof journalistId === "string" ? getAnamAvatar(journalistId) : null;
  if (!persona) {
    return res
      .status(400)
      .json({ error: "Unknown journalist, or no Anam avatar for this journalist yet" });
  }

  const apiKey = process.env.ANAM_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "ANAM_API_KEY not configured on the server" });
  }

  try {
    const tokenRes = await fetch("https://api.anam.ai/v1/auth/session-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        personaConfig: {
          name: persona.name,
          avatarId: persona.avatarId,
          avatarModel: "cara-4.1-express",
          enableAudioPassthrough: true,
        },
      }),
    });
    const data = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      return res
        .status(tokenRes.status)
        .json({ error: data?.message || `Anam token mint failed (${tokenRes.status})` });
    }
    return res.status(200).json({ sessionToken: data.sessionToken });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Anam token mint failed" });
  }
}
