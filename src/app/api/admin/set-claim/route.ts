import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

function getIp(req: Request) {
  // Works on Vercel / proxies
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  return real ?? "unknown";
}

async function logSecurityEvent(payload: {
  ok: boolean;
  reason: string;
  uid?: string | null;
  ip?: string;
  ua?: string;
}) {
  try {
    if (!adminDb) return;

    await adminDb.collection("securityLogs").add({
      type: "admin_unlock_attempt",
      ok: payload.ok,
      reason: payload.reason,
      uid: payload.uid ?? null,
      ip: payload.ip ?? "unknown",
      userAgent: payload.ua ?? "unknown",
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    // ✅ Never crash the API if logging fails
  }
}

export async function POST(req: Request) {
  const ip = getIp(req);
  const ua = req.headers.get("user-agent") ?? "unknown";

  try {
    const body = (await req.json()) as { uid?: string; secret?: string };

    // ✅ secret check
    if (!body.secret || body.secret !== process.env.ADMIN_SETUP_SECRET) {
      await logSecurityEvent({
        ok: false,
        reason: "unauthorized_secret",
        uid: body.uid ?? null,
        ip,
        ua,
      });

      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!body.uid) {
      await logSecurityEvent({
        ok: false,
        reason: "uid_missing",
        uid: null,
        ip,
        ua,
      });

      return NextResponse.json({ error: "UID missing" }, { status: 400 });
    }

    // ✅ MAKE ADMIN
    await adminAuth.setCustomUserClaims(body.uid, { admin: true });

    await logSecurityEvent({
      ok: true,
      reason: "admin_claim_set",
      uid: body.uid,
      ip,
      ua,
    });

    return NextResponse.json({ success: true, uid: body.uid });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Something went wrong";

    await logSecurityEvent({
      ok: false,
      reason: `server_error:${msg}`,
      uid: null,
      ip,
      ua,
    });

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
