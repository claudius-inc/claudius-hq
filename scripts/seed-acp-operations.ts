/**
 * Seed initial ACP Operations data
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function seed() {
  console.log("Seeding ACP Operations data...\n");

  // Update initial state
  console.log("Setting initial state...");
  await client.execute({
    sql: `UPDATE acp_state SET 
      current_pillar = ?,
      target_jobs = ?,
      target_revenue = ?,
      target_rank = ?,
      server_running = ?,
      updated_at = datetime('now')
      WHERE id = 1`,
    args: ["quality", 100, 50.0, 50, 1],
  });
  console.log("  ✓ State initialized\n");

  // Seed strategy parameters
  console.log("Seeding strategy parameters...");
  const strategyParams = [
    // Pricing strategy
    { id: "pricing.default_multiplier", category: "pricing", key: "default_multiplier", value: "1.0", notes: "Base pricing multiplier" },
    { id: "pricing.min_price", category: "pricing", key: "min_price", value: "0.001", notes: "Minimum price in USDC" },
    { id: "pricing.max_price", category: "pricing", key: "max_price", value: "1.0", notes: "Maximum price in USDC" },
    
    // Offering strategy
    { id: "offerings.max_count", category: "offerings", key: "max_count", value: "20", notes: "Hard limit on total offerings" },
    { id: "offerings.min_jobs_before_replace", category: "offerings", key: "min_jobs_before_replace", value: "10", notes: "Minimum jobs before evaluating for replacement" },
    
    // Marketing strategy
    { id: "marketing.tweets_per_day", category: "marketing", key: "tweets_per_day", value: "2", notes: "Target marketing tweets per day" },
    { id: "marketing.discord_posts_per_week", category: "marketing", key: "discord_posts_per_week", value: "3", notes: "Target Discord posts per week" },
    
    // Goals
    { id: "goals.epoch_job_target", category: "goals", key: "epoch_job_target", value: "100", notes: "Jobs to complete per epoch" },
    { id: "goals.epoch_revenue_target", category: "goals", key: "epoch_revenue_target", value: "50", notes: "Revenue target per epoch in USDC" },
    { id: "goals.top_50_rank", category: "goals", key: "top_50_rank", value: "true", notes: "Target: stay in top 50" },
    
    // Experiments
    { id: "experiments.price_test_duration_days", category: "experiments", key: "price_test_duration_days", value: "7", notes: "Duration for price A/B tests" },
    { id: "experiments.min_sample_size", category: "experiments", key: "min_sample_size", value: "20", notes: "Minimum jobs before concluding experiment" },
  ];

  for (const p of strategyParams) {
    await client.execute({
      sql: `INSERT OR REPLACE INTO acp_strategy (id, category, key, value, notes, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      args: [p.id, p.category, p.key, p.value, p.notes],
    });
  }
  console.log(`  ✓ ${strategyParams.length} strategy parameters seeded\n`);

  // Create initial tasks
  console.log("Creating initial tasks...");
  const initialTasks = [
    { pillar: "quality", priority: 80, title: "Review failed jobs from last 24h", description: "Check job failures and fix any bugs" },
    { pillar: "quality", priority: 70, title: "Monitor response latency", description: "Ensure offerings respond within acceptable time" },
    { pillar: "build", priority: 60, title: "Research new offering categories", description: "Identify gaps in marketplace that we can fill" },
    { pillar: "experiment", priority: 50, title: "Set up price experiment for top offering", description: "Test +10% price change on best performer" },
    { pillar: "replace", priority: 40, title: "Identify lowest performing offerings", description: "Find candidates for replacement based on jobs/revenue" },
  ];

  for (const t of initialTasks) {
    await client.execute({
      sql: `INSERT INTO acp_tasks (pillar, priority, title, description, status, created_at)
            VALUES (?, ?, ?, ?, 'pending', datetime('now'))`,
      args: [t.pillar, t.priority, t.title, t.description],
    });
  }
  console.log(`  ✓ ${initialTasks.length} initial tasks created\n`);

  // Log initial decision
  console.log("Logging initial decision...");
  await client.execute({
    sql: `INSERT INTO acp_decisions (decision_type, reasoning, created_at)
          VALUES (?, ?, datetime('now'))`,
    args: ["strategy_shift", "Initialized ACP Operations control plane. Starting with quality pillar focus."],
  });
  console.log("  ✓ Initial decision logged\n");

  console.log("✅ Seeding complete!");

  // Show summary
  const state = await client.execute("SELECT * FROM acp_state WHERE id = 1");
  const taskCount = await client.execute("SELECT COUNT(*) as count FROM acp_tasks");
  const strategyCount = await client.execute("SELECT COUNT(*) as count FROM acp_strategy");

  console.log("\n📊 Summary:");
  console.log(`  Current pillar: ${state.rows[0].current_pillar}`);
  console.log(`  Target jobs: ${state.rows[0].target_jobs}`);
  console.log(`  Target revenue: ${state.rows[0].target_revenue}`);
  console.log(`  Pending tasks: ${taskCount.rows[0].count}`);
  console.log(`  Strategy params: ${strategyCount.rows[0].count}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
