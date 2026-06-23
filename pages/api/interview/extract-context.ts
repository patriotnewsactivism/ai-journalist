import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import fs from "fs";
import { extractStoryContext } from "@/lib/gemini";

export const config = { api: { bodyParser: false } };

async function extractTextFromFile(filepath: string, mimetype: string): Promise<string> {
  const buffer = await fs.promises.readFile(filepath);

  if (mimetype === "application/pdf") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimetype === "application/msword"
  ) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  return buffer.toString("utf-8");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const form = formidable({ maxFileSize: 50 * 1024 * 1024, maxFiles: 10 });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: err.message });

    const storyTitle = Array.isArray(fields.storyTitle) ? fields.storyTitle[0] : fields.storyTitle || "Untitled";

    // Support both raw file uploads (new) and plain text body (legacy)
    const rawText = Array.isArray(fields.documentText) ? fields.documentText[0] : fields.documentText;

    let combinedText = rawText || "";

    const uploadedFiles = files.documents
      ? Array.isArray(files.documents) ? files.documents : [files.documents]
      : [];

    for (const file of uploadedFiles) {
      try {
        const text = await extractTextFromFile(file.filepath, file.mimetype || "text/plain");
        combinedText += `\n\n=== ${file.originalFilename || "Document"} ===\n${text}`;
      } catch (e: any) {
        combinedText += `\n\n[Failed to extract ${file.originalFilename}: ${e.message}]`;
      }
    }

    if (!combinedText.trim()) {
      return res.status(400).json({ error: "No document text or files provided." });
    }

    try {
      const context = await extractStoryContext(combinedText, storyTitle);
      res.status(200).json({ context });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
