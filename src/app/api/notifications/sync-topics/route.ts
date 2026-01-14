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

function safeJsonParseBody(raw: string): Body | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed as Body;
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const decoded = await verifyUser(req);

    // ✅ SAFETY: avoid req.json() crash when body is empty or invalid JSON
    // Note: Request body can only be read ONCE, so we use req.text() here.
    const rawBody = await req.text();
    const body = safeJsonParseBody(rawBody);

    if (!body) {
      errServer("❌ Invalid/empty JSON body", {
        contentType: req.headers.get("content-type"),
        rawLen: rawBody.length,
      });

      return NextResponse.json(
        { error: "Invalid JSON body. Send { token: string }." },
        { status: 400 }
      );
    }

    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return NextResponse.json({ error: "token is required." }, { status: 400 });
    }

    const uid = decoded.uid;

    // ✅ email is stored only as metadata field (NOT used as doc id)
    const email: string | null =
      typeof decoded.email === "string" ? decoded.email : null;

    // ✅ custom claim "admin" (boolean) if present
    const isAdmin = (decoded as { admin?: unknown }).admin === true;

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

        // If token is invalid, clean it up from Firestore
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

    // ✅ Save token + topics (Firestore user document key remains UID)
    const userRef = adminDb.collection("users").doc(uid);
    const tokenRef = userRef.collection("fcmTokens").doc(token);

    await userRef.set(
      {
        email,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // ✅ Keep createdAt stable (set only once)
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(tokenRef);

      if (!snap.exists) {
        tx.set(
          tokenRef,
          {
            token,
            platform: "web",
            uid,
            topics,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            lastSyncedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return;
      }

      tx.set(
        tokenRef,
        {
          token,
          platform: "web",
          uid,
          topics,
          updatedAt: FieldValue.serverTimestamp(),
          lastSyncedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    logServer("✅ Sync success:", { uid, topics });
    return NextResponse.json({ success: true, topics });
  } catch (err: unknown) {
    errServer("❌ Error:", err);

    const msg = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
