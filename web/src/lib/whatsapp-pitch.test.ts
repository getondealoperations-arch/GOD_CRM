// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { GOD_APP_STORE_URL, GOD_PLAY_STORE_URL, GOD_VIDEO_URL, pitchLink, pitchMessage, venueFor, whatsappNumber } from "./whatsapp-pitch.ts";

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

test("the video link comes first so WhatsApp previews the video, then both app links", () => {
  const m = pitchMessage({ name: "A", category: "Restaurant" });
  const video = m.indexOf(GOD_VIDEO_URL), play = m.indexOf(GOD_PLAY_STORE_URL), app = m.indexOf(GOD_APP_STORE_URL);
  assert.ok(video > 0 && play > video && app > play);
  assert.equal(GOD_VIDEO_URL, "https://youtu.be/guK3uzrsYCc");
  assert.ok(m.endsWith("Best Regards,\nPramod Vishwakarma\n9867172131\nwww.getondeal.com"));
});

test("the wa.me link opens the right chat with the exact message", () => {
  const lead = { name: "Bombay Earth", category: "Restaurant" };
  const link = pitchLink("98671 72131", lead)!;
  assert.ok(link.startsWith("https://wa.me/919867172131?text="));
  assert.equal(decodeURIComponent(link.split("?text=")[1]), pitchMessage(lead));
  assert.equal(pitchLink("+91 98671-72131", lead), link);
});

test("landlines and bad numbers get no WhatsApp link", () => {
  assert.equal(whatsappNumber("2261557000"), null);   // Mumbai landline
  assert.equal(whatsappNumber("022 6155 7000"), null);
  assert.equal(whatsappNumber("12345"), null);
  assert.equal(whatsappNumber(""), null);
  assert.equal(pitchLink("2261557000", { name: "X" }), null);
  assert.equal(whatsappNumber("09867172131"), "9867172131");
});
