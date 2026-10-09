import { paymentConfig } from "@/config/payment";

const GRAPH_VERSION = "v22.0";

export type WhatsAppNotice = {
  sent: boolean;
  mode: "api" | "manual" | "failed";
};

function ownerNumber() {
  const fromEnv = (process.env.WHATSAPP_OWNER_NUMBER ?? "").replace(/\D/g, "");
  const raw = fromEnv || paymentConfig.orderWhatsApp.replace(/\D/g, "");
  if (raw.length === 10) return `91${raw}`;
  return raw;
}

export function orderPhoneLabel() {
  const digits = ownerNumber();
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (local.length !== 10) return local;
  return `${local.slice(0, 5)} ${local.slice(5)}`;
}

export function manualUrlFor(message: string) {
  const owner = ownerNumber();
  if (!/^[1-9]\d{7,14}$/.test(owner)) return null;
  return `https://wa.me/${owner}?text=${encodeURIComponent(message)}`;
}

function templateParameter(value: string) {
  const clean = value.replace(/[\n\r\t]+/g, " ").trim();
  return clean.slice(0, 900) || "-";
}

export async function notifyOwner(message: string, parameters?: string[]): Promise<WhatsAppNotice> {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const owner = ownerNumber();

  if (!token || !phoneNumberId || !owner) {
    return { sent: false, mode: "manual" };
  }

  const template = process.env.WHATSAPP_TEMPLATE_NAME?.trim();
  const language = process.env.WHATSAPP_TEMPLATE_LANG?.trim() || "en";
  const templateParameters = parameters ?? [];
  const useTemplate = Boolean(template && templateParameters.length > 0);
  const body = useTemplate
    ? {
        messaging_product: "whatsapp",
        to: owner,
        type: "template",
        template: {
          name: template,
          language: { code: language },
          components: [
            {
              type: "body",
              parameters: templateParameters.map((value) => ({ type: "text", text: templateParameter(value) })),
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: owner,
        type: "text",
        text: { preview_url: false, body: message },
      };

  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error("[whatsapp] request failed", response.status);
      return { sent: false, mode: "failed" };
    }

    return { sent: true, mode: "api" };
  } catch (error) {
    console.error("[whatsapp] request failed");
    return { sent: false, mode: "failed" };
  }
}
