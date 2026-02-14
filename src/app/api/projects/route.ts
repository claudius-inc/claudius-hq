import { NextRequest, NextResponse } from "next/server";
import { db, projects } from "@/db";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  try {
    const result = await db.select().from(projects).orderBy(desc(projects.updatedAt));
    return NextResponse.json({ projects: result });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      name,
      description,
      status,
      phase,
      repo_url,
      deploy_url,
      test_count,
      build_status,
      last_deploy_time,
      target_audience,
      action_plan,
      plan_tech,
      plan_distribution,
    } = body;

    if (id) {
      // Update existing
      const updateData: Partial<typeof projects.$inferInsert> = {
        updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      };

      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (status !== undefined) updateData.status = status;
      if (phase !== undefined) updateData.phase = phase;
      if (repo_url !== undefined) updateData.repoUrl = repo_url;
      if (deploy_url !== undefined) updateData.deployUrl = deploy_url;
      if (test_count !== undefined) updateData.testCount = test_count;
      if (build_status !== undefined) updateData.buildStatus = build_status;
      if (last_deploy_time !== undefined) updateData.lastDeployTime = last_deploy_time;
      if (target_audience !== undefined) updateData.targetAudience = target_audience;
      if (action_plan !== undefined) updateData.actionPlan = action_plan;
      if (plan_tech !== undefined) updateData.planTech = plan_tech;
      if (plan_distribution !== undefined) updateData.planDistribution = plan_distribution;

      await db.update(projects).set(updateData).where(eq(projects.id, id));

      const [updatedProject] = await db.select().from(projects).where(eq(projects.id, id));
      return NextResponse.json({ project: updatedProject });
    } else {
      // Create new
      const [newProject] = await db
        .insert(projects)
        .values({
          name: name || "",
          description: description || "",
          status: status || "backlog",
          phase: phase || "build",
          repoUrl: repo_url || "",
          deployUrl: deploy_url || "",
          testCount: test_count || 0,
          buildStatus: build_status || "unknown",
          lastDeployTime: last_deploy_time || "",
          targetAudience: target_audience || "",
          actionPlan: action_plan || "",
          planTech: plan_tech || "",
          planDistribution: plan_distribution || "",
        })
        .returning();

      return NextResponse.json({ project: newProject }, { status: 201 });
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
