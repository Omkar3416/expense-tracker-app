/**
 * One-time Firestore Migration
 * From: /users/{emailLower}/...
 * To:   /users/{uid}/...
 *
 * ✅ Copies: user doc + subcollections (transactions, categories, borrowings, reminders,
 * deleted*, notifications, fcmTokens)
 *
 * ⚠️ Run ONLY ONCE.
 */

import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Load service account JSON safely (works on Node 16–23+)
const serviceAccountPath = path.join(__dirname, "../serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

const SUBCOLLECTIONS = [
  "transactions",
  "categories",
  "borrowings",
  "reminders",
  "deletedTransactions",
  "deletedBorrowings",
  "deletedReminders",
  "notifications",
  "fcmTokens",
];

async function copyCollection(fromRef, toRef) {
  const snap = await fromRef.get();
  if (snap.empty) return 0;

  let batch = db.batch();
  let count = 0;
  let op = 0;

  for (const doc of snap.docs) {
    batch.set(toRef.doc(doc.id), doc.data(), { merge: true });
    count++;
    op++;

    // ✅ Firestore batch limit = 500 ops
    if (op >= 450) {
      await batch.commit();
      batch = db.batch();
      op = 0;
    }
  }

  if (op > 0) await batch.commit();
  return count;
}

async function migrateUser(emailLower) {
  console.log(`\n--- Migrating user: ${emailLower} ---`);

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(emailLower);
  } catch {
    console.log(`❌ Firebase Auth user not found for email: ${emailLower}`);
    return;
  }

  const uid = userRecord.uid;

  const oldUserRef = db.collection("users").doc(emailLower);
  const newUserRef = db.collection("users").doc(uid);

  const oldUserSnap = await oldUserRef.get();
  if (!oldUserSnap.exists) {
    console.log(`⚠️ No old user doc exists for: ${emailLower}`);
    return;
  }

  // ✅ copy root doc
  await newUserRef.set(
    {
      ...oldUserSnap.data(),
      migratedFromEmail: emailLower,
      migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`✅ Copied user root doc -> /users/${uid}`);

  // ✅ copy subcollections
  for (const sub of SUBCOLLECTIONS) {
    const copied = await copyCollection(
      oldUserRef.collection(sub),
      newUserRef.collection(sub)
    );
    console.log(`✅ Copied ${copied} docs from ${sub}`);
  }

  console.log(`✅ DONE for ${emailLower} -> UID: ${uid}`);
}

async function main() {
  console.log("🚀 Starting migration...");

  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.size} user docs in /users`);

  for (const d of usersSnap.docs) {
    const id = d.id;

    const looksLikeUid = /^[a-zA-Z0-9_-]{20,}$/.test(id) && !id.includes("@");
    if (looksLikeUid) {
      console.log(`Skipping (already UID): ${id}`);
      continue;
    }

    if (id.includes("@")) {
      await migrateUser(id.toLowerCase());
    } else {
      console.log(`Skipping unknown user doc id: ${id}`);
    }
  }

  console.log("\n✅ Migration complete!");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Migration failed:", e);
  process.exit(1);
});
