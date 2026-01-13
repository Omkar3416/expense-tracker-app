// src/lib/notifications/messaging.ts

export type {
  ForegroundMessagePayload,
  TopicMode,
  TopicResponse,
  SubscribeResult,
} from "./messaging/types";

export { shouldProcessForegroundNotification } from "./messaging/foregroundDedupe";
export { debugNotificationEnvironment } from "./messaging/debug";

export {
  getMessagingSafe,
  requestNotificationPermission,
  getFcmToken,
  getFcmTokenWithRecovery,
  forceRefreshMessagingAndToken,
  listenToForegroundMessages,
} from "./messaging/fcm";

export {
  ensureMessagingServiceWorker,
  resetMessagingServiceWorker,
} from "./messaging/sw";

export {
  subscribeTokenToTopic,
  subscribeTokenToUserTopic,
  unsubscribeTokenFromTopic,
} from "./messaging/topics";
