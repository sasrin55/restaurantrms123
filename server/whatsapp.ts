const WA_SERVICE_URL = process.env.WA_SERVICE_URL;
const WA_API_KEY = process.env.WA_API_KEY;

const SEND_TIMEOUT_MS = 20_000; // abort if the WA service doesn't respond in 20 s

export async function sendWhatsAppConfirmation(
  name: string,
  phone: string,
  message?: string
): Promise<{ chat_id: string }> {
  if (!WA_SERVICE_URL || !WA_API_KEY) {
    console.warn("[WhatsApp] WA_SERVICE_URL or WA_API_KEY not configured — skipping");
    return { chat_id: "" };
  }

  const payload: Record<string, string> = { name, phone };
  if (message) payload.message = message;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${WA_SERVICE_URL}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": WA_API_KEY,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new Error(`WhatsApp service timed out after ${SEND_TIMEOUT_MS / 1000}s — the WA session may be stale and needs a restart`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => ({})) as any;

  if (!res.ok) {
    throw new Error(
      `WhatsApp service responded ${res.status}: ${body?.error ?? JSON.stringify(body)}`
    );
  }

  console.log(`[WhatsApp] Sent to ${phone} — chat_id: ${body.chat_id}`);
  return { chat_id: body.chat_id };
}
