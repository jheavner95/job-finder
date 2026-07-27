import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST() {
  const active = await prisma.discoveryBatch.findFirst({
    where: { status: "Running" },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (!active) return NextResponse.json({ status: "idle" }, { status: 409 });
  await prisma.discoveryBatch.update({
    where: { id: active.id },
    data: { cancelRequested: true },
  });
  return NextResponse.json({ status: "cancelling", batchId: active.id });
}
