import assert from "node:assert/strict";
import test from "node:test";
import { isSessionExpired, parseSessionActivity, SESSION_IDLE_TIMEOUT_MS } from "../src/lib/session";

const now = 1_800_000_000_000;

test("session helper parses valid activity timestamps", () => {
  assert.equal(parseSessionActivity(String(now)), now);
  assert.equal(parseSessionActivity("not-a-number"), null);
  assert.equal(parseSessionActivity(undefined), null);
});

test("session expires after more than four idle hours", () => {
  assert.equal(isSessionExpired(now - SESSION_IDLE_TIMEOUT_MS + 1, now), false);
  assert.equal(isSessionExpired(now - SESSION_IDLE_TIMEOUT_MS - 1, now), true);
  assert.equal(isSessionExpired(null, now), true);
});
