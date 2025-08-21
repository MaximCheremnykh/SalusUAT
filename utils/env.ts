import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v.replace(/\/+$/, ''); // strip trailing slash
}

export const ENV = {
  LOGIN: req('SF_LOGIN_URL'),
  HOME: req('SF_HOME_URL'),
  DASHBOARD: req('SF_DASHBOARD_URL'),
  APP_TITLE: req('APP_TITLE'),
  SETUP: req('SF_SETUP_URL'),
  QAIS_ID: req('SF_QAIS_USER_ID'),
};
