"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { setApiToken } from "@/lib/api";

function SessionWatcher() {
  const { data: session } = useSession();
  useEffect(() => {
    setApiToken((session as any)?.token || null);
  }, [session]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionWatcher />
      {children}
    </SessionProvider>
  );
}
