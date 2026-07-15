import nodemailer from 'nodemailer';
import { config } from './config.js';

export type VerificationEmail = {
  email: string;
  code: string;
  expiresInMinutes: number;
};

export interface EmailVerificationMailer {
  sendVerificationCode(message: VerificationEmail): Promise<void>;
}

export function createEmailVerificationMailer(): EmailVerificationMailer {
  if (config.emailTransport === 'console') {
    return {
      async sendVerificationCode({ email, code, expiresInMinutes }) {
        // This transport is deliberately unavailable in production. It keeps local/test
        // environments self-contained without silently pretending an email was delivered.
        console.info(
          `[kodpauza verification] email=${email} code=${code} expiresInMinutes=${expiresInMinutes}`,
        );
      },
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    requireTLS: config.smtpRequireTls,
    connectionTimeout: config.smtpConnectionTimeoutMs,
    greetingTimeout: config.smtpGreetingTimeoutMs,
    socketTimeout: config.smtpSocketTimeoutMs,
    auth:
      config.smtpUser && config.smtpPassword
        ? { user: config.smtpUser, pass: config.smtpPassword }
        : undefined,
  });

  return {
    async sendVerificationCode({ email, code, expiresInMinutes }) {
      await transporter.sendMail({
        from: config.smtpFrom,
        to: email,
        subject: 'Код подтверждения аккаунта Kodpauza',
        text: [
          `Ваш код подтверждения: ${code}`,
          '',
          `Код действует ${expiresInMinutes} минут.`,
          'Если вы не регистрировались в Kodpauza, просто проигнорируйте это письмо.',
        ].join('\n'),
        html: [
          '<p>Ваш код подтверждения аккаунта Kodpauza:</p>',
          `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>`,
          `<p>Код действует ${expiresInMinutes} минут.</p>`,
          '<p>Если вы не регистрировались в Kodpauza, просто проигнорируйте это письмо.</p>',
        ].join(''),
      });
    },
  };
}
