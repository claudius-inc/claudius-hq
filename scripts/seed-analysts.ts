import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { analysts } from "../src/db/schema";

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
      await db.insert(analysts).values(analyst);
      console.log(`✓ Added: ${analyst.name} (${analyst.firm})`);
    } catch (err) {
      // Might already exist
      console.log(`⚠ Skipped: ${analyst.name} (might already exist)`);
    }
  }

  console.log("Done!");
  process.exit(0);
}

main();
