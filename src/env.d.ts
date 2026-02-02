declare namespace NodeJS {
  interface ProcessEnv {
    TURSO_DATABASE_URL: string;
    TURSO_AUTH_TOKEN: string;
    HQ_PASSWORD: string;
    HQ_API_KEY: string;
    GITHUB_TOKEN?: string;
    NODE_ENV: "development" | "production" | "test";
  }

  interface Process {
    env: ProcessEnv;
  }
}
