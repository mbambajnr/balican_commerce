import { Resend } from "resend";
import { config } from "../config";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@balican.resend.dev";
const FROM_NAME = "Bali-Can Limited";

let resendClient: Resend | null = null;

function getClient(): Resend | null {
  if (resendClient) return resendClient;
  if (config.resendApiKey) {
    resendClient = new Resend(config.resendApiKey);
    return resendClient;
  }
  return null;
}

export interface Attachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Attachment[];
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; data?: any; error?: string }> {
  const client = getClient();
  if (!client) {
    if (config.nodeEnv !== "test") {
      console.warn("Resend API key not configured — email not sent");
    }
    return { success: false, error: "Email provider not configured" };
  }

  try {
    const payload: any = {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
    };

    if (options.html) payload.html = options.html;
    if (options.text) payload.text = options.text;

    if (options.attachments && options.attachments.length > 0) {
      payload.attachments = options.attachments.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
        content_type: a.contentType || "application/pdf",
      }));
    }

    const result = await client.emails.send(payload);

    if (result.error) {
      return { success: false, error: JSON.stringify(result.error) };
    }

    return { success: true, data: result.data };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}
