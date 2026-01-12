// src/app/api/admin/init-auth-config/route.ts

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { secret?: string };

    if (!body.secret || body.secret !== process.env.ADMIN_SETUP_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ref = adminDb.collection("appConfig").doc("auth");
    const snap = await ref.get();

    if (snap.exists) {
      return NextResponse.json({ success: true, alreadyExists: true });
    }

    await ref.set({
      adminGoogleEnabled: false,
      adminAllowedGoogleEmails: [],
      adminAllowedGoogleDomains: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, created: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
