export interface TelegramAccount {
  id: string;
  name: string;
}

export interface TelegramCategory {
  id: string;
  name: string;
  type: "expense" | "income";
}

export interface ParsedTransaction {
  type: "expense" | "income" | "transfer";
  amount: number;
  accountId: string;
  destinationAccountId?: string;
  categoryId?: string;
  date: string;
  note: string;
  confidence: number;
  parserMode: "template" | "ai";
}

export interface ClassifierContext {
  accounts: TelegramAccount[];
  categories: TelegramCategory[];
  defaultAccountId: string;
  today: string;
}
