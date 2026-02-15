import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

const client = createClient({
  url: "libsql://claudius-hq-manapixels.aws-ap-northeast-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Njk5MDQxMjMsImlkIjoiZGQ1ZTcxODMtODM0Mi00NmZhLTk5YTItN2U3OWRmZjJjYjM0IiwicmlkIjoiMGEyZTM1YmYtMDJiZi00ZmYzLTkzNDktYzk0OTgzMDI1OTkzIn0.ztrDyGsVoUGyoBzlng_EbAIAKF_oYuW76pZf8uKOykjSXr5mm7qPHMI0-vGRSmvPR67aDPoomzX4__XRsdBCDA",
});

const seedAnalysts = [
  {
    name: "Mark Lipacis",
    firm: "Jefferies",
    specialty: "Semiconductors",
    successRate: 0.85,
    notes: "#1 ranked semiconductor analyst over 10 years. Exceptional track record on NVDA, AMD.",
  },
  {
    name: "Gerard Cassidy",
    firm: "RBC Capital",
    specialty: "Financials",
    successRate: 0.88,
    notes: "88% success rate on financial sector calls. Known for accurate bank stock predictions.",
  },
  {
    name: "Needham Research",
    firm: "Needham & Company",
    specialty: "Small/Mid-cap Tech",
    successRate: 0.75,
    notes: "Firm-level tracking. Strong coverage of emerging tech companies before they become mainstream.",
  },
  {
    name: "Ruben Roy",
    firm: "Stifel Nicolaus",
    specialty: "Technology",
    successRate: 0.82,
    notes: "Consistently high accuracy on tech sector. Excellent on enterprise software and cloud.",
  },
  {
    name: "Richard Shannon",
    firm: "Craig-Hallum",
    specialty: "Semiconductors",
    successRate: 0.78,
    notes: "Strong coverage of semiconductor equipment and chip makers. Good contrarian calls.",
  },
];

async function main() {
  console.log("Seeding analysts...");

  for (const analyst of seedAnalysts) {
    try {
      await client.execute({
        sql: `INSERT INTO analysts (name, firm, specialty, success_rate, notes) VALUES (?, ?, ?, ?, ?)`,
        args: [analyst.name, analyst.firm, analyst.specialty, analyst.successRate, analyst.notes],
      });
      console.log(`✓ Added: ${analyst.name} (${analyst.firm})`);
    } catch (err) {
      console.log(`⚠ Error: ${analyst.name} - ${err.message}`);
    }
  }

  console.log("Done!");
  process.exit(0);
}

main();
