// The Get On Deal vendor intro that agents send on WhatsApp after a call. Pure functions (no server imports) so the call panel can use them in the browser.
// One click copies the finished message and opens the customer's chat; the agent pastes and taps Send.
// Why not pre-fill the text in the link: WhatsApp's desktop app turns emoji sent that way into ◆? and builds no video preview card.
// Pasting keeps every emoji and makes WhatsApp create the YouTube card. (Sending with no tap needs the paid WhatsApp Business API and an approved template.)

export const GOD_VIDEO_URL = "https://youtu.be/guK3uzrsYCc?si=3bf--_lATUyVD4-j";
export const GOD_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.getondeal.app";
export const GOD_APP_STORE_URL = "https://apps.apple.com/in/app/get-on-deal/id6818108507";

export type PitchLead = { name?: string | null; business_name?: string | null; category?: string | null };

/** What to call the customer's place, so a restaurant is not pitched as a "café". */
export function venueFor(lead: PitchLead): { word: string; icon: string } {
  const hint = `${lead.category ?? ""}`.toLowerCase();
  if (hint.includes("caf")) return { word: "café", icon: "☕" };
  if (hint.includes("restaurant")) return { word: "restaurant", icon: "🍽️" };
  if (`${lead.business_name ?? lead.name ?? ""}`.toLowerCase().includes("caf")) return { word: "café", icon: "☕" };
  return { word: "business", icon: "🏪" };
}

/** The message. The video link comes before the app links on purpose: WhatsApp previews only the first link, and the video card is what we want. */
export function pitchMessage(lead: PitchLead): string {
  const name = (lead.name ?? "").trim() || "there";
  const { word, icon } = venueFor(lead);
  const Word = word[0].toUpperCase() + word.slice(1);
  return `Hi ${name}! 👋

Greetings from Get On Deal (GOD)!

We’d love to introduce you to an opportunity to make your ${word} more discoverable and attract new customers through our platform.

${icon} Why Listing Your ${Word} on Get On Deal Can Be Valuable:

📍 Reach New Customers
Get discovered by customers actively looking for cafés, restaurants, food spots & dining experiences.

📣 Additional Marketing
Your ${word} gets visibility through our member network, social media promotions, attractive offers & marketing activities.

🔁 Drive Repeat Visits
A special GOD member offer gives customers an additional reason to visit your ${word} again.

💰 Low-Cost Customer Acquisition
Our commission is capped at ₹50 per successful member transaction, irrespective of the bill value.

🎯 You Decide the Offer
You can structure an offer that works best for your ${word}, whether it’s BOGO, flat discounts, combo deals, special menus or other attractive experiences.

Why this matters:

Instead of just being another ${word} listing, GOD aims to help your business gain more visibility, attract new walk-in customers and encourage repeat visits.

Here’s how the GOD vendor partnership works:
👉 ${GOD_VIDEO_URL}

📱 Explore Get On Deal & Download the App:
👉 ${GOD_PLAY_STORE_URL}
👉 ${GOD_APP_STORE_URL}

If you feel this partnership can add value to your ${word}, we can take the next step and discuss the member offer + listing details. 🤝

Get On Deal: More Reach. More Customers. More Business.

Best Regards,
Pramod Vishwakarma
9867172131
www.getondeal.com`;
}

/** 10-digit Indian mobile (6-9 start) or null. Landlines such as 022 numbers have no WhatsApp. */
export function whatsappNumber(mobile: string | null | undefined): string | null {
  let d = String(mobile ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** wa.me link that opens this customer's chat (no text: the message is pasted), or null when the number cannot have WhatsApp. */
export function chatLink(mobile: string | null | undefined): string | null {
  const n = whatsappNumber(mobile);
  return n ? `https://wa.me/91${n}` : null;
}
