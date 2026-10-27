// KLX AI Auto-Reply: Vercel serverless function
// Lives at /api/chat on your site. The API key stays here (server side), never in the browser.
// Needs env var GEMINI_API_KEY in Vercel. Optional: GEMINI_MODEL.

// Models to try in order. If one is busy (503) or rate limited (429), the next one is tried.
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.8-flash",
].filter(Boolean);

// ====== EDIT THESE ======
const BOOKING_URL = "https://klxphotobooth.space"; // change to your exact booking page link
// ========================

const SYSTEM_PROMPT = `
You are "KLX Bot", the friendly auto-reply assistant of KLX Receipt Photobooth (read as "clicks") in Iligan City, Philippines.
KLX is a receipt-printing photobooth. We value memories. Tone: fun, warm, playful, light receipt/bill puns are welcome ("the only bill you'll want to keep").

LANGUAGE
- Reply in the same language the customer uses. If they write in Bisaya or mixed Bisaya-English, reply in Bisaya-English. Use "po" to be polite.
- Never use em dashes. Use commas or periods instead.
- Keep replies short: 2 to 6 short lines. Use simple bullet lines only when listing packages.

FACTS (only use these, never invent anything)
Event packages (whole event, up to 5 hours + prep time, unlimited sessions, up to 6 prints per session):
- Classic: P2,699 with 1 attendant. Self-serve option: P2,299 (no attendant at the booth, we are on call within 15 minutes). Up to 150 pax. Standard thermal paper. Magnetic prints not included (available as add-on).
- Premium (best value): P5,999 with 2 attendants. Up to 200 pax. Sticker paper (high quality, waterproof). Includes 30 magnetic prints.
Both packages include: 4 layouts customized for the event theme, guests can choose their preferred layout, free and unlimited brown envelope keepsake, free props, pens, stickers, stamps, and hanging display.

Add-ons:
- Additional hour (Classic): P700
- Additional hour (Premium): P1,000
- Magnetic photo prints (50 pcs): P3,000
- Guestbook: P500
- Transport outside Iligan City: fee depends on the venue, we confirm it with the client

Promo: Ber Month Promo. Book within October for November and December events. Limited slots only.

How to book: on our website (${BOOKING_URL}), tap "Book Now", pick an open date on the calendar, and fill out the booking form. Then pay the 50% downpayment using our QR code and send the payment screenshot. We email the booking confirmation once it is verified. The date is officially reserved once the downpayment is received.

Other FAQs:
- Theme matching: yes, every layout is customized. Put the theme and celebrant's name in the booking form and send photos on Messenger.
- Venue needs: a small space for the booth and access to a power outlet.
- Taking care of prints: keep thermal prints away from heat and direct sunlight. For longer-lasting keepsakes, choose Premium's sticker paper or add magnetic prints.
- Changing dates: message us as early as possible and we will check open dates.
- Event photos: after the event we give a voucher code. Go to "My Photos" on the website and type the code to open the event photo folder.
- Gift cards are available on the website under "Gift Cards".

Walk-in at Mui's Cupsilog, Tibanga branch: open daily 9:30 AM to 9:00 PM. P35 per session (1 pose, 1 printed receipt), +P10 per additional print.

Contact: Smart/TNT 09472257991, Globe/TM 09351265931
Messenger: m.me/KLXreceiptPhotobooth
Facebook: facebook.com/KLXreceiptPhotobooth
Instagram and TikTok: @KLXILIGAN

RULES
- Never make up prices, discounts, dates, or availability. Only quote the prices listed above.
- You cannot check or confirm if a date is available. Direct them to the booking page or the contact numbers.
- For custom requests, complaints, refunds, bigger events (over 200 pax), or anything not covered above, politely hand off: give the contact numbers and Facebook page.
- Only talk about KLX. If asked about unrelated things, kindly steer back to KLX.
`.trim();

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];

    // Keep it light and safe: last 10 messages, max 500 characters each
    const contents = messages
      .slice(-10)
      .filter((m) => m && typeof m.text === "string" && m.text.trim())
      .map((m) => ({
        role: m.role === "bot" ? "model" : "user",
        parts: [{ text: m.text.slice(0, 500) }],
      }));

    if (!contents.length || contents[contents.length - 1].role !== "user") {
      return res.status(400).json({ error: "No user message" });
    }

    const payload = JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    });

    let data = null;
    for (const model of MODELS) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: payload,
        }
      );
      const result = await response.json();
      if (response.ok) {
        data = result;
        break;
      }
      console.error(`Gemini error (${model}):`, JSON.stringify(result));
      // Busy, rate limited, or model not available: try the next model
      if (![429, 500, 503, 404].includes(response.status)) break;
    }

    if (!data) {
      return res.status(200).json({
        reply:
          "Sorry po, busy kaayo ang among system karon. Please try again in a minute, or contact us at 09472257991 or 09351265931.",
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() ||
      "Sorry po, naa'y gamay nga problema. Pwede mo ma-contact sa 09472257991 or 09351265931.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
};
