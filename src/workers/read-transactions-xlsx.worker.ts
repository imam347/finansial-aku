import { readSheet } from "read-excel-file/web-worker";

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const sheet = await readSheet(event.data);
    self.postMessage({ ok: true, sheet });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : "Gagal membaca XLSX" });
  }
};

export {};
