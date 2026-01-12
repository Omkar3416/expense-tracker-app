"use client";

import { createPortal } from "react-dom";

export default function ModalPortal({
  children,
}: {
  children: React.ReactNode;
}) {
  // ✅ No useState / no useEffect → no warning
  if (typeof document === "undefined") return null;

  return createPortal(children, document.body);
}
