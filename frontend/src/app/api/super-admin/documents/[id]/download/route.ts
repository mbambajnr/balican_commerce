import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-config";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const backendRes = await fetch(`${BACKEND_URL}/super-admin/documents/${id}/download`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });

  if (!backendRes.ok) {
    const error = await backendRes.json().catch(() => ({ error: "Download failed" }));
    return NextResponse.json(error, { status: backendRes.status });
  }

  const contentType = backendRes.headers.get("content-type") || "application/octet-stream";
  const disposition = backendRes.headers.get("content-disposition") || "inline";
  const buffer = await backendRes.arrayBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Content-Length": buffer.byteLength.toString(),
    },
  });
}
