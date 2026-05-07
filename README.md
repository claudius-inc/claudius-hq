This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Stock Scanner

The stock scanner runs **automatically every 6 hours** via GitHub Actions and stores pre-computed results in the Turso database. The scanner page at `/markets/scanner` displays these cached results.

### GitHub Actions Scanner

The scanner runs on a schedule and can also be triggered manually:

- **Scheduled**: Every 6 hours (`0 */6 * * *`)
- **Manual**: Via GitHub Actions → "Run workflow"

#### Setting Up GitHub Secrets

To enable the GitHub Actions scanner, add these secrets to your repository:

1. Go to **Settings → Secrets and variables → Actions**
2. Click **New repository secret** and add:

| Secret Name          | Description                                         |
| -------------------- | --------------------------------------------------- |
| `TURSO_DATABASE_URL` | Your Turso database URL (e.g., `libsql://...`)      |
| `TURSO_AUTH_TOKEN`   | Your Turso authentication token                     |

#### Manual Trigger

1. Go to **Actions** tab in GitHub
2. Select **Stock Scanner** workflow
3. Click **Run workflow**
4. Optionally specify markets (default: `US,SGX`)

#### Supported Markets

The scanner can target any of the following markets. Pass them as a
comma-separated list via `SCAN_MARKETS` or the workflow input.

| Code  | Exchange                    | Notes                                                            |
| ----- | --------------------------- | ---------------------------------------------------------------- |
| `US`  | NYSE / NASDAQ / AMEX        | Plain ticker (e.g. `AAPL`).                                       |
| `SGX` | Singapore Exchange          | `.SI` suffix (e.g. `D05.SI`).                                     |
| `HK`  | Hong Kong Stock Exchange    | 4-digit code with `.HK` suffix (e.g. `0700.HK`).                  |
| `JP`  | Tokyo Stock Exchange        | `.T` suffix (e.g. `7203.T`).                                      |
| `CN`  | Shanghai / Shenzhen         | `.SS` (Shanghai) or `.SZ` (Shenzhen) suffix.                      |
| `LSE` | London Stock Exchange       | `.L` suffix (e.g. `BARC.L`). Yahoo quotes in pence (`GBp`).       |

### Legacy CLI Scanner

The original CLI scanner is still available for local testing:

```bash
node scripts/unified-scanner.js              # Console output
node scripts/unified-scanner.js --json       # JSON to stdout
node scripts/unified-scanner.js --upload     # Upload to HQ
node scripts/unified-scanner.js --save       # Save to output/
node scripts/unified-scanner.js --limit 50   # Show top N
```

### Environment Variables

| Variable               | Required         | Description                                          |
| ---------------------- | ---------------- | ---------------------------------------------------- |
| `TURSO_DATABASE_URL`   | Yes              | Turso database URL                                   |
| `TURSO_AUTH_TOKEN`     | Yes              | Turso authentication token                           |
| `HQ_API_URL`           | No               | HQ API base URL (default: `https://claudiusinc.com`) |
| `HQ_API_KEY`           | For `--upload`   | API key for authenticating with HQ                   |
| `SCAN_MARKETS`         | No               | Comma-separated markets (default: `US,SGX`)          |

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
