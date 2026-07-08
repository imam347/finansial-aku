import { z } from "zod";

export const transactionSchema = z.object({
  householdId: z.string().uuid(),
  type: z.enum(["expense", "income", "transfer"]),
  amount: z.number().int().positive().max(100_000_000_000),
  accountId: z.string().uuid(),
  destinationAccountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  date: z.iso.date(),
  note: z.string().trim().max(100).default(""),
}).superRefine((value, context) => {
  if (value.type === "transfer" && (!value.destinationAccountId || value.destinationAccountId === value.accountId)) {
    context.addIssue({ code: "custom", path: ["destinationAccountId"], message: "Akun tujuan harus berbeda." });
  }
  if (value.type !== "transfer" && !value.categoryId) {
    context.addIssue({ code: "custom", path: ["categoryId"], message: "Kategori wajib dipilih." });
  }
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
