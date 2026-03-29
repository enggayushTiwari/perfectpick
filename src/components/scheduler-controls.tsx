"use client";

import { useState, useTransition } from "react";

type SchedulerControlsProps = {
  installScriptPath: string;
  drainCommand: string;
  workerCommand: string;
};

type InstallMode = "Drain" | "Worker";

export function SchedulerControls({ installScriptPath, drainCommand, workerCommand }: SchedulerControlsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function copyCommand(command: string, label: string) {
    try {
      await navigator.clipboard.writeText(command);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  function installScheduler(mode: InstallMode) {
    startTransition(async () => {
      setMessage(mode === "Drain" ? "Installing drain scheduler..." : "Installing worker scheduler...");

      try {
        const response = await fetch("/api/admin/scheduler", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ mode })
        });

        const payload = (await response.json()) as { installed?: boolean; message?: string; error?: string };
        if (!response.ok || !payload.installed) {
          setMessage(payload.error || payload.message || "Scheduler installation failed.");
          return;
        }

        setMessage(payload.message || `${mode} scheduler installed.`);
      } catch {
        setMessage("Scheduler installation request failed.");
      }
    });
  }

  return (
    <div className="scheduler-controls">
      <p className="muted">Install script: {installScriptPath}</p>
      <div className="scheduler-button-row">
        <button className="ghost-button" type="button" onClick={() => copyCommand(drainCommand, "Drain command")}>
          Copy drain command
        </button>
        <button className="ghost-button" type="button" onClick={() => copyCommand(workerCommand, "Worker command")}>
          Copy worker command
        </button>
      </div>
      <div className="scheduler-button-row">
        <button className="ghost-button" type="button" disabled={isPending} onClick={() => installScheduler("Drain")}>
          Install drain scheduler
        </button>
        <button className="ghost-button" type="button" disabled={isPending} onClick={() => installScheduler("Worker")}>
          Install worker scheduler
        </button>
      </div>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
