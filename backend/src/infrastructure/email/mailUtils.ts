export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type ParsedSender = {
  name: string;
  email: string;
};

export function parseSenderAddress(from: string): ParsedSender {
  const trimmed = from.trim();
  const bracketMatch = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (bracketMatch) {
    return { name: bracketMatch[1].trim(), email: bracketMatch[2].trim() };
  }
  if (trimmed.includes('@')) {
    return { name: 'TrekSafe Alertas', email: trimmed };
  }
  return { name: trimmed, email: trimmed };
}

export class ErrorEnvioCorreo extends Error {
  constructor(
    message: string,
    public readonly codigo?: string,
    public readonly pista?: string,
  ) {
    super(message);
    this.name = 'ErrorEnvioCorreo';
  }
}

export function isSmtpAuthOrIpError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string };
  const text = [e.response, e.message].filter(Boolean).join(' ');
  return (
    e.code === 'EAUTH' ||
    e.responseCode === 525 ||
    text.includes('Unauthorized IP') ||
    text.includes('not verified')
  );
}

export function isBrevoTlsHostnameError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  return (
    e.code === 'ESOCKET' &&
    typeof e.message === 'string' &&
    e.message.includes("does not match certificate's altnames")
  );
}

export async function fetchOutboundIp(): Promise<string | null> {
  try {
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ip?: string };
    return data.ip ?? null;
  } catch {
    return null;
  }
}

export function isBrevoApiIpError(err: unknown): boolean {
  if (err instanceof ErrorEnvioCorreo) return err.codigo === 'BREVO_IP_BLOQUEADO';
  if (!err || typeof err !== 'object') return false;
  const e = err as { message?: string };
  return typeof e.message === 'string' && e.message.includes('unrecognised IP address');
}

export function brevoIpAuthHint(outboundIp: string | null, err?: unknown): string {
  if (isBrevoApiIpError(err)) {
    const ipLine = outboundIp
      ? `Brevo API bloqueó la IP ${outboundIp}. Añádela en https://app.brevo.com/security/authorised-ips o desactiva la restricción de IPs.`
      : 'Brevo API bloqueó la IP saliente. Configúrala en Brevo → Security → Authorized IPs.';
    return `${ipLine} La API key es válida; el bloqueo es solo por IP.`;
  }
  if (isBrevoTlsHostnameError(err)) {
    return (
      'Brevo en tu región usa certificado sendinblue.com; el backend ya ajusta TLS servername. ' +
      'Reinicia el servidor si ves este error tras actualizar el código.'
    );
  }
  if (isSmtpAuthOrIpError(err)) {
    const ipLine = outboundIp
      ? `IP no autorizada en Brevo (${outboundIp}). Añádela en Settings → Security → Authorized IPs.`
      : 'IP no autorizada en Brevo. Añádela en Settings → Security → Authorized IPs.';
    return `${ipLine} Las credenciales SMTP parecen válidas (error 525, no de contraseña).`;
  }
  const ipLine = outboundIp
    ? `Tu IP saliente actual: ${outboundIp}. Autorízala en Brevo → Settings → Security → Authorized IPs.`
    : 'Autoriza la IP saliente de tu servidor en Brevo → Settings → Security → Authorized IPs.';
  return `${ipLine} Verifica también que SMTP_FROM use un remitente verificado en Brevo.`;
}
