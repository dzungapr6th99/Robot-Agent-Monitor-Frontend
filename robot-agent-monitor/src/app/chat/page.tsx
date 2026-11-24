"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { RobotViewer } from "../../components/robot-viewer";
import { useMonitor } from "../../components/monitor-provider";
import { Badge, ErrorBox } from "../../components/ui";
import { request, vlaModels } from "../../lib/api";
import type {
  VlaCommandResult,
  VlaMessage,
  VlaModel,
  VlaStatus,
  VlaStopResult,
} from "../../lib/types";

function RobotChatContent() {
  const monitor = useMonitor();
  const { selectConfig } = monitor;
  const searchParams = useSearchParams();
  const queryConfig = Number(searchParams.get("config")) || null;
  const queryModel = Number(searchParams.get("model")) || null;

  const appliedQueryConfig = useRef<number | null>(null);
  useEffect(() => {
    if (queryConfig && appliedQueryConfig.current !== queryConfig) {
      appliedQueryConfig.current = queryConfig;
      selectConfig(queryConfig);
    }
  }, [queryConfig, selectConfig]);

  const activeConfigId = monitor.configId;

  const [models, setModels] = useState<VlaModel[] | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(
    queryModel,
  );
  const [runtimeStatus, setRuntimeStatus] = useState<VlaStatus | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<VlaMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");

  const rosOnline = monitor.connected && monitor.ros?.running === true;
  const activeModel =
    models?.find((item) => item.id === selectedModelId) ?? models?.[0] ?? null;

  useEffect(() => {
    const controller = new AbortController();
    vlaModels
      .status(controller.signal)
      .then(setRuntimeStatus)
      .catch(() => {
        // Status badge is best-effort.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!activeConfigId) return;
    const controller = new AbortController();
    vlaModels
      .list({ configurationId: activeConfigId }, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) {
          setModels(rows);
          setError("");
        }
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted) {
          setModels([]);
          setError(err.message);
        }
      });
    return () => controller.abort();
  }, [activeConfigId]);

  const handleConfigChange = (nextConfigId: number | null) => {
    selectConfig(nextConfigId);
    setSelectedModelId(null);
    setModels(null);
    setError("");
  };

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const task = draft.trim();
    if (!task || !activeConfigId || !activeModel || running || !rosOnline)
      return;
    const willLoad = runtimeStatus?.loadedModelId !== activeModel.id;
    setDraft("");
    setRunning(true);
    setLoadingModel(willLoad);
    setError("");
    setMessages((previous) => [...previous, { role: "Operator", text: task }]);
    try {
      const result = await request<VlaCommandResult>("/api/vla/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          robotConfigurationId: activeConfigId,
          modelId: activeModel.id,
          task,
        }),
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
      vlaModels
        .status()
        .then(setRuntimeStatus)
        .catch(() => {});
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setMessages((previous) => [...previous, { role: "Robot", text: msg }]);
    } finally {
      setRunning(false);
      setLoadingModel(false);
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
    } catch (err) {
      setError((err as Error).message);
      setStopping(false);
    }
  }

  const configurations = monitor.data["robot-configurations"];
  const visibleModels = activeConfigId ? (models ?? []) : [];

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Robot Chat</h1>
          <p>Chọn URDF rồi chọn model VLA tương ứng để gửi lệnh điều khiển.</p>
        </div>
        {runtimeStatus && runtimeStatus.providers.length > 0 && (
          <Badge tone="blue">
            Providers: {runtimeStatus.providers.join(", ")}
          </Badge>
        )}
      </div>
      <div className="robot-chat">
        <section className="panel robot-chat-panel">
          <form className="form-stack" onSubmit={send}>
            <div className="robot-chat-models">
              <label>
                URDF
                <select
                  aria-label="URDF"
                  value={activeConfigId ?? ""}
                  disabled={running || !configurations.length}
                  onChange={(event) =>
                    handleConfigChange(Number(event.target.value) || null)
                  }
                >
                  <option value="">Chọn URDF</option>
                  {configurations.map((cfg) => {
                    const profile = monitor.data["robot-profiles"].find(
                      (p) => p.id === cfg.robotProfileId,
                    );
                    return (
                      <option key={cfg.id} value={cfg.id}>
                        {profile ? `${profile.name} · ` : ""}
                        {cfg.name}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label>
                Model
                <select
                  aria-label="Model"
                  value={activeModel?.id ?? ""}
                  disabled={
                    running || !activeConfigId || visibleModels.length === 0
                  }
                  onChange={(event) =>
                    setSelectedModelId(Number(event.target.value) || null)
                  }
                >
                  {!activeConfigId ? (
                    <option value="">Chọn URDF trước</option>
                  ) : visibleModels.length === 0 ? (
                    <option value="">Không có model VLA</option>
                  ) : (
                    visibleModels.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName} · {item.modelType} · {item.version}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
            <div
              className="robot-chat-messages"
              role="log"
              aria-label="Robot conversation"
              aria-live="polite"
            >
              {!activeConfigId && (
                <p className="muted">
                  Chọn một cấu hình URDF trước.{" "}
                  <Link href="/urdf-models">Quản lý URDF Models</Link>
                </p>
              )}
              {activeConfigId && models?.length === 0 && (
                <p className="muted">
                  URDF này chưa có model VLA.{" "}
                  <Link href={`/vla-models?config=${activeConfigId}`}>
                    Tải lên model VLA
                  </Link>
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
                  {stopping
                    ? "Stopping…"
                    : loadingModel
                      ? "Đang nạp model…"
                      : "Running instruction…"}
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
                disabled={!activeModel || running}
              />
            </label>
            <div className="button-row">
              <button
                className="primary"
                disabled={
                  !activeConfigId ||
                  !activeModel ||
                  !draft.trim() ||
                  running ||
                  !rosOnline
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

export default function RobotChat() {
  return (
    <Suspense fallback={<div className="loading">Đang tải Robot Chat…</div>}>
      <RobotChatContent />
    </Suspense>
  );
}
