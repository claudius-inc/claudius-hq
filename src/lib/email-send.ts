import nodemailer from "nodemailer";

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS env vars.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendEmail({ to, subject, text, html, replyTo }: SendEmailOptions) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@claudiusinc.com";
  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from,
    to: Array.isArray(to) ? to.join(", ") : to,
    subject,
    text,
    html,
    replyTo,
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
  };
}
