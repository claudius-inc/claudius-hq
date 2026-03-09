/**
 * Test ACP Operations endpoints directly against the database
 * (Tests the business logic, not the HTTP layer)
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function test() {
  console.log("🧪 Testing ACP Operations...\n");

  // Test 1: State
  console.log("1️⃣ Testing acp_state...");
  const state = await client.execute("SELECT * FROM acp_state WHERE id = 1");
  if (state.rows.length === 0) throw new Error("No state found");
  console.log(`   ✓ State exists: pillar=${state.rows[0].current_pillar}`);

  // Test 2: Tasks
  console.log("\n2️⃣ Testing acp_tasks...");
  const tasks = await client.execute("SELECT * FROM acp_tasks WHERE status = 'pending' ORDER BY priority DESC LIMIT 5");
  console.log(`   ✓ Found ${tasks.rows.length} pending tasks`);
  if (tasks.rows.length > 0) {
    console.log(`   ✓ Top task: [${tasks.rows[0].pillar}] ${tasks.rows[0].title} (priority: ${tasks.rows[0].priority})`);
  }

  // Test 3: Create a task
  console.log("\n3️⃣ Testing task creation...");
  const newTask = await client.execute({
    sql: `INSERT INTO acp_tasks (pillar, priority, title, description, status, created_at)
          VALUES (?, ?, ?, ?, 'pending', datetime('now')) RETURNING *`,
    args: ["build", 75, "Test task - can be deleted", "Created by test script"],
  });
  console.log(`   ✓ Created task id=${newTask.rows[0].id}`);

  // Test 4: Update task
  console.log("\n4️⃣ Testing task update...");
  await client.execute({
    sql: `UPDATE acp_tasks SET status = 'done', completed_at = datetime('now'), result = 'Test passed' WHERE id = ?`,
    args: [newTask.rows[0].id],
  });
  const updated = await client.execute({
    sql: "SELECT * FROM acp_tasks WHERE id = ?",
    args: [newTask.rows[0].id],
  });
  console.log(`   ✓ Updated task status to: ${updated.rows[0].status}`);

  // Test 5: Decisions
  console.log("\n5️⃣ Testing acp_decisions...");
  const decisions = await client.execute("SELECT * FROM acp_decisions ORDER BY created_at DESC LIMIT 5");
  console.log(`   ✓ Found ${decisions.rows.length} decisions`);

  // Test 6: Strategy
  console.log("\n6️⃣ Testing acp_strategy...");
  const strategy = await client.execute("SELECT * FROM acp_strategy ORDER BY category, key");
  console.log(`   ✓ Found ${strategy.rows.length} strategy params`);
  
  // Group by category
  const categories: Record<string, number> = {};
  for (const row of strategy.rows) {
    const cat = String(row.category ?? "uncategorized");
    categories[cat] = (categories[cat] ?? 0) + 1;
  }
  console.log(`   ✓ Categories: ${Object.entries(categories).map(([k, v]) => `${k}(${v})`).join(", ")}`);

  // Test 7: Marketing
  console.log("\n7️⃣ Testing acp_marketing...");
  const marketing = await client.execute("SELECT COUNT(*) as count FROM acp_marketing");
  console.log(`   ✓ Marketing campaigns: ${marketing.rows[0].count}`);

  // Test 8: State update
  console.log("\n8️⃣ Testing state update...");
  await client.execute({
    sql: `UPDATE acp_state SET last_heartbeat = datetime('now'), updated_at = datetime('now') WHERE id = 1`,
    args: [],
  });
  const newState = await client.execute("SELECT last_heartbeat, updated_at FROM acp_state WHERE id = 1");
  console.log(`   ✓ Updated heartbeat: ${newState.rows[0].last_heartbeat}`);

  // Cleanup test task
  console.log("\n🧹 Cleaning up test data...");
  await client.execute({
    sql: "DELETE FROM acp_tasks WHERE id = ?",
    args: [newTask.rows[0].id],
  });
  console.log("   ✓ Deleted test task");

  console.log("\n✅ All tests passed!");
}

test()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
  });
