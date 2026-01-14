// src/app/layout.tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

import Providers from "@/store/Providers";
import Navbar from "@/components/layout/Navbar";
import AppShell from "@/components/layout/AppShell";
import AuthGate from "@/components/auth/AuthGate";
import PageTransition from "@/components/layout/PageTransition";
import NotificationBootstrap from "@/components/notifications/NotificationBootstrap";
import NotificationClickRouter from "@/components/notifications/NotificationClickRouter";

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Track your expenses easily",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AuthGate>
            {/* ✅ Push notification setup hook (does not change UI) */}
            <NotificationBootstrap />

            {/* ✅ NEW: handle tap routing for already-open tabs */}
            <NotificationClickRouter />

            <Navbar />
            <AppShell>
              <PageTransition>{children}</PageTransition>
            </AppShell>
          </AuthGate>
        </Providers>
      </body>
    </html>
  );
}
