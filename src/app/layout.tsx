// src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

import Providers from "@/store/Providers";
import Navbar from "@/components/layout/Navbar";
import AppShell from "@/components/layout/AppShell";
import AuthGate from "@/components/auth/AuthGate";
import PageTransition from "@/components/layout/PageTransition";
import NotificationBootstrap from "@/components/notifications/NotificationBootstrap";

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Track your expenses easily",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AuthGate>
            {/* ✅ Push notification setup hook (does not change UI) */}
            <NotificationBootstrap />

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
