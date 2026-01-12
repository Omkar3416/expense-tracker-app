// src/app/api/admin/users/route.ts

import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = await adminAuth.verifyIdToken(token);

    if (!decoded.admin) {
      return NextResponse.json({ error: "Not admin" }, { status: 403 });
    }

    // ✅ get all user profiles stored in Firestore
    const snap = await adminDb.collection("users").orderBy("createdAt", "desc").get();

    const list = snap.docs.map((d) => d.data());
    return NextResponse.json({ users: list });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Something went wrong";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
