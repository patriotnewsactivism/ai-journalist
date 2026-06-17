import type { NextApiRequest, NextApiResponse } from "next";
import { extractStoryContext } from "@/lib/gemini";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { documentText, storyTitle } = req.body;
  if (!documentText) return res.status(400).json({ error: "No document text" });

  try {
    const context = await extractStoryContext(documentText, storyTitle || "Untitled");
    res.status(200).json({ context });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
