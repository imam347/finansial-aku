import { z } from "zod";
import type { ClassifierContext, ParsedTransaction } from "./types";

const aiResultSchema = z.object({
  type: z.enum(["expense", "income", "transfer"]),
  amount: z.number().int().positive().max(100_000_000_000),
  accountId: z.string(),
  destinationAccountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  date: z.iso.date(),
  note: z.string().max(100),
  confidence: z.number().min(0).max(1),
});

export interface ClassificationResult {
  transaction: ParsedTransaction;
  inputTokens: number;
  outputTokens: number;
}

export async function classifyWithGlm(message: string, context: ClassifierContext): Promise<ClassificationResult> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) throw new Error("ZAI_NOT_CONFIGURED");
  const baseUrl = (process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/paas/v4").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.ZAI_MODEL ?? "glm-4.7-flash",
      temperature: 0,
      max_tokens: 300,
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Klasifikasikan satu pesan transaksi keuangan Indonesia. Kembalikan JSON saja dengan field: type, amount (integer rupiah), accountId, destinationAccountId, categoryId, date YYYY-MM-DD, note maksimal 100 karakter, confidence 0..1. Gunakan hanya ID yang tersedia. Untuk account yang tidak disebut gunakan defaultAccountId. Transfer wajib punya accountId asal dan destinationAccountId berbeda, categoryId null. Jangan mengarang nominal. Hari ini ${context.today}. Akun: ${JSON.stringify(context.accounts)}. Kategori: ${JSON.stringify(context.categories)}. defaultAccountId: ${context.defaultAccountId}.`,
        },
        { role: "user", content: message.slice(0, 500) },
      ],
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`ZAI_HTTP_${response.status}`);
  const data = await response.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("ZAI_EMPTY_RESPONSE");
  const parsed = aiResultSchema.parse(JSON.parse(raw));
  const accountIds = new Set(context.accounts.map((account) => account.id));
  const validCategory = parsed.type === "transfer" || context.categories.some((category) => category.id === parsed.categoryId && category.type === parsed.type);
  if (!accountIds.has(parsed.accountId) || !validCategory || (parsed.type === "transfer" && (!parsed.destinationAccountId || !accountIds.has(parsed.destinationAccountId) || parsed.destinationAccountId === parsed.accountId))) {
    throw new Error("ZAI_INVALID_MAPPING");
  }
  return {
    transaction: {
      type: parsed.type,
      amount: parsed.amount,
      accountId: parsed.accountId,
      destinationAccountId: parsed.destinationAccountId ?? undefined,
      categoryId: parsed.categoryId ?? undefined,
      date: parsed.date,
      note: parsed.note,
      confidence: parsed.confidence,
      parserMode: "ai",
    },
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}
