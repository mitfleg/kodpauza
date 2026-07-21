export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

type VerificationEmailTemplate = {
  code: string;
  expiresInMinutes: number;
  dashboardUrl: string;
};

type BrandedEmailLayout = {
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  bodyHtml: string;
  bodyText: string;
  action?: {
    label: string;
    url: string;
    hint?: string;
  };
  securityNote?: string;
  dashboardUrl: string;
};

const palette = {
  ink: '#17202A',
  paper: '#F7F8FB',
  white: '#FFFFFF',
  slate: '#52606D',
  muted: '#7B8794',
  line: '#DFE6EC',
  mint: '#087F6D',
  mintSoft: '#EAF8F5',
  signal: '#2563EB',
  signalSoft: '#EEF4FF',
};

export function renderVerificationEmail({
  code,
  expiresInMinutes,
  dashboardUrl,
}: VerificationEmailTemplate): RenderedEmail {
  const duration = formatMinutes(expiresInMinutes);
  const verificationUrl = new URL('/register', dashboardUrl).toString();
  const safeCode = escapeHtml(code);

  return renderBrandedEmail({
    subject: 'Подтвердите почту в Kodpauza',
    preheader: `Ваш код — ${code}. Он действует ${duration}.`,
    eyebrow: 'Подтверждение аккаунта',
    title: 'Почта почти подтверждена',
    intro:
      'Вернитесь во вкладку Kodpauza и введите код ниже. Это последний шаг перед входом в кабинет.',
    bodyHtml: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 28px; border-collapse: separate; background: ${palette.mintSoft}; border: 1px solid #B9E7DC; border-radius: 14px;">
        <tr>
          <td style="padding: 22px 24px 10px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 18px; font-weight: 700; letter-spacing: 1.3px; text-transform: uppercase; color: ${palette.mint};">
            Ваш одноразовый код
          </td>
        </tr>
        <tr>
          <td class="verification-code" align="center" style="padding: 4px 18px 8px 28px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace; font-size: 40px; line-height: 52px; font-weight: 700; letter-spacing: 10px; color: ${palette.ink}; mso-line-height-rule: exactly;">
            ${safeCode}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 8px 24px 22px; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 20px; color: ${palette.slate};">
            <span style="display: inline-block; width: 7px; height: 7px; margin-right: 7px; border-radius: 50%; background: ${palette.mint}; vertical-align: 1px;"></span>
            Код действует ${escapeHtml(duration)} и подходит только для одного подтверждения
          </td>
        </tr>
      </table>`,
    bodyText: [
      'Ваш одноразовый код:',
      code,
      '',
      `Код действует ${duration} и подходит только для одного подтверждения.`,
    ].join('\n'),
    action: {
      label: 'Открыть подтверждение',
      url: verificationUrl,
      hint: 'Если кнопка не вернула вас к полю кода, просто скопируйте код из письма.',
    },
    securityNote:
      'Не вы создавали аккаунт? Ничего делать не нужно — без этого кода регистрация не завершится.',
    dashboardUrl,
  });
}

function renderBrandedEmail({
  subject,
  preheader,
  eyebrow,
  title,
  intro,
  bodyHtml,
  bodyText,
  action,
  securityNote,
  dashboardUrl,
}: BrandedEmailLayout): RenderedEmail {
  const homeUrl = new URL('/', dashboardUrl).toString();
  const supportUrl = new URL('/support', dashboardUrl).toString();
  const safeSubject = escapeHtml(subject);
  const safePreheader = escapeHtml(preheader);
  const safeActionUrl = action ? escapeHtml(action.url) : '';

  const actionHtml = action
    ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 0 14px;">
        <tr>
          <td align="center" bgcolor="${palette.signal}" style="border-radius: 9px; mso-padding-alt: 14px 22px;">
            <a href="${safeActionUrl}" style="display: inline-block; padding: 14px 22px; border: 1px solid ${palette.signal}; border-radius: 9px; background: ${palette.signal}; font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 20px; font-weight: 700; color: ${palette.white}; text-decoration: none; mso-padding-alt: 0;">
              ${escapeHtml(action.label)}
            </a>
          </td>
        </tr>
      </table>
      ${
        action.hint
          ? `<p style="margin: 0 0 30px; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 20px; color: ${palette.muted};">${escapeHtml(action.hint)}</p>`
          : ''
      }`
    : '';

  const securityHtml = securityNote
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: separate; background: ${palette.signalSoft}; border-radius: 10px;">
        <tr>
          <td width="4" bgcolor="${palette.signal}" style="width: 4px; border-radius: 10px 0 0 10px; font-size: 0; line-height: 0;">&nbsp;</td>
          <td style="padding: 16px 18px; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 21px; color: #3E4C59;">
            <strong style="color: ${palette.ink};">Безопасность.</strong>
            ${escapeHtml(securityNote)}
          </td>
        </tr>
      </table>`
    : '';

  const text = [
    'KODPAUZA',
    eyebrow.toUpperCase(),
    '',
    title,
    intro,
    '',
    bodyText,
    ...(action ? ['', `${action.label}: ${action.url}`, action.hint ?? ''] : []),
    ...(securityNote ? ['', `Безопасность. ${securityNote}`] : []),
    '',
    'Это автоматическое письмо, отвечать на него не нужно.',
    `Kodpauza: ${homeUrl}`,
    `Поддержка: ${supportUrl}`,
  ]
    .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
    .join('\n');

  const html = `<!doctype html>
<html lang="ru" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${safeSubject}</title>
    <style>
      html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
      table, td { border-collapse: collapse; mso-table-lspace: 0; mso-table-rspace: 0; }
      a { color: inherit; }
      @media only screen and (max-width: 620px) {
        .email-shell { padding: 16px 10px !important; }
        .email-card { width: 100% !important; }
        .header-cell { padding: 24px 22px !important; }
        .content-cell { padding: 34px 22px 28px !important; }
        .footer-cell { padding: 24px 22px 28px !important; }
        .verification-code { padding-left: 24px !important; font-size: 32px !important; line-height: 44px !important; letter-spacing: 7px !important; }
        .header-meta { display: none !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background: ${palette.paper}; word-spacing: normal; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; mso-hide: all;">
      ${safePreheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${palette.paper}" style="width: 100%; background: ${palette.paper};">
      <tr>
        <td class="email-shell" align="center" style="padding: 42px 18px;">
          <!--[if mso]><table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
          <table class="email-card" role="article" aria-roledescription="email" aria-label="${safeSubject}" width="620" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 620px; border-collapse: separate; background: ${palette.white}; border: 1px solid ${palette.line}; border-radius: 18px; box-shadow: 0 18px 44px rgba(23, 32, 42, 0.09); overflow: hidden;">
            <tr>
              <td bgcolor="${palette.ink}" style="padding: 0; background: ${palette.ink}; border-radius: 18px 18px 0 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="38%" height="5" bgcolor="${palette.mint}" style="width: 38%; height: 5px; background: ${palette.mint}; font-size: 0; line-height: 0;">&nbsp;</td>
                    <td width="18%" height="5" bgcolor="${palette.signal}" style="width: 18%; height: 5px; background: ${palette.signal}; font-size: 0; line-height: 0;">&nbsp;</td>
                    <td width="44%" height="5" bgcolor="#2C3945" style="width: 44%; height: 5px; background: #2C3945; font-size: 0; line-height: 0;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="header-cell" bgcolor="${palette.ink}" style="padding: 28px 34px 30px; background: ${palette.ink};">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td valign="middle">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td width="46" height="46" align="center" valign="middle" bgcolor="${palette.white}" style="width: 46px; height: 46px; border-radius: 10px; background: ${palette.white}; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 17px; line-height: 46px; font-weight: 700; color: ${palette.ink};">&lt;/&gt;</td>
                          <td style="padding-left: 14px; font-family: Arial, Helvetica, sans-serif;">
                            <div style="font-size: 20px; line-height: 24px; font-weight: 700; letter-spacing: -0.2px; color: ${palette.white};">kodpauza</div>
                            <div style="padding-top: 4px; font-size: 11px; line-height: 15px; font-weight: 600; color: #AAB6C2;">рекламная пауза в VS Code</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td class="header-meta" align="right" valign="middle" style="font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 14px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #92A0AE;">
                      Служебное письмо
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="content-cell" style="padding: 42px 48px 38px; background: ${palette.white};">
                <p style="margin: 0 0 12px; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 16px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: ${palette.mint};">${escapeHtml(eyebrow)}</p>
                <h1 style="margin: 0 0 16px; font-family: Arial, Helvetica, sans-serif; font-size: 30px; line-height: 38px; font-weight: 700; letter-spacing: -0.6px; color: ${palette.ink};">${escapeHtml(title)}</h1>
                <p style="margin: 0 0 30px; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 25px; color: ${palette.slate};">${escapeHtml(intro)}</p>
                ${bodyHtml}
                ${actionHtml}
                ${securityHtml}
              </td>
            </tr>
            <tr>
              <td class="footer-cell" style="padding: 26px 48px 32px; border-top: 1px solid ${palette.line}; background: #FBFCFD; border-radius: 0 0 18px 18px;">
                <p style="margin: 0 0 12px; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 19px; color: ${palette.muted};">Это автоматическое письмо, отвечать на него не нужно.</p>
                <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 19px; color: ${palette.slate};">
                  <a href="${escapeHtml(homeUrl)}" style="font-weight: 700; color: ${palette.ink}; text-decoration: none;">kodpauza.ru</a>
                  <span style="padding: 0 8px; color: #B4BEC8;">•</span>
                  <a href="${escapeHtml(supportUrl)}" style="color: ${palette.signal}; text-decoration: underline; text-decoration-color: #B7C9F7; text-underline-offset: 3px;">Поддержка</a>
                </p>
              </td>
            </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

function formatMinutes(value: number): string {
  const minutes = Math.max(1, Math.round(value));
  const mod10 = minutes % 10;
  const mod100 = minutes % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? 'минуту'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'минуты'
        : 'минут';

  return `${minutes} ${noun}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
