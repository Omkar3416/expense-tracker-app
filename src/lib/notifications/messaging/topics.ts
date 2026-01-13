// src/lib/notifications/messaging/topics.ts

import { auth } from "@/lib/firebaseClient";
import { errLog, log } from "./logger";
import type { SubscribeResult, TopicMode, TopicResponse } from "./types";

export async function subscribeTokenToTopic(
  token: string,
  mode: TopicMode
): Promise<SubscribeResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not logged in." };

    const idToken = await user.getIdToken(true);
    if (!idToken) return { success: false, error: "Missing idToken." };

    log("➡️ subscribeTokenToTopic", {
      mode,
      tokenPreview: token.slice(0, 18) + "...",
      tokenLen: token.length,
    });

    const res = await fetch("/api/notifications/subscribe-topic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token, mode }),
    });

    const json = (await res.json()) as TopicResponse;

    log("⬅️ subscribe-topic response", {
      ok: res.ok,
      status: res.status,
      json,
    });

    if (!res.ok) {
      return { success: false, error: json?.error ?? "Subscribe failed" };
    }

    return { success: true, topic: json.topic };
  } catch (e) {
    errLog("subscribeTokenToTopic failed:", e);
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function subscribeTokenToUserTopic(
  token: string,
  uid: string
): Promise<SubscribeResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not logged in." };

    const idToken = await user.getIdToken(true);
    if (!idToken) return { success: false, error: "Missing idToken." };

    const cleanUid = uid.trim();
    if (!cleanUid) return { success: false, error: "Missing uid." };

    log("➡️ subscribeTokenToUserTopic", {
      uid: cleanUid,
      tokenPreview: token.slice(0, 18) + "...",
      tokenLen: token.length,
    });

    const res = await fetch("/api/notifications/subscribe-user-topic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token, uid: cleanUid }),
    });

    const json = (await res.json()) as TopicResponse;

    log("⬅️ subscribe-user-topic response", {
      ok: res.ok,
      status: res.status,
      json,
    });

    if (!res.ok) {
      return {
        success: false,
        error: json?.error ?? "Subscribe user topic failed",
      };
    }

    return { success: true, topic: json.topic };
  } catch (e) {
    errLog("subscribeTokenToUserTopic failed:", e);
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function unsubscribeTokenFromTopic(
  token: string,
  mode: TopicMode
): Promise<SubscribeResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not logged in." };

    const idToken = await user.getIdToken(true);
    if (!idToken) return { success: false, error: "Missing idToken." };

    log("➡️ unsubscribeTokenFromTopic", {
      mode,
      tokenPreview: token.slice(0, 18) + "...",
      tokenLen: token.length,
    });

    const res = await fetch("/api/notifications/unsubscribe-topic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token, mode }),
    });

    const json = (await res.json()) as TopicResponse;

    log("⬅️ unsubscribe-topic response", {
      ok: res.ok,
      status: res.status,
      json,
    });

    if (!res.ok) {
      return { success: false, error: json?.error ?? "Unsubscribe failed" };
    }

    return { success: true, topic: json.topic };
  } catch (e) {
    errLog("unsubscribeTokenFromTopic failed:", e);
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
