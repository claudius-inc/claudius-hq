/**
 * Research Jobs Service
 * Handles research job creation, status, and updates
 */
import { db, researchJobs } from "@/db";
import { eq, desc } from "drizzle-orm";
import type { ResearchJob, NewResearchJob, ResearchJobStatus } from "@/db/schema";

// ============================================================================
// Research Jobs
// ============================================================================

export async function listResearchJobs(status?: string, limit = 50): Promise<ResearchJob[]> {
  if (status) {
    return db
      .select()
      .from(researchJobs)
      .where(eq(researchJobs.status, status))
      .orderBy(desc(researchJobs.createdAt))
      .limit(limit);
  }
  return db
    .select()
    .from(researchJobs)
    .orderBy(desc(researchJobs.createdAt))
    .limit(limit);
}

export async function getResearchJob(jobId: string): Promise<ResearchJob | null> {
  const [job] = await db.select().from(researchJobs).where(eq(researchJobs.id, jobId));
  return job || null;
}

export async function getResearchJobByTicker(ticker: string): Promise<ResearchJob | null> {
  const [job] = await db
    .select()
    .from(researchJobs)
    .where(eq(researchJobs.ticker, ticker.toUpperCase()))
    .orderBy(desc(researchJobs.createdAt))
    .limit(1);
  return job || null;
}

export async function getPendingJobForTicker(
  ticker: string
): Promise<ResearchJob | null> {
  const cleanTicker = ticker.toUpperCase();
  const jobs = await db
    .select()
    .from(researchJobs)
    .where(eq(researchJobs.ticker, cleanTicker))
    .limit(10);

  // Find any pending or processing job
  const activeJob = jobs.find(
    (j) => j.status === "pending" || j.status === "processing"
  );
  return activeJob || null;
}

export interface CreateResearchJobInput {
  ticker: string;
}

export interface CreateResearchJobResult {
  job: ResearchJob;
  isNew: boolean;
}

export async function createResearchJob(
  input: CreateResearchJobInput
): Promise<CreateResearchJobResult> {
  const cleanTicker = input.ticker.toUpperCase().trim();

  // Check if there's already a pending/processing job
  const existing = await getPendingJobForTicker(cleanTicker);
  if (existing) {
    return { job: existing, isNew: false };
  }

  // Generate a job ID and create the job record
  const jobId = `research-${cleanTicker}-${Date.now()}`;

  const [newJob] = await db
    .insert(researchJobs)
    .values({
      id: jobId,
      ticker: cleanTicker,
      status: "pending",
      progress: 0,
    })
    .returning();

  return { job: newJob, isNew: true };
}

export interface UpdateResearchJobInput {
  status?: ResearchJobStatus;
  progress?: number;
  errorMessage?: string | null;
  reportId?: number | null;
}

export async function updateResearchJob(
  jobId: string,
  input: UpdateResearchJobInput
): Promise<boolean> {
  const updateData: Partial<typeof researchJobs.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (input.status !== undefined) {
    updateData.status = input.status;
  }
  if (input.progress !== undefined) {
    updateData.progress = input.progress;
  }
  if (input.errorMessage !== undefined) {
    updateData.errorMessage = input.errorMessage;
  }
  if (input.reportId !== undefined) {
    updateData.reportId = input.reportId;
  }

  await db.update(researchJobs).set(updateData).where(eq(researchJobs.id, jobId));
  return true;
}

export async function deleteResearchJob(jobId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: researchJobs.id })
    .from(researchJobs)
    .where(eq(researchJobs.id, jobId));

  if (!existing) {
    return false;
  }

  await db.delete(researchJobs).where(eq(researchJobs.id, jobId));
  return true;
}
