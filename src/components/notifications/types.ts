// src/components/notifications/types.ts

import type { FieldValue, Timestamp } from "firebase/firestore";

/**
 * ✅ Firestore "Timestamp fields" can be:
 * - Timestamp (when reading)
 * - FieldValue (serverTimestamp when writing)
 * - null (explicit empty)
 */
export type FirestoreTime = Timestamp | FieldValue | null;

export type AnnouncementDoc = {
  title?: string;
  body?: string;

  mode?: "dev" | "prod";
  status?: "sent" | "deleted";

  target?: "all" | "user";
  targetEmail?: string | null;
  targetUid?: string | null;

  sentAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  deletedAt?: Timestamp | null;

  createdBy?: string;
};

export type AnnouncementStateDoc = {
  seenAt?: FirestoreTime;
  hiddenAt?: FirestoreTime;
  updatedAt?: FirestoreTime;
};

export type BellRow = {
  id: string;
  title: string;
  body: string;

  mode?: "dev" | "prod";
  sentAt?: Timestamp;

  // user-side state
  seenAt?: Timestamp | null;
  hiddenAt?: Timestamp | null;

  // global state
  isDeletedGlobally: boolean;
};
