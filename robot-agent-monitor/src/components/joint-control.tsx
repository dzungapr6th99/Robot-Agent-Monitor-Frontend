"use client";
import { useState } from "react";
import { useMonitor } from "./monitor-provider";
import { ErrorBox } from "./ui";
import type { Joint } from "../lib/types";
export function JointControl({ joint }: { joint: Joint }) {
  const m = useMonitor();
  const index = m.jointState?.name.indexOf(joint.name) ?? -1;
  const measured = index >= 0 ? m.jointState?.position[index] : undefined;
  const [draftTarget, setTarget] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const command = m.interfaces.find(
    (i) => i.isEnabled && i.isDefaultCommand && i.operation !== "subscribe",
  );
  const registered =
    command &&
    m.ros?.publishers.some(
      (p) =>
        p.name === command.rosEndpoint && p.messageType === command.dataType,
    );
  const bounded = joint.lower !== null && joint.upper !== null;
  const reason = !m.connected
    ? "Backend is disconnected."
    : !m.ros?.running
      ? "ROS runtime is unavailable."
      : !m.fresh || !Number.isFinite(measured)
        ? "Fresh joint state is required."
        : !command
          ? "Select an enabled default command interface."
          : command.operation !== "publish"
            ? "ROS action commands are not supported by this backend yet."
            : command.dataType !== "sensor_msgs/msg/JointState"
              ? "This backend supports JointState publishing; this command type is unavailable."
              : !registered
                ? "Command topic is not active in the backend. Activate this configuration and restart the agent."
                : !["revolute", "prismatic"].includes(joint.type) || !bounded
                  ? "This joint has no bounded position interface."
                  : "";
  const clamp = (n: number) =>
    Math.min(joint.upper ?? 0, Math.max(joint.lower ?? 0, n));
  const target =
    draftTarget ?? (Number.isFinite(measured) ? clamp(measured!) : clamp(0));
  const send = async () => {
    setError("");
    setBusy(true);
    try {
      if (reason) throw new Error(reason);
      if (!Number.isFinite(target)) throw new Error("Target must be finite.");
      await m.publish({
        topic: command!.rosEndpoint,
        messageType: command!.dataType,
        data: {
          header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "" },
          name: [joint.name],
          position: [clamp(target)],
          velocity: [],
          effort: [],
        },
      });
      m.notify(
        `Target published for ${joint.name}. Controller acknowledgement is not available.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="joint-control">
      <div>
        <h3 className="mono">{joint.name}</h3>
        <p className="muted">
          measured{" "}
          <strong>
            {Number.isFinite(measured) ? measured!.toFixed(3) : "—"}
          </strong>{" "}
          · limits [{joint.lower ?? "—"}, {joint.upper ?? "—"}]{" "}
          {joint.type === "prismatic" ? "m" : "rad"}
        </p>
      </div>
      <label>
        Target{" "}
        <input
          aria-label="Target position"
          type="number"
          step="0.01"
          min={joint.lower ?? undefined}
          max={joint.upper ?? undefined}
          disabled={!!reason || busy}
          value={target}
          onChange={(e) => setTarget(clamp(Number(e.target.value)))}
        />
      </label>
      <input
        aria-label="Joint target slider"
        type="range"
        min={joint.lower ?? 0}
        max={joint.upper ?? 0}
        step="0.001"
        disabled={!!reason || busy}
        value={target}
        onChange={(e) => setTarget(Number(e.target.value))}
      />
      <div className="button-row">
        <button className="primary" disabled={!!reason || busy} onClick={send}>
          {busy ? "Publishing…" : "Send Target"}
        </button>
        <button
          onClick={() => {
            setTarget(null);
            setError("");
          }}
        >
          Cancel
        </button>
      </div>
      {reason && <p className="muted small">Control disabled — {reason}</p>}
      <ErrorBox message={error} />
    </div>
  );
}
