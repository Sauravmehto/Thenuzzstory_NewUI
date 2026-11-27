import "server-only";

export interface SendWhatsappResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export interface WhatsappConfigState {
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  reason: string;
}

function normalizeIndianNumber(raw: string): string {
  const digits = raw.replace(/\D+/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

/**
 * Sends a plain text WhatsApp message via Meta WhatsApp Cloud API.
 * Returns a readable error when the integration isn't configured/enabled.
 */
export async function sendWhatsappText(toPhone: string, text: string): Promise<SendWhatsappResult> {
  const state = whatsappConfigState();
  if (!state.ready) {
    return { ok: false, error: state.reason };
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const baseUrl = (process.env.WHATSAPP_API_URL?.trim() || "https://graph.facebook.com/v21.0").replace(/\/+$/, "");
  if (!token || !phoneNumberId) {
    return { ok: false, error: "WhatsApp is not configured (missing access token or phone number ID)." };
  }

  const to = normalizeIndianNumber(toPhone);
  if (!to || to.length < 10) return { ok: false, error: "Customer WhatsApp number is invalid." };

  try {
    const res = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, status: res.status, error: body?.error?.message || `WhatsApp API request failed (${res.status}).` };
    }
    return { ok: true, status: res.status };
  } catch {
    return { ok: false, error: "Couldn't reach WhatsApp API from the server." };
  }
}

/** Public-safe setup state for admin UI (never returns secrets). */
export function whatsappConfigState(): WhatsappConfigState {
  const enabled = process.env.WHATSAPP_ENABLED === "1";
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const configured = Boolean(token && phoneNumberId);
  if (!enabled) {
    return {
      enabled,
      configured,
      ready: false,
      reason: "Auto-send is off. Set WHATSAPP_ENABLED=1 to enable it.",
    };
  }
  if (!configured) {
    return {
      enabled,
      configured,
      ready: false,
      reason: "Auto-send is on, but credentials are missing (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID).",
    };
  }
  return { enabled, configured, ready: true, reason: "WhatsApp auto-send is ready." };
}
