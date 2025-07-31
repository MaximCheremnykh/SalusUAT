export {};

declare namespace NodeJS {
  interface ProcessEnv {
    SF_USER: string;
    SF_PWD: string;
    SF_LOGIN_URL: string;
  }
}

