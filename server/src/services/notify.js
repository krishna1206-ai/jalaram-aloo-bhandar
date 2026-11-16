// Outgoing email (SMTP) and SMS (MSG91 or Twilio). Each is used only when its settings are present.
import nodemailer from "nodemailer";
import { config } from "../config.js";
import { HttpError } from "../errors.js";

let transport = null;

export const emailEnabled = () => Boolean(config.smtp.host && config.smtp.from);
export const smsEnabled = () => {
  const s = config.sms;
  if (s.provider === "msg91") return Boolean(s.msg91AuthKey && s.msg91TemplateId);
  if (s.provider === "twilio") return Boolean(s.twilioSid && s.twilioToken && s.twilioFrom);
  return false;
};

export async function sendEmail(to, subject, text) {
  if (!emailEnabled()) throw new HttpError(503, "Email is not set up on this server.");
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  await transport.sendMail({ from: `"${config.appName}" <${config.smtp.from}>`, to, subject, text });
}

// `otp` is passed separately because MSG91 fills it into a DLT-approved template.
export async function sendSms(mobile, text, { otp } = {}) {
  if (!smsEnabled()) throw new HttpError(503, "SMS is not set up on this server.");
  const s = config.sms;
  let res;
  if (s.provider === "msg91") {
    const url = new URL("https://control.msg91.com/api/v5/otp");
    url.search = new URLSearchParams({ template_id: s.msg91TemplateId, mobile: `91${mobile}`, otp: otp ?? "" }).toString();
    res = await fetch(url, { method: "POST", headers: { authkey: s.msg91AuthKey, "Content-Type": "application/json" }, body: "{}" });
  } else {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${s.twilioSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${s.twilioSid}:${s.twilioToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: `+91${mobile}`, From: s.twilioFrom, Body: text }),
    });
  }
  if (!res.ok) {
    console.error(`SMS via ${s.provider} failed: ${res.status} ${await res.text().catch(() => "")}`);
    throw new HttpError(502, "We couldn't send the SMS. Please try again in a minute.");
  }
}

// Best-effort update to the user (KYC result, deposit credited...). Never fails the request.
export function notifyUser(user, subject, text) {
  if (!emailEnabled() || !user?.email) return;
  sendEmail(user.email, subject, `Hi ${user.name},\n\n${text}\n\n— ${config.appName}`).catch((err) =>
    console.error("notification email failed", err.message)
  );
}
