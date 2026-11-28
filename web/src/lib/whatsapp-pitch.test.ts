// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { chatLink, GOD_APP_STORE_URL, GOD_PLAY_STORE_URL, GOD_VIDEO_URL, pitchMessage, venueFor, whatsappNumber } from "./whatsapp-pitch.ts";

test("message is personalised with the customer's name", () => {
  const m = pitchMessage({ name: "Bombay Earth", category: "Restaurant" });
  assert.ok(m.startsWith("Hi Bombay Earth! 👋\n\nGreetings from Get On Deal (GOD)!"));
  assert.ok(pitchMessage({ name: "  " }).startsWith("Hi there!"));
});

test("a restaurant is not pitched as a café, and a café is", () => {
  assert.equal(venueFor({ category: "Restaurant" }).word, "restaurant");
  assert.equal(venueFor({ category: "Café" }).word, "café");
  assert.equal(venueFor({ category: "Cafe" }).word, "café");
  assert.equal(venueFor({ name: "Brew Cafe" }).word, "café");
  assert.equal(venueFor({ category: "Salon" }).word, "business");
  const r = pitchMessage({ name: "Pangat", category: "Restaurant" });
  assert.ok(r.includes("make your restaurant more discoverable") && r.includes("Why Listing Your Restaurant on Get On Deal"));
  assert.ok(!/your café/i.test(r), "no leftover 'your café' for a restaurant");
});

test("the video link comes first so WhatsApp builds the video card, then both app links, each with 👉", () => {
  const m = pitchMessage({ name: "A", category: "Restaurant" });
  const video = m.indexOf(GOD_VIDEO_URL), play = m.indexOf(GOD_PLAY_STORE_URL), app = m.indexOf(GOD_APP_STORE_URL);
  assert.ok(video > 0 && play > video && app > play);
  assert.equal(GOD_VIDEO_URL, "https://youtu.be/guK3uzrsYCc?si=3bf--_lATUyVD4-j"); // the exact link whose card the team already sees
  assert.ok(m.includes(`Here’s how the GOD vendor partnership works:\n👉 ${GOD_VIDEO_URL}\n`));
  assert.ok(m.includes(`📱 Explore Get On Deal & Download the App:\n👉 ${GOD_PLAY_STORE_URL}\n👉 ${GOD_APP_STORE_URL}\n`));
  assert.ok(m.endsWith("Best Regards,\nPramod Vishwakarma\n9867172131\nwww.getondeal.com"));
});

test("emojis are real characters in the message (not placeholders)", () => {
  const m = pitchMessage({ name: "A", category: "Restaurant" });
  for (const e of ["👋", "🍽️", "📍", "📣", "🔁", "💰", "🎯", "👉", "📱", "🤝"]) assert.ok(m.includes(e), `missing ${e}`);
  assert.ok(!m.includes("�"));
  assert.ok(pitchMessage({ name: "A", category: "Cafe" }).includes("☕ Why Listing Your Café"));
});

test("the chat link opens only the customer's chat, with no text in the URL", () => {
  assert.equal(chatLink("98671 72131"), "https://wa.me/919867172131");
  assert.equal(chatLink("+91 98671-72131"), "https://wa.me/919867172131");
  assert.ok(!chatLink("9867172131")!.includes("text="));
});

test("landlines and bad numbers get no WhatsApp link", () => {
  assert.equal(whatsappNumber("2261557000"), null);   // Mumbai landline
  assert.equal(whatsappNumber("022 6155 7000"), null);
  assert.equal(whatsappNumber("12345"), null);
  assert.equal(whatsappNumber(""), null);
  assert.equal(chatLink("2261557000"), null);
  assert.equal(whatsappNumber("09867172131"), "9867172131");
});
