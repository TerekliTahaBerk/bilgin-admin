"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createSessionHeartbeatController } from "@/components/app-shell/session-heartbeat-controller";
import { getSession } from "@/features/auth/session-client";

export const SESSION_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

export function SessionHeartbeat() {
  const router = useRouter();

  useEffect(() => {
    const heartbeat = createSessionHeartbeatController({
      checkSession: (signal) => getSession({ signal }),
      onAuthenticationFailure: () => {
        router.replace("/login");
        router.refresh();
      },
    });

    void heartbeat.check();

    const intervalId = window.setInterval(() => {
      void heartbeat.check();
    }, SESSION_HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void heartbeat.check();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      heartbeat.dispose();
    };
  }, [router]);

  return null;
}
