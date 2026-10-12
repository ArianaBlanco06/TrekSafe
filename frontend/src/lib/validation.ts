const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export type PasswordStrength = {
  score: number;
  label: string;
  checks: {
    length: boolean;
    upper: boolean;
    lower: boolean;
    digit: boolean;
  };
};

export function getPasswordStrength(password: string): PasswordStrength {
  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const labels = ['Muy débil', 'Débil', 'Regular', 'Buena', 'Fuerte'];
  return { score, label: labels[score] ?? 'Muy débil', checks };
}

export function isStrongPassword(password: string): boolean {
  const { checks } = getPasswordStrength(password);
  return Object.values(checks).every(Boolean);
}

export function isValidDni(value: string): boolean {
  return /^\d{8}$/.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  return /^\+?\d{9,15}$/.test(value.trim());
}
