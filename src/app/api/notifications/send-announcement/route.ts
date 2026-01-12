// src/app/api/notifications/send-announcement/route.ts

import { NextResponse } from "next/server";
import { adminAuth, adminDb, adminAuth as authAdmin } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

type AnnouncementMode = "dev" | "prod";
type AnnouncementTarget = "all" | "user";

type SendAnnouncementBody = {
  title?: string;
  body?: string;
  mode?: AnnouncementMode;
  target?: AnnouncementTarget;
  targetEmail?: string;
};

function logServer(...args: unknown[]) {
  // ✅ appears in VS Code terminal (npm run dev)
  // eslint-disable-next-line no-console
  console.log("[send-announcement]", ...args);
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

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
  const isAdmin = Boolean(decoded.admin);

  if (!isAdmin) throw new Error("Admin access required.");
  return decoded;
}

async function getUidByEmail(email: string): Promise<string> {
  const record = await authAdmin.getUserByEmail(email);
  return record.uid;
}

async function getUserTokensByUid(uid: string): Promise<string[]> {
  const snap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("fcmTokens")
    .get();

  const tokens: string[] = [];
  snap.forEach((d) => {
    const data = d.data() as { token?: unknown };

    const token =
      typeof data.token === "string" && data.token.trim().length > 0
        ? data.token.trim()
        : d.id;

    if (typeof token === "string" && token.trim().length > 0) {
      tokens.push(token.trim());
    }
  });

  return Array.from(new Set(tokens));
}

/**
 * ✅ DATA-only payload (most reliable for Web Push + Service Worker control)
 */
function buildPayloadData(params: {
  title: string;
  body: string;
  url: string;
  announcementId: string;
  mode: AnnouncementMode;
  target: AnnouncementTarget;
  targetEmail?: string | null;
  targetUid?: string | null;
}): Record<string, string> {
  const {
    title,
    body,
    url,
    announcementId,
    mode,
    target,
    targetEmail,
    targetUid,
  } = params;

  return {
    title,
    body,
    url,
    announcementId,
    mode,
    target,
    targetEmail: targetEmail ?? "",
    targetUid: targetUid ?? "",
  };
}

export async function POST(req: Request) {
  try {
    const decoded = await verifyAdmin(req);

    const body = (await req.json()) as SendAnnouncementBody;

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const messageBody = typeof body.body === "string" ? body.body.trim() : "";

    const mode: AnnouncementMode = body.mode === "prod" ? "prod" : "dev";
    const target: AnnouncementTarget = body.target === "user" ? "user" : "all";

    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }
    if (!messageBody) {
      return NextResponse.json({ error: "Body is required." }, { status: 400 });
    }

    if (mode === "dev" && target === "user") {
      return NextResponse.json(
        { error: "DEV notifications cannot target a specific user." },
        { status: 400 }
      );
    }

    let targetEmail: string | null = null;
    let targetUid: string | null = null;

    if (target === "user") {
      if (typeof body.targetEmail !== "string") {
        return NextResponse.json(
          { error: "Target email is required." },
          { status: 400 }
        );
      }

      const email = normalizeEmail(body.targetEmail);
      if (!email || !isValidEmail(email)) {
        return NextResponse.json(
          { error: "Invalid target email format." },
          { status: 400 }
        );
      }

      targetEmail = email;

      try {
        targetUid = await getUidByEmail(targetEmail);
      } catch {
        return NextResponse.json(
          { error: `No user found in Firebase Auth for ${targetEmail}` },
          { status: 404 }
        );
      }
    }

    // ✅ 1) Write history
    const docRef = await adminDb.collection("announcements").add({
      title,
      body: messageBody,
      mode,
      target,
      targetEmail: targetEmail ?? null,
      targetUid: targetUid ?? null,
      status: "sent",
      createdBy: decoded.email ?? "unknown",
      createdAt: FieldValue.serverTimestamp(),
      sentAt: FieldValue.serverTimestamp(),
    });

    const url = "/dashboard";

    const payloadData = buildPayloadData({
      title,
      body: messageBody,
      url,
      announcementId: docRef.id,
      mode,
      target,
      targetEmail,
      targetUid,
    });

    logServer("✅ SEND REQUEST:", {
      mode,
      target,
      title,
      bodyLen: messageBody.length,
      announcementId: docRef.id,
      url,
      targetEmail,
      targetUid,
      createdBy: decoded.email ?? null,
    });

    logServer("✅ DATA PAYLOAD:", payloadData);

    // ✅ 2) Send FCM (DATA-only)
    const messaging = getMessaging();

    if (mode === "dev") {
      const id = await messaging.send({
        topic: "announcements_dev",
        data: payloadData,
      });

      logServer("✅ FCM SENT TO DEV TOPIC:", { messageId: id });
      return NextResponse.json({ success: true, id: docRef.id });
    }

    if (target === "all") {
      const id = await messaging.send({
        topic: "announcements_prod",
        data: payloadData,
      });

      logServer("✅ FCM SENT TO PROD TOPIC:", { messageId: id });
      return NextResponse.json({ success: true, id: docRef.id });
    }

    // ✅ PROD user
    const tokens = await getUserTokensByUid(targetUid!);

    logServer("✅ User tokens loaded:", {
      uid: targetUid,
      tokenCount: tokens.length,
    });

    if (tokens.length === 0) {
      await adminDb.collection("announcements").doc(docRef.id).update({
        status: "sent",
        note: `No tokens found for UID ${targetUid} (email ${targetEmail})`,
        updatedAt: FieldValue.serverTimestamp(),
      });

      logServer("❌ No tokens found → not sending.");
      return NextResponse.json(
        { error: `No FCM tokens found for ${targetEmail}` },
        { status: 404 }
      );
    }

    const res = await messaging.sendEachForMulticast({
      tokens,
      data: payloadData,
    });

    logServer("✅ MULTICAST SEND RESULT:", res);

    // cleanup invalid tokens
    const invalidTokens: string[] = [];

    res.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.code ?? "";
        if (
          code.includes("registration-token-not-registered") ||
          code.includes("invalid-registration-token")
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      logServer("🧹 Cleaning invalid tokens:", invalidTokens.length);

      const batch = adminDb.batch();
      for (const t of invalidTokens) {
        const ref = adminDb
          .collection("users")
          .doc(targetUid!)
          .collection("fcmTokens")
          .doc(t);

        batch.delete(ref);
      }
      await batch.commit();
    }

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (err: unknown) {
    logServer("❌ ERROR:", err);
    const msg = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
