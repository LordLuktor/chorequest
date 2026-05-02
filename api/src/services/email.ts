import nodemailer from 'nodemailer';
import { readFileSync, existsSync } from 'fs';

// ── SMTP Configuration ─────────────────────────────────────────
function getSmtpPassword(): string {
  const secretPath = '/run/secrets/chorequest_smtp_password';
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, 'utf8').trim();
  }
  return process.env.SMTP_PASSWORD || '';
}

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const APP_URL = process.env.APP_URL || 'https://chores.steinmetz.ltd';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (!SMTP_HOST || !SMTP_USER) {
      throw new Error('SMTP not configured: SMTP_HOST and SMTP_USER are required');
    }
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // SSL for port 465
      auth: {
        user: SMTP_USER,
        pass: getSmtpPassword(),
      },
    });
  }
  return transporter;
}

// ── Send generic email ─────────────────────────────────────────
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const transport = getTransporter();
  await transport.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    html,
  });
}

// ── Password Reset Email ───────────────────────────────────────
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  displayName: string,
): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const subject = 'ChoreQuest — Reset Your Password';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0f0e1a; color: #e0e7ff;">
      <h1 style="color: #818cf8; font-size: 24px; margin: 0 0 24px 0;">
        Chore<span style="color: white;">Quest</span>
      </h1>
      <p style="margin: 0 0 16px; font-size: 16px;">Hi ${escapeHtml(displayName)},</p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #94a3b8;">
        We received a request to reset your password. Click the button below to choose a new one.
        This link expires in 1 hour.
      </p>
      <a href="${escapeHtml(resetUrl)}"
         style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Reset Password
      </a>
      <p style="margin: 24px 0 0; font-size: 12px; color: #5c6278;">
        If you didn't request this, you can safely ignore this email. Your password will not change.
      </p>
    </div>
  `;
  await sendEmail(to, subject, html);
}

// ── Welcome Email ──────────────────────────────────────────────
export async function sendWelcomeEmail(
  to: string,
  displayName: string,
  householdName: string,
): Promise<void> {
  const subject = 'Welcome to ChoreQuest!';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0f0e1a; color: #e0e7ff;">
      <h1 style="color: #818cf8; font-size: 24px; margin: 0 0 24px 0;">
        Chore<span style="color: white;">Quest</span>
      </h1>
      <p style="margin: 0 0 16px; font-size: 16px;">Hi ${escapeHtml(displayName)},</p>
      <p style="margin: 0 0 16px; font-size: 14px; color: #94a3b8;">
        Welcome to ChoreQuest! Your household <strong style="color: #e0e7ff;">${escapeHtml(householdName)}</strong> is all set up.
      </p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #94a3b8;">
        Here's what you can do next:
      </p>
      <ul style="margin: 0 0 24px; padding-left: 20px; font-size: 14px; color: #94a3b8;">
        <li style="margin-bottom: 8px;">Create chore templates for your family</li>
        <li style="margin-bottom: 8px;">Invite family members with your household invite code</li>
        <li style="margin-bottom: 8px;">Set up rewards and allowance tracking</li>
      </ul>
      <a href="${escapeHtml(APP_URL)}"
         style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Open ChoreQuest
      </a>
    </div>
  `;
  await sendEmail(to, subject, html);
}

// ── SOS Notification Email ─────────────────────────────────────
export async function sendSOSNotification(
  to: string,
  memberName: string,
  householdName: string,
): Promise<void> {
  const subject = `🚨 SOS Alert — ${memberName} needs help!`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0f0e1a; color: #e0e7ff;">
      <h1 style="color: #ef4444; font-size: 24px; margin: 0 0 24px 0;">
        &#x1F6A8; SOS Alert
      </h1>
      <p style="margin: 0 0 16px; font-size: 16px;">
        <strong>${escapeHtml(memberName)}</strong> has triggered an SOS alert in your household
        <strong>${escapeHtml(householdName)}</strong>.
      </p>
      <p style="margin: 0 0 24px; font-size: 14px; color: #94a3b8;">
        Open ChoreQuest to view their location and respond.
      </p>
      <a href="${escapeHtml(APP_URL)}"
         style="display: inline-block; background: #ef4444; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Open ChoreQuest
      </a>
    </div>
  `;
  await sendEmail(to, subject, html);
}

// ── HTML escape helper ─────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
