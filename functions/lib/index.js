"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyDueItems = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
function isoNow() {
    return new Date().toISOString();
}
function addMinutesIso(base, minutes) {
    return new Date(base.getTime() + minutes * 60000).toISOString();
}
function safeStr(v) {
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}
async function sendToUserTopic(uid, payload) {
    const topic = `user_${uid}`;
    await admin.messaging().send({
        topic,
        data: {
            title: payload.title,
            body: payload.body,
            url: payload.url,
            notificationId: payload.notificationId
        }
    });
}
/**
 * ✅ Runs every minute
 * Uses ISO string comparisons (safe because ISO UTC sorts lexicographically)
 */
exports.notifyDueItems = functions.pubsub
    .schedule("* * * * *")
    .timeZone("Asia/Kolkata")
    .onRun(async () => {
    const now = new Date();
    const nowIsoStr = now.toISOString();
    // window to prevent missing due items
    const upper = addMinutesIso(now, 1);
    // ---------------- BORROWINGS ----------------
    // Assumes borrowings stored at: users/{uid}/borrowings/{id}
    const borrowSnap = await admin
        .firestore()
        .collectionGroup("borrowings")
        .where("status", "==", "pending")
        .where("dueAt", "<=", upper)
        .get();
    for (const doc of borrowSnap.docs) {
        const data = doc.data();
        const dueAt = safeStr(data.dueAt);
        if (!dueAt)
            continue;
        // Prevent repeat sends
        const lastNotifiedAt = safeStr(data.lastNotifiedAt);
        if (lastNotifiedAt && lastNotifiedAt >= dueAt)
            continue;
        // Extract uid from path: users/{uid}/borrowings/{id}
        const parts = doc.ref.path.split("/");
        const usersIndex = parts.indexOf("users");
        const uid = usersIndex >= 0 ? parts[usersIndex + 1] : null;
        if (!uid)
            continue;
        const person = safeStr(data.person) ?? "Someone";
        const title = "Borrowing Due";
        const body = `Reminder: ${person} borrowing is due now.`;
        const url = `/borrowings?open=${doc.id}`;
        const notificationId = `borrowing_${doc.id}_${dueAt}`;
        await sendToUserTopic(uid, { title, body, url, notificationId });
        await doc.ref.set({ lastNotifiedAt: nowIsoStr }, { merge: true });
    }
    // ---------------- REMINDERS ----------------
    // Assumes reminders stored at: users/{uid}/reminders/{id}
    const remSnap = await admin
        .firestore()
        .collectionGroup("reminders")
        .where("status", "==", "active")
        .where("nextTriggerDate", "<=", upper)
        .get();
    for (const doc of remSnap.docs) {
        const data = doc.data();
        const next = safeStr(data.nextTriggerDate);
        if (!next)
            continue;
        const lastNotifiedAt = safeStr(data.lastNotifiedAt);
        if (lastNotifiedAt && lastNotifiedAt >= next)
            continue;
        const parts = doc.ref.path.split("/");
        const usersIndex = parts.indexOf("users");
        const uid = usersIndex >= 0 ? parts[usersIndex + 1] : null;
        if (!uid)
            continue;
        const titleText = safeStr(data.title) ?? "Reminder";
        const title = "Reminder Due";
        const body = `Reminder: ${titleText} is due now.`;
        const url = `/reminders?open=${doc.id}`;
        const notificationId = `reminder_${doc.id}_${next}`;
        await sendToUserTopic(uid, { title, body, url, notificationId });
        await doc.ref.set({ lastNotifiedAt: nowIsoStr }, { merge: true });
    }
    return null;
});
