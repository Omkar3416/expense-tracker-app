// src/lib/notifications/messaging.ts

export type {
  ForegroundMessagePayload,
  TopicMode,
  TopicResponse,
} from "@/lib/notifications/messaging/types";

export { shouldProcessForegroundNotification } from "@/lib/notifications/messaging/foregroundDedupe";

export { debugNotificationEnvironment } from "@/lib/notifications/messaging/debug";

export {
  getMessagingSafe,
  requestNotificationPermission,
  getFcmToken,
  getFcmTokenWithRecovery,
  forceRefreshMessagingAndToken,
  listenToForegroundMessages,
} from "@/lib/notifications/messaging/fcm";

export {
  ensureMessagingServiceWorker,
  resetMessagingServiceWorker,
} from "@/lib/notifications/messaging/sw";

export {
  subscribeTokenToTopic,
  subscribeTokenToUserTopic,
  unsubscribeTokenFromTopic,
} from "@/lib/notifications/messaging/topics";
