"use client";
import { useEffect, useState, type FormEvent } from "react";
import { RobotViewer } from "../../components/robot-viewer";
import { useMonitor } from "../../components/monitor-provider";
import { Badge, ErrorBox } from "../../components/ui";
import { request } from "../../lib/api";
import type {
  VlaProfile,
  VlaMessage,
  VlaCommandResult,
  VlaStopResult,
} from "../../lib/types";
const modelNames = { smolvla: "SmolVLA", groot: "GR00T" };

export default function RobotChat() {
  const monitor = useMonitor();
  const [profiles, setProfiles] = useState<VlaProfile[] | null>(null);
  const [model, setModel] = useState<VlaProfile["model"] | "">("");
  const [version, setVersion] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<VlaMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const rosOnline = monitor.connected && monitor.ros?.running === true;
  const models = [...new Set(profiles?.map((profile) => profile.model))];
  const activeModel = model || models[0];
  const versions =
    profiles?.filter((profile) => profile.model === activeModel) ?? [];
  const activeProfile =
    versions.find((profile) => profile.id === version) ?? versions[0];

  useEffect(() => {
    const controller = new AbortController();
    request<VlaProfile[]>("/api/vla/models", { signal: controller.signal })
      .then(setProfiles)
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const task = draft.trim();
    if (!task || !activeProfile || running || !rosOnline) return;
    setDraft("");
    setRunning(true);
    setError("");
    setMessages((previous) => [...previous, { role: "Operator", text: task }]);
    try {
      const result = await request<VlaCommandResult>("/api/vla/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: activeProfile.id, task }),
        signal: AbortSignal.timeout(
          Number(process.env.NEXT_PUBLIC_VLA_COMMAND_TIMEOUT_MS),
        ),
      });
      setMessages((previous) => [
        ...previous,
        {
          role: "Robot",
          text: `Published ${result.publishedSteps} motion steps to ROS.`,
        },
      ]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        { role: "Robot", text: (error as Error).message },
      ]);
    } finally {
      setRunning(false);
      setStopping(false);
    }
  }

  async function stop() {
    setStopping(true);
    try {
      const result = await request<VlaStopResult>("/api/vla/stop", {
        method: "POST",
      });
      if (!result.stopping) setStopping(false);
    } catch (error) {
      setError((error as Error).message);
      setStopping(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Robot Chat</h1>
          <p>Send an instruction using a trained VLA checkpoint.</p>
        </div>
      </div>
      <div className="robot-chat">
        <section className="panel robot-chat-panel">
          <form className="form-stack" onSubmit={send}>
            <div className="robot-chat-models">
              <label>
                Model
                <select
                  aria-label="Model"
                  value={activeModel ?? ""}
                  disabled={running || !models.length}
                  onChange={(event) => {
                    setModel(event.target.value as VlaProfile["model"]);
                    setVersion("");
                  }}
                >
                  {!models.length && <option value="">No models</option>}
                  {models.map((name) => (
                    <option key={name} value={name}>
                      {modelNames[name]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Training version
                <select
                  aria-label="Training version"
                  value={activeProfile?.id ?? ""}
                  disabled={running || !versions.length}
                  onChange={(event) => setVersion(event.target.value)}
                >
                  {!versions.length && <option value="">No versions</option>}
                  {versions.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.version}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="robot-chat-messages"
              role="log"
              aria-label="Robot conversation"
              aria-live="polite"
            >
              {profiles?.length === 0 && (
                <p className="muted">
                  Configure a VLA checkpoint on the backend to start.
                </p>
              )}
              {messages.map((message, index) => (
                <div
                  className={`robot-chat-message ${message.role.toLowerCase()}`}
                  key={index}
                >
                  <strong>{message.role}</strong>
                  <p>{message.text}</p>
                </div>
              ))}
              {running && (
                <p className="muted" role="status">
                  {stopping ? "Stopping…" : "Running instruction…"}
                </p>
              )}
            </div>
            <ErrorBox message={error} />
            {!rosOnline && (
              <p className="muted">
                ROS is offline. Connect ROS to send an instruction.
              </p>
            )}
            <label>
              Instruction
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                maxLength={2048}
                placeholder="Pick up the red cube."
                disabled={!activeProfile || running}
              />
            </label>
            <div className="button-row">
              <button
                className="primary"
                disabled={
                  !activeProfile || !draft.trim() || running || !rosOnline
                }
              >
                Send instruction
              </button>
              {running && (
                <button type="button" onClick={stop} disabled={stopping}>
                  Stop VLA
                </button>
              )}
            </div>
          </form>
        </section>
        <section className="panel">
          <div className="section-title">
            <h2>Robot pose</h2>
            <Badge tone={monitor.fresh ? "green" : "amber"}>
              {monitor.fresh
                ? "Live"
                : monitor.jointState
                  ? "Stale"
                  : "Waiting for joint state"}
            </Badge>
          </div>
          <RobotViewer />
        </section>
      </div>
    </>
  );
}
