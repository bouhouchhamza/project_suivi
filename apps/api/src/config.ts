import './load-env.js';

function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const appEnv = process.env.APP_ENV ?? 'local';
const jwtSecret = required('JWT_SECRET', 'dev-secret-change-me');
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const adminPassword = process.env.ADMIN_PASSWORD;
const clientName = process.env.CLIENT_NAME ?? 'Suivi des Projets';
const clientSlug = process.env.CLIENT_SLUG ?? 'automateflow';
const appDomain = process.env.APP_DOMAIN ?? 'automateflow.pro';
const supportEmail = process.env.SUPPORT_EMAIL ?? 'support@automateflow.pro';
const companyLogo = process.env.COMPANY_LOGO ?? '';
const primaryColor = process.env.PRIMARY_COLOR ?? '#2F6B60';
const timezone = process.env.APP_TIMEZONE ?? 'Africa/Casablanca';

if (appEnv === 'production') {
  const insecureJwtSecrets = new Set([
    'dev-secret-change-me',
    'change-this-in-production',
    'change-me-with-a-long-random-secret',
    'replace-with-a-long-random-secret',
  ]);
  if (insecureJwtSecrets.has(jwtSecret) || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be changed to a long random value before production startup.');
  }
  if (!/^https:\/\//i.test(corsOrigin)) {
    throw new Error('CORS_ORIGIN must be the HTTPS frontend origin in production.');
  }
  if (!adminPassword || adminPassword === 'ChangeMe123!' || adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD must be changed to a strong value before production startup.');
  }
}

export const config = {
  appEnv,
  port: Number(process.env.PORT ?? 4000),
  jwtSecret,
  corsOrigin,
  publicClient: {
    clientName,
    clientSlug,
    appDomain,
    supportEmail,
    companyLogo,
    primaryColor,
    timezone,
  },
};
