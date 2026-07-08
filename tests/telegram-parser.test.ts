import assert from "node:assert/strict";
import test from "node:test";
import { parseIndonesianAmount, parseTemplate } from "../src/lib/telegram/parser.ts";

const context = {
  accounts: [{ id: "bca", name: "BCA Utama" }, { id: "jago", name: "Jago Bersama" }, { id: "gopay", name: "GoPay" }],
  categories: [
    { id: "food", name: "Makan & minum", type: "expense" as const },
    { id: "transport", name: "Transportasi", type: "expense" as const },
    { id: "salary", name: "Gaji", type: "income" as const },
  ],
  defaultAccountId: "bca",
  today: "2026-07-08",
};

test("parses common Indonesian rupiah notation", () => {
  assert.equal(parseIndonesianAmount("keluar 50rb makan"), 50_000);
  assert.equal(parseIndonesianAmount("masuk 1,5jt"), 1_500_000);
  assert.equal(parseIndonesianAmount("bayar Rp186.500"), 186_500);
  assert.equal(parseIndonesianAmount("transfer 500000"), 500_000);
});

test("parses expense template with fuzzy account name", () => {
  const result = parseTemplate("keluar 50rb makan dari BCA kopi", context);
  assert.equal(result?.type, "expense");
  assert.equal(result?.amount, 50_000);
  assert.equal(result?.accountId, "bca");
  assert.equal(result?.categoryId, "food");
});

test("parses income and transfer templates", () => {
  const income = parseTemplate("masuk 10jt gaji ke BCA", context);
  assert.equal(income?.type, "income");
  assert.equal(income?.categoryId, "salary");
  const transfer = parseTemplate("transfer 500rb dari BCA ke Jago", context);
  assert.equal(transfer?.accountId, "bca");
  assert.equal(transfer?.destinationAccountId, "jago");
});

test("uses yesterday in Asia/Jakarta and delegates natural language to AI", () => {
  assert.equal(parseTemplate("keluar 20rb makan kemarin", context)?.date, "2026-07-07");
  assert.equal(parseTemplate("tadi ngopi 25 ribu pake gopay", context), null);
});
