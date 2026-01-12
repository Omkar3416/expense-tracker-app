// src/app/api/notifications/subscribe-user-topic/route.ts

import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

type Body = {
  token?: string;
  uid?: string;
};

function logServer(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log("[subscribe-user-topic]", ...args);
}

function errServer(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.error("[subscribe-user-topic]", ...args);
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

  return decoded; // { uid, email, admin?, ... }
}

export async function POST(req: Request) {
  try {
    const decoded = await verifyUser(req);

    const body = (await req.json()) as Body;

    const token = typeof body.token === "string" ? body.token.trim() : "";
    const requestedUid = typeof body.uid === "string" ? body.uid.trim() : "";

    if (!token) {
      return NextResponse.json({ error: "token is required." }, { status: 400 });
    }

    if (!requestedUid) {
      return NextResponse.json({ error: "uid is required." }, { status: 400 });
    }

    // ✅ SECURITY: only allow user to subscribe to their own topic
    if (requestedUid !== decoded.uid) {
      return NextResponse.json(
        { error: "Forbidden: uid mismatch." },
        { status: 403 }
      );
    }

    const uid = decoded.uid;
    const topic = `user_${uid}`;

    logServer("Request:", {
      uid,
      email: decoded.email ?? null,
      topic,
      tokenPreview: token.slice(0, 12) + "...",
      tokenLen: token.length,
    });

    // ✅ 1) Subscribe token to topic
    const messaging = getMessaging();
    const resp = await messaging.subscribeToTopic([token], topic);

    logServer("subscribeToTopic resp:", resp);

    if (resp.failureCount > 0) {
      const errObj = resp.errors?.[0]?.error;
      const msg =
        errObj instanceof Error ? errObj.message : "Failed to subscribe token.";

      errServer("❌ subscribeToTopic FAILED:", {
        topic,
        uid,
        tokenPreview: token.slice(0, 12) + "...",
        tokenLen: token.length,
        resp,
      });

      return NextResponse.json(
        { error: msg, code: "subscribe_failed", resp },
        { status: 400 }
      );
    }

    // ✅ 2) Store token under UID
    const userRef = adminDb.collection("users").doc(uid);

    await userRef.set(
      {
        email: decoded.email ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await userRef.collection("fcmTokens").doc(token).set(
      {
        token,
        platform: "web",
        topic,
        topicType: "user",
        uid,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    logServer("✅ Success:", {
      uid,
      topic,
      tokenPreview: token.slice(0, 12) + "...",
      tokenLen: token.length,
    });

    return NextResponse.json({ success: true, topic });
  } catch (err: unknown) {
    errServer("❌ Error:", err);

    const msg = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
