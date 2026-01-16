// src/app/api/admin/announcements/[id]/route.ts

import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;

  const parts = h.split(" ");
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;

  return parts[1].trim();
}

async function verifyAdmin(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new Error("Missing Authorization token.");

  const decoded = await adminAuth.verifyIdToken(token);
  if (!decoded.admin) throw new Error("Admin access required.");

  return decoded;
}

type AnnouncementDoc = {
  status?: "sent" | "deleted" | string;
};

type RouteContext = {
  params: Promise<{ id?: string }>; // ✅ Next.js expects params as Promise in newer versions
};

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    await verifyAdmin(req);

    const params = await ctx.params; // ✅ FIX: unwrap params
    const id = typeof params.id === "string" ? params.id.trim() : "";

    if (!id) {
      return NextResponse.json(
        { error: "Missing announcement id." },
        { status: 400 }
      );
    }

    const ref = adminDb.collection("announcements").doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Announcement not found." },
        { status: 404 }
      );
    }

    // ✅ Double safety: allow permanent delete ONLY after soft delete
    const data = snap.data() as AnnouncementDoc;
    const status = typeof data.status === "string" ? data.status : "sent";

    if (status !== "deleted") {
      return NextResponse.json(
        {
          error:
            "Permanent delete is allowed only after soft delete (status must be 'deleted').",
        },
        { status: 400 }
      );
    }

    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
