import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getScanSnapshot } from "@/lib/scan-presentation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const snapshot = await getScanSnapshot(
    prisma,
    request.nextUrl.searchParams.get("batchId"),
  );
  return NextResponse.json({ snapshot });
}
