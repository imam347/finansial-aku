import assert from "node:assert/strict";
import test from "node:test";
import { markNotificationsRead } from "../src/lib/notifications";
import type { AppNotification } from "../src/lib/types";

const notifications: AppNotification[] = [
  { id: "one", title: "Satu", body: "Belum dibaca", time: "Baru", read: false },
  { id: "two", title: "Dua", body: "Sudah dibaca", time: "Kemarin", read: true },
  { id: "three", title: "Tiga", body: "Belum dibaca", time: "2 hari", read: false },
];

test("marks selected notifications as read", () => {
  assert.deepEqual(markNotificationsRead(notifications, ["one"]).map((item) => ({ id: item.id, read: item.read })), [
    { id: "one", read: true },
    { id: "two", read: true },
    { id: "three", read: false },
  ]);
});

test("marks all notifications as read", () => {
  assert.equal(markNotificationsRead(notifications).every((item) => item.read), true);
});
