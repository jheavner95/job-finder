import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DiscoveryScheduler } from "@/lib/scheduling/discovery-scheduler";

export async function POST(request: NextRequest) {
  const active = await prisma.discoveryBatch.findFirst({
    where: { status: "Running" },
    select: { id: true },
  });
  if (active) {
    return NextResponse.json({ status: "already-running", batchId: active.id }, { status: 409 });
  }
  const body = await request.json().catch(() => ({})) as { connectorIds?: unknown };
  const requested = Array.isArray(body.connectorIds)
    ? body.connectorIds.filter((id): id is string => typeof id === "string")
    : [];
  const enabled = await prisma.companyConnector.findMany({
    where: {
      enabled: true,
      id: requested.length ? { in: requested } : undefined,
    },
    select: { id: true },
  });
  const result = await new DiscoveryScheduler(prisma).run({
    trigger: "manual",
    connectorIds: enabled.map((connector) => connector.id),
  });
  return NextResponse.json(result);
}
