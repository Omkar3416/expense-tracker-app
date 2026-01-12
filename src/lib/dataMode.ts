// src/lib/dataMode.ts

export type DataMode = "auto" | "firestore" | "local";

const KEY = "expense-tracker:data-mode";

export function getDataMode(): DataMode {
  if (typeof window === "undefined") return "auto";
  const raw = localStorage.getItem(KEY);
  if (raw === "auto" || raw === "firestore" || raw === "local") return raw;
  return "auto";
}

export function setDataMode(mode: DataMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, mode);
}

export function getDataModeLabel(mode: DataMode) {
  if (mode === "auto") return "Auto";
  if (mode === "firestore") return "Firestore";
  return "Local";
}
