import type { SafeAdmin } from "@/contracts/admin/session";
import type { SessionClientResult } from "@/features/auth/session-client";

type SessionHeartbeatControllerOptions = Readonly<{
  checkSession: (signal: AbortSignal) => Promise<SessionClientResult>;
  onAuthenticationFailure: () => void;
  onSessionSuccess?: (admin: SafeAdmin) => void;
}>;

export function createSessionHeartbeatController({
  checkSession,
  onAuthenticationFailure,
  onSessionSuccess,
}: SessionHeartbeatControllerOptions) {
  let active = true;
  let abortController: AbortController | null = null;
  let inFlight: Promise<void> | null = null;

  const check = (): Promise<void> => {
    if (!active) {
      return Promise.resolve();
    }

    if (inFlight !== null) {
      return inFlight;
    }

    abortController = new AbortController();
    const currentAbortController = abortController;
    const currentCheck = (async () => {
      let result: SessionClientResult;

      try {
        result = await checkSession(currentAbortController.signal);
      } catch {
        return;
      }

      if (!active) {
        return;
      }

      if (result.ok) {
        onSessionSuccess?.(result.admin);
        return;
      }

      if (result.error.kind === "authentication") {
        onAuthenticationFailure();
      }
    })();

    inFlight = currentCheck;
    const clearCurrentCheck = () => {
      if (inFlight === currentCheck) {
        inFlight = null;
        abortController = null;
      }
    };
    void currentCheck.then(clearCurrentCheck, clearCurrentCheck);

    return currentCheck;
  };

  const dispose = () => {
    active = false;
    abortController?.abort();
    abortController = null;
    inFlight = null;
  };

  return Object.freeze({ check, dispose });
}
