import { NextRequest, NextResponse } from "next/server";
import { db, stockAlerts } from "@/db";
import { eq } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/alerts/[id] — Get single alert
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const alertId = parseInt(id, 10);

    if (isNaN(alertId)) {
      return NextResponse.json({ error: "Invalid alert ID" }, { status: 400 });
    }

    const [alert] = await db
      .select()
      .from(stockAlerts)
      .where(eq(stockAlerts.id, alertId));

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    return NextResponse.json({ alert });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/alerts/[id] — Update alert
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const alertId = parseInt(id, 10);

    if (isNaN(alertId)) {
      return NextResponse.json({ error: "Invalid alert ID" }, { status: 400 });
    }

    const body = await req.json();
    const {
      accumulate_low,
      accumulate_high,
      strong_buy_low,
      strong_buy_high,
      status,
      notes,
    } = body;

    // Build update object
    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (accumulate_low !== undefined) updates.accumulateLow = accumulate_low;
    if (accumulate_high !== undefined) updates.accumulateHigh = accumulate_high;
    if (strong_buy_low !== undefined) updates.strongBuyLow = strong_buy_low;
    if (strong_buy_high !== undefined) updates.strongBuyHigh = strong_buy_high;
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    const [updated] = await db
      .update(stockAlerts)
      .set(updates)
      .where(eq(stockAlerts.id, alertId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    return NextResponse.json({ alert: updated });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/alerts/[id] — Delete alert
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const alertId = parseInt(id, 10);

    if (isNaN(alertId)) {
      return NextResponse.json({ error: "Invalid alert ID" }, { status: 400 });
    }

    const [deleted] = await db
      .delete(stockAlerts)
      .where(eq(stockAlerts.id, alertId))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
