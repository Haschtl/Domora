import { z } from "zod";

export const RECEIPT_LLM_MODEL_ID = "Qwen3-1.7B-q4f16_1-MLC";

export const ReceiptLlmSchema = z.object({
  title: z.string(),
  description: z.string(),
  amount: z.number(),
  currency: z.string().optional().default("EUR"),
  date: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
});

export type ReceiptLlmResult = z.infer<typeof ReceiptLlmSchema>;

export type LlmProgressReport = {
  progress: number;
  text: string;
};

// User-supplied system prompt (verbatim)
const SYSTEM_PROMPT = `You are extracting a finance entry from OCR text.

Return valid JSON only.

Schema:
{
  "title": string,
  "description": string,
  "amount": number,
  "currency": "EUR",
  "date": "YYYY-MM-DD" | null,
  "merchant": string | null,
  "category": string | null,
  "confidence": number
}

Rules:
- Use the final total amount, not subtotal, tax, deposit, or change.
- If unsure, set confidence below 0.7.
- Do not invent missing values.
- Title should be short, e.g. "REWE Einkauf", "Tankstelle", "Restaurant".`;

type WebLlmEngine = Awaited<ReturnType<typeof import("@mlc-ai/web-llm")["CreateMLCEngine"]>>;

let enginePromise: Promise<WebLlmEngine> | null = null;
let latestProgressCallback: ((report: LlmProgressReport) => void) | null = null;

export const isWebGpuAvailable = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return "gpu" in navigator;
};

const getOrCreateEngine = (onProgress?: (report: LlmProgressReport) => void): Promise<WebLlmEngine> => {
  latestProgressCallback = onProgress ?? null;

  if (!enginePromise) {
    enginePromise = (async () => {
      const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
      const engine = await CreateMLCEngine(RECEIPT_LLM_MODEL_ID, {
        initProgressCallback: (report) => {
          latestProgressCallback?.({ progress: report.progress, text: report.text });
        },
      });
      return engine;
    })().catch((err) => {
      // Reset so next call retries
      enginePromise = null;
      throw err;
    });
  }

  return enginePromise;
};

const extractJsonFromContent = (content: string): string | null => {
  // Strip Qwen3 <think>…</think> blocks before parsing
  const stripped = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  return match?.[0] ?? null;
};

export const extractReceiptDataWithLlm = async (
  ocrText: string,
  onProgress?: (report: LlmProgressReport) => void,
): Promise<ReceiptLlmResult | null> => {
  if (!isWebGpuAvailable()) return null;

  try {
    const engine = await getOrCreateEngine(onProgress);

    const reply = await engine.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: ocrText },
      ],
      max_tokens: 350,
      temperature: 0.1,
    });

    const content = reply.choices[0]?.message?.content ?? "";
    const jsonStr = extractJsonFromContent(content);
    if (!jsonStr) return null;

    const parsed: unknown = JSON.parse(jsonStr);
    const result = ReceiptLlmSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};
