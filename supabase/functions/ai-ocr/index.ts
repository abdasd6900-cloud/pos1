const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface OcrResult {
  type: "sim_card" | "transfer_receipt" | "whatsapp_voice" | "whatsapp_image_sim" | "unknown";
  phone?: string;
  sim?: string;
  senderName?: string;
  recipientName?: string;
  amount?: number;
  currency?: string;
  reference?: string;
  rawText?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKeyEnv = Deno.env.get("SUPABASE_ANON_KEY");
  if (supabaseUrl && anonKeyEnv) {
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { "apikey": anonKeyEnv, "Authorization": authHeader },
    });
    if (!userResp.ok) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  try {
    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return new Response(
        JSON.stringify({ error: "Image data URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate image data URL: must start with data:image/ and be within size limits
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB base64 payload
    if (!image.startsWith("data:image/")) {
      return new Response(
        JSON.stringify({ error: "Invalid image format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    const mimeMatch = image.match(/^data:(image\/[a-z]+);base64,/i);
    if (!mimeMatch || !allowedMimes.includes(mimeMatch[1].toLowerCase())) {
      return new Response(
        JSON.stringify({ error: "Unsupported image type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (image.length > MAX_IMAGE_SIZE) {
      return new Response(
        JSON.stringify({ error: "Image too large" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openRouterKey && !openAiKey) {
      return new Response(
        JSON.stringify({ error: "AI_NOT_CONFIGURED" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an OCR specialist for mobile phone screenshots. You must classify the image into one of several types and extract the relevant fields.

IMAGE TYPES:
1. "sim_card" — A photo of a SIM card (physical or eSIM activation card). It typically shows a barcode/QR code with printed numbers below it.
   Fields to extract:
   - phone: the phone number (exactly 10 digits, NOT starting with 0)
   - sim: the SIM card number / ICCID (longer number, 15-22 digits)

2. "transfer_receipt" — A screenshot of a bank transfer, payment app receipt, or mobile notification showing a money transfer. It may be in Arabic or English. It contains a sender name, recipient name, and amount.
   Fields to extract:
   - senderName: name of the person who sent the money (may be absent)
   - recipientName: name of the person who received the money (may be absent)
   - amount: the transfer amount as a number (no currency symbols)
   - currency: the currency code (SAR, ILS, USD, JOD, EGP) if identifiable
   - reference: transaction reference number if visible

3. "whatsapp_voice" — A screenshot of a WhatsApp conversation showing a voice message bubble (audio recording). This is recognizable by a microphone icon or waveform in a chat bubble. No text fields to extract.

4. "whatsapp_image_sim" — A screenshot of a WhatsApp conversation where the customer sent an image/photo (not a voice message) that may contain a SIM card number. This is recognizable by an image thumbnail or photo attachment in a chat bubble. No text fields to extract.

If the image is none of the above, return type "unknown" with empty fields.

Return ONLY a JSON object. Do not include any explanation or markdown.`;

    const userContent = [
      {
        type: "text",
        text: "Analyze this image. First determine if it is a SIM card photo (type=\"sim_card\") or a transfer/payment receipt screenshot (type=\"transfer_receipt\"). Then extract the relevant fields. Return JSON like: {\"type\":\"sim_card\",\"phone\":\"05XXXXXXXX\",\"sim\":\"8991200...\"} or {\"type\":\"transfer_receipt\",\"senderName\":\"أحمد\",\"recipientName\":\"محمد\",\"amount\":50,\"currency\":\"ILS\",\"reference\":\"\"}",
      },
      { type: "image_url", image_url: { url: image } },
    ];

    let result: OcrResult | null = null;

    if (openRouterKey) {
      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openRouterKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.0-flash-exp:free",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
            max_tokens: 400,
            temperature: 0,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content ?? "";
          result = parseAiResponse(text);
        }
      } catch {
        // fall through to OpenAI
      }
    }

    if (!result && openAiKey) {
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userContent },
            ],
            max_tokens: 400,
            temperature: 0,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content ?? "";
          result = parseAiResponse(text);
        }
      } catch {
        // fall through
      }
    }

    if (result) {
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "AI_SERVICE_ERROR" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "OCR processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseAiResponse(text: string): OcrResult {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validTypes = ["sim_card", "transfer_receipt", "whatsapp_voice", "whatsapp_image_sim"];
      const type = validTypes.includes(parsed.type) ? parsed.type : "unknown";

      if (type === "sim_card") {
        return {
          type: "sim_card",
          phone: String(parsed.phone ?? "").replace(/\D/g, "").slice(0, 10),
          sim: String(parsed.sim ?? "").trim(),
        };
      }

      if (type === "transfer_receipt") {
        return {
          type: "transfer_receipt",
          senderName: String(parsed.senderName ?? "").trim(),
          recipientName: String(parsed.recipientName ?? "").trim(),
          amount: typeof parsed.amount === "number" ? parsed.amount : parseFloat(String(parsed.amount ?? "0")) || 0,
          currency: String(parsed.currency ?? "").trim().toUpperCase() || undefined,
          reference: String(parsed.reference ?? "").trim(),
        };
      }

      if (type === "whatsapp_voice") {
        return { type: "whatsapp_voice" };
      }

      if (type === "whatsapp_image_sim") {
        return { type: "whatsapp_image_sim" };
      }

      return { type: "unknown" };
    }
  } catch {
    // Fallback: try to detect type from raw text
    const lowerText = text.toLowerCase();
    if (lowerText.includes("iccid") || lowerText.includes("sim card") || /\b\d{15,22}\b/.test(text)) {
      const phoneMatch = text.match(/\b(\d{10})\b/);
      const simMatch = text.match(/\b(\d{15,22})\b/);
      return {
        type: "sim_card",
        phone: phoneMatch?.[1] ?? "",
        sim: simMatch?.[1] ?? "",
      };
    }
    if (lowerText.includes("transfer") || lowerText.includes("تحويل") || lowerText.includes("حواله") || lowerText.includes("amount") || lowerText.includes("مبلغ")) {
      const amountMatch = text.match(/(\d+(?:[.,]\d+)?)/);
      return {
        type: "transfer_receipt",
        amount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : 0,
        rawText: text,
      };
    }
  }
  return { type: "unknown" };
}
