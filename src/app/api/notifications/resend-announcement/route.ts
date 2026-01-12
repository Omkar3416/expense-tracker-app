// src/app/api/notifications/resend-announcement/route.ts

import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

type ResendBody = {
  announcementId?: string;
};

function logServer(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log("[resend-announcement]", ...args);
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
  if (!decoded.admin) throw new Error("Admin access required.");

  return decoded;
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

function buildPayloadData(params: {
  title: string;
  body: string;
  url: string;
  announcementId: string;
  mode: "dev" | "prod";
  target: "all" | "user";
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
    await verifyAdmin(req);

    const body = (await req.json()) as ResendBody;

    const id =
      typeof body.announcementId === "string" ? body.announcementId.trim() : "";

    if (!id) {
      return NextResponse.json(
        { error: "announcementId is required." },
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

    const data = snap.data() as {
      title?: string;
      body?: string;
      mode?: "dev" | "prod";
      target?: "all" | "user";
      targetEmail?: string | null;
      targetUid?: string | null;
      status?: "sent" | "deleted";
    };

    if (data.status === "deleted") {
      return NextResponse.json(
        { error: "Cannot resend a deleted announcement." },
        { status: 400 }
      );
    }

    const title = typeof data.title === "string" ? data.title.trim() : "";
    const messageBody = typeof data.body === "string" ? data.body.trim() : "";

    if (!title || !messageBody) {
      return NextResponse.json(
        { error: "Announcement missing title/body." },
        { status: 400 }
      );
    }

    const mode: "dev" | "prod" = data.mode === "prod" ? "prod" : "dev";
    const target: "all" | "user" = data.target === "user" ? "user" : "all";

    const targetEmail =
      typeof data.targetEmail === "string" ? data.targetEmail : null;

    const targetUid =
      typeof data.targetUid === "string" ? data.targetUid : null;

    const url = "/dashboard";

    const payloadData = buildPayloadData({
      title,
      body: messageBody,
      url,
      announcementId: id,
      mode,
      target,
      targetEmail,
      targetUid,
    });

    logServer("✅ RESEND REQUEST:", { id, mode, target, targetEmail, targetUid });
    logServer("✅ DATA PAYLOAD:", payloadData);

    const messaging = getMessaging();

    if (mode === "dev") {
      const mid = await messaging.send({
        topic: "announcements_dev",
        data: payloadData,
      });
      logServer("✅ SENT TO DEV TOPIC:", { messageId: mid });
    } else {
      if (target === "all") {
        const mid = await messaging.send({
          topic: "announcements_prod",
          data: payloadData,
        });
        logServer("✅ SENT TO PROD TOPIC:", { messageId: mid });
      } else {
        if (!targetUid) {
          return NextResponse.json(
            { error: "Missing targetUid for user announcement." },
            { status: 400 }
          );
        }

        const tokens = await getUserTokensByUid(targetUid);

        logServer("✅ User tokens loaded:", {
          uid: targetUid,
          tokenCount: tokens.length,
        });

        if (tokens.length === 0) {
          return NextResponse.json(
            {
              error: `No tokens found for user (uid=${targetUid}, email=${
                targetEmail ?? "unknown"
              })`,
            },
            { status: 404 }
          );
        }

        const res = await messaging.sendEachForMulticast({
          tokens,
          data: payloadData,
        });

        logServer("✅ MULTICAST SEND RESULT:", res);
      }
    }

    await ref.update({
      resentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    logServer("❌ ERROR:", err);
    const msg = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
