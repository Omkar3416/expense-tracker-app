"use client";

import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      {/* Background gradients */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0B1220]" />
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-indigo-600/25 blur-[120px]" />
        <div className="absolute top-40 left-20 h-[420px] w-[420px] rounded-full bg-fuchsia-500/20 blur-[120px]" />
        <div className="absolute bottom-20 right-20 h-[420px] w-[420px] rounded-full bg-cyan-400/20 blur-[120px]" />
      </div>

      {/* Page animations */}
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
