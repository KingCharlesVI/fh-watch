import type { FastifyBaseLogger } from "fastify";
import nodemailer from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export function smtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}

/** Development: write emails to the log instead of sending them. */
export function logMailer(log: FastifyBaseLogger): Mailer {
  return {
    async send(mail) {
      log.info({ mail }, `Email to ${mail.to}: ${mail.subject}`);
    },
  };
}

/** Tests: keep emails in memory. */
export function memoryMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = [];
  return {
    sent,
    async send(mail) {
      sent.push(mail);
    },
  };
}
