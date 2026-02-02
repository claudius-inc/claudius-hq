declare namespace NodeJS {
  interface ProcessEnv {
    TURSO_DATABASE_URL: string;
    TURSO_AUTH_TOKEN: string;
    HQ_PASSWORD: string;
    HQ_API_KEY: string;
    GITHUB_TOKEN?: string;
    SMTP_HOST?: string;
    SMTP_PORT?: string;
    SMTP_USER?: string;
    SMTP_PASS?: string;
    SMTP_FROM?: string;
    NODE_ENV: "development" | "production" | "test";
  }

  interface Process {
    env: ProcessEnv;
  }
}
