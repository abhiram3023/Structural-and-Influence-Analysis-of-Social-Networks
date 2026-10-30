"use client";

import Shell from "@/components/Shell";
import { NetworkProvider } from "@/lib/store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <NetworkProvider>
      <Shell>{children}</Shell>
    </NetworkProvider>
  );
}
