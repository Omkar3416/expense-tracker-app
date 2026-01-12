// src/app/api/notifications/sync-topics/route.ts

import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

type Body = {
  token?: string;
};

function logServer(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log("[sync-topics]", ...args);
}

function errServer(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.error("[sync-topics]", ...args);
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;

  const parts = h.split(" ");
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;

  return parts[1].trim();
}

async function verifyUser(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new Error("Missing Authorization token.");

  const decoded = await adminAuth.verifyIdToken(token);
  if (!decoded?.uid) throw new Error("Invalid token.");

  return decoded;
}

function isInvalidTokenErrorCode(code: string): boolean {
  const c = code.toLowerCase();
  return (
    c.includes("registration-token-not-registered") ||
    c.includes("invalid-registration-token") ||
    c.includes("invalid-argument") ||
    c.includes("unregistered")
  );
}

function extractErrorCode(errObj: unknown): string {
  if (!errObj || typeof errObj !== "object") return "";
  if (!("code" in errObj)) return "";
  const code = (errObj as { code?: unknown }).code;
  return typeof code === "string" ? code : String(code ?? "");
}

export async function POST(req: Request) {
  try {
    const decoded = await verifyUser(req);

    const body = (await req.json()) as Body;
    const token = typeof body.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json({ error: "token is required." }, { status: 400 });
    }

    const uid = decoded.uid;
    const email = decoded.email ?? null;
    const isAdmin = Boolean(decoded.admin);

    const topics: string[] = [
      "announcements_prod",
      `user_${uid}`,
      ...(isAdmin ? ["announcements_dev"] : []),
    ];

    logServer("Request:", {
      uid,
      email,
      isAdmin,
      topics,
      tokenPreview: token.slice(0, 12) + "...",
      tokenLen: token.length,
    });

    const messaging = getMessaging();

    for (const topic of topics) {
      const resp = await messaging.subscribeToTopic([token], topic);

      logServer("subscribeToTopic resp:", { topic, resp });

      if (resp.failureCount > 0) {
        const errObj = resp.errors?.[0]?.error;
        const msg =
          errObj instanceof Error ? errObj.message : "Failed to subscribe token.";

        const code = extractErrorCode(errObj);

        errServer("❌ subscribeToTopic FAILED:", {
          uid,
          topic,
          tokenPreview: token.slice(0, 12) + "...",
          tokenLen: token.length,
          msg,
          code,
          resp,
        });

        if (code && isInvalidTokenErrorCode(code)) {
          logServer("🧹 Invalid token detected → deleting from Firestore:", token);

          await adminDb
            .collection("users")
            .doc(uid)
            .collection("fcmTokens")
            .doc(token)
            .delete()
            .catch(() => {});
        }

        return NextResponse.json(
          { error: msg, code: "subscribe_failed", topic, resp },
          { status: 400 }
        );
      }
    }

    // ✅ Save token + topics
    const userRef = adminDb.collection("users").doc(uid);

    await userRef.set(
      {
        email,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await userRef.collection("fcmTokens").doc(token).set(
      {
        token,
        platform: "web",
        uid,
        topics,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        lastSyncedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    logServer("✅ Sync success:", { uid, topics });

    return NextResponse.json({ success: true, topics });
  } catch (err: unknown) {
    errServer("❌ Error:", err);

    const msg = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
