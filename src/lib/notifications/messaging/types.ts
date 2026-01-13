// src/lib/notifications/messaging/types.ts

export type ForegroundMessagePayload = {
  title?: string;
  body?: string;
  data?: Record<string, string>;
  notificationId?: string;
  url?: string;
};

export type TopicMode = "dev" | "prod";

export type TopicResponse = {
  success?: boolean;
  topic?: string;
  error?: string;
  code?: string;
};

export type SubscribeResult = {
  success: boolean;
  topic?: string;
  error?: string;
};
