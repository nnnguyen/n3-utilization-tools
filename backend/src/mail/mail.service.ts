import { Injectable } from "@nestjs/common";
import { emailText, Language } from "../notifications/notification-text";
import * as nodemailer from "nodemailer";

// Notification text includes user-controlled values (e.g. Zoom meeting topics)
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

@Injectable()
export class MailService {
  private transporter;

  constructor() {
    // Cấu hình đơn giản với SMTP, có thể mở rộng qua biến môi trường
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || "smtp.gmail.com",
      port: parseInt(process.env.MAIL_PORT || "587"),
      secure: process.env.MAIL_SECURE === "true",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  async sendMail(to: string, subject: string, html: string) {
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
      console.warn("Mail credentials missing. Skipping email send to:", to);
      console.log("Mail Subject:", subject);
      console.log("Mail Content:", html);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"N3 Connect" <${process.env.MAIL_USER}>`,
        to,
        subject,
        html,
      });
    } catch (error) {
      console.error("Error sending email:", error);
    }
  }

  // Email copy of an in-app notification (sync completed / failed)
  async sendNotificationEmail(
    email: string,
    name: string | null,
    notification: {
      type: "sync_completed" | "sync_failed";
      title: string;
      message: string;
      link?: string | null;
    },
    language: Language = "vi",
  ) {
    const text = emailText(language);
    const isFailure = notification.type === "sync_failed";
    const accent = isFailure ? "#d73224" : "#1677ff";
    // Relative links point into the app; absolute ones (YouTube) stay as they are
    const url = notification.link
      ? notification.link.startsWith("http")
        ? notification.link
        : `${process.env.FRONTEND_URL}${notification.link}`
      : null;
    const settingsUrl = `${process.env.FRONTEND_URL}/zoom-utilities`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
        <div style="border-left: 4px solid ${accent}; padding: 4px 16px; margin-bottom: 16px;">
          <h2 style="margin: 0; color: ${accent};">${escapeHtml(notification.title)}</h2>
        </div>
        <p>${escapeHtml(text.greeting(name))}</p>
        <p>${escapeHtml(notification.message)}</p>
        ${
          url
            ? `<div style="text-align: center; margin: 24px 0;">
                <a href="${escapeHtml(url)}" style="background-color: ${accent}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  ${isFailure ? text.viewDetails : text.viewVideo}
                </a>
              </div>`
            : ""
        }
        <div style="border-top: 1px solid #eee; padding-top: 16px; font-size: 12px; color: #888;">
          ${escapeHtml(text.footer)}
          <a href="${escapeHtml(settingsUrl)}" style="color: #888;">${escapeHtml(settingsUrl)}</a>.
        </div>
      </div>
    `;
    await this.sendMail(email, `[N3 Connect] ${notification.title}`, html);
  }

  async sendVerificationEmail(email: string, token: string) {
    const url = `${process.env.FRONTEND_URL}/word-cloud/verify-email?token=${token}`;
    const html = `
      <h1>Xác thực Email</h1>
      <p>Cảm ơn bạn đã đăng ký. Vui lòng click vào link bên dưới để xác thực tài khoản:</p>
      <a href="${url}">Xác thực tài khoản</a>
      <p>Hoặc copy link này: ${url}</p>
    `;
    await this.sendMail(email, "Xác thực tài khoản của bạn", html);
  }

  async sendResetPasswordEmail(email: string, token: string, name: string) {
    const url = `${process.env.FRONTEND_URL}/word-cloud/reset-password?token=${token}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
        <div style="background: linear-gradient(to right, #e52d27, #b31217); padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <span style="color: white; font-size: 30px; font-weight: bold;">+</span>
        </div>
        <div style="padding: 20px;">
            <h3>Xin chào ${name || "bạn"},</h3>
            <p>Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu của bạn.</p>
            <p>Để tiếp tục, vui lòng nhấn vào nút bên dưới.</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${url}" style="background-color: #d73224; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">Đặt lại mật khẩu</a>
            </div>
            <p>Nếu nút ở trên không hoạt động, bạn có thể truy cập liên kết sau:</p>
            <p style="word-break: break-all; background: #f9f9f9; padding: 10px; border-radius: 4px; color: #d73224;">${url}</p>
            <p>Liên kết này sẽ hết hạn sau 10 minutes.</p>
            <p>Nếu bạn không yêu cầu điều này, vui lòng bỏ qua email này.</p>
        </div>
        <div style="border-top: 1px solid #eee; padding: 20px; text-align: center; font-size: 12px; color: #888;">
            Đây là email tự động. Vui lòng không trả lời trực tiếp vào email này.<br/>
            ©2026 Kristo Network - Không gian sống đức tin Kitô giáo mỗi ngày. Đã đăng ký bản quyền.
        </div>
      </div>
    `;
    await this.sendMail(email, "Yêu cầu đặt lại mật khẩu", html);
  }
}
