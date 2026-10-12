import { loadEnv } from '../config/env.js';
import type { SendMailInput } from './mailUtils.js';
import { ErrorEnvioCorreo, parseSenderAddress } from './mailUtils.js';

export async function sendViaBrevoApi(input: SendMailInput): Promise<void> {
  const { brevoApiKey, smtpFrom } = loadEnv();
  if (!brevoApiKey) {
    throw new ErrorEnvioCorreo('BREVO_API_KEY no configurada');
  }

  const sender = parseSenderAddress(smtpFrom);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': brevoApiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: sender.name, email: sender.email },
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent: input.html,
      textContent: input.text ?? undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const isIpBlocked =
      res.status === 401 && body.includes('unrecognised IP address');
    throw new ErrorEnvioCorreo(
      `Brevo API ${res.status}: ${body.slice(0, 300)}`,
      isIpBlocked ? 'BREVO_IP_BLOQUEADO' : String(res.status),
    );
  }
}
