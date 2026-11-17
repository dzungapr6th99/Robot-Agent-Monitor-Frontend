"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useMonitor } from "../../components/monitor-provider";
import { Badge, Empty, ErrorBox, Modal } from "../../components/ui";
import { write } from "../../lib/api";
import type { Sensor, SensorStream } from "../../lib/types";
export default function Sensors() {
  const m = useMonitor();
  const [sensor, setSensor] = useState<Partial<Sensor> | null>(null),
    [stream, setStream] = useState<Partial<SensorStream> | null>(null),
    [deleting, setDeleting] = useState<{
      resource: string;
      id: number;
      name: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sensors = m.data.sensors.filter(
    (s) => s.robotConfigurationId === m.configId,
  );
  const perform = async (action: () => Promise<unknown>) => {
    setError("");
    setBusy(true);
    try {
      await action();
      await m.refresh();
      m.notify(
        "Sensor configuration saved. Restart the agent to activate changes.",
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Sensors</h1>
          <p>Configure logical sensors and their ROS streams</p>
        </div>
        <button
          className="primary"
          disabled={!m.config}
          onClick={() => {
            setError("");
            setSensor({ isEnabled: true, sensorType: "camera_rgb" });
          }}
        >
          <Plus size={14} />
          New Sensor
        </button>
      </div>
      {!m.config ? (
        <section className="panel">
          <Empty
            title="Select a robot configuration"
            action={
              <Link className="button" href="/robots">
                Open Robots
              </Link>
            }
          />
        </section>
      ) : !sensors.length ? (
        <section className="panel">
          <Empty title="No sensors configured">
            Add sensors and map each stream to a ROS topic.
          </Empty>
        </section>
      ) : (
        <div className="sensor-grid">
          {sensors.map((s) => (
            <section className="panel" key={s.id}>
              <div className="section-title">
                <div>
                  <h2>{s.displayName}</h2>
                  <small className="muted mono">
                    {s.code} · {s.sensorType}
                  </small>
                </div>
                <div className="button-row">
                  <Badge>{s.isEnabled ? "Configured" : "Disabled"}</Badge>
                  <button
                    onClick={() => {
                      setError("");
                      setSensor(s);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    aria-label={`Delete sensor ${s.displayName}`}
                    onClick={() => {
                      setError("");
                      setDeleting({
                        resource: "sensors",
                        id: s.id,
                        name: s.displayName,
                      });
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div className="sensor-body">
                {m.data["sensor-streams"]
                  .filter((t) => t.sensorId === s.id)
                  .map((t) => {
                    const sample = m.samples[t.topic];
                    const live = !!sample && m.clock - sample.time < 3000;
                    return (
                      <div className="stream-row" key={t.id}>
                        <div>
                          <strong>{t.role}</strong>
                          <small className="mono">{t.topic}</small>
                          <small className="mono">{t.dataType}</small>
                        </div>
                        <div className="button-row">
                          <Badge tone={live ? "green" : "muted"}>
                            {!t.isEnabled
                              ? "Disabled"
                              : live
                                ? "Receiving"
                                : "No data"}
                          </Badge>
                          <button
                            onClick={() => {
                              setError("");
                              setStream(t);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            aria-label={`Delete stream ${t.role}`}
                            onClick={() => {
                              setError("");
                              setDeleting({
                                resource: "sensor-streams",
                                id: t.id,
                                name: t.role,
                              });
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                <button
                  className="text-button"
                  onClick={() => {
                    setError("");
                    setStream({ sensorId: s.id, isEnabled: true });
                  }}
                >
                  <Plus size={12} />
                  Add stream
                </button>
                <p style={{ marginTop: 14 }}>
                  Image/depth/IMU previews require matching runtime message
                  support. Current monitor types: diagnostics, JointState,
                  Odometry and TF.
                </p>
              </div>
            </section>
          ))}
        </div>
      )}
      {sensor && (
        <Modal
          title={sensor.id ? "Edit Sensor" : "New Sensor"}
          onClose={() => {
            if (!busy) setSensor(null);
          }}
        >
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!sensor.code?.trim() || !sensor.displayName?.trim()) {
                setError("Code and display name are required.");
                return;
              }
              if (
                sensors.some(
                  (s) => s.id !== sensor.id && s.code === sensor.code,
                )
              ) {
                setError("Sensor code must be unique.");
                return;
              }
              if (
                await perform(() =>
                  write("sensors", sensor.id ? "update" : "create", {
                    ...sensor,
                    robotConfigurationId: m.configId,
                  }),
                )
              )
                setSensor(null);
            }}
          >
            <label>
              Code *
              <input
                autoFocus
                value={sensor.code || ""}
                onChange={(e) =>
                  setSensor({ ...sensor, code: e.target.value.trim() })
                }
              />
            </label>
            <label>
              Display name *
              <input
                value={sensor.displayName || ""}
                onChange={(e) =>
                  setSensor({ ...sensor, displayName: e.target.value })
                }
              />
            </label>
            <label>
              Sensor type
              <select
                value={sensor.sensorType}
                onChange={(e) =>
                  setSensor({ ...sensor, sensorType: e.target.value })
                }
              >
                {[
                  "camera_rgb",
                  "camera_depth",
                  "camera_rgbd",
                  "point_cloud",
                  "imu",
                  "tactile",
                  "force_torque",
                  "temperature",
                  "other",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={!!sensor.isEnabled}
                onChange={(e) =>
                  setSensor({ ...sensor, isEnabled: e.target.checked })
                }
              />
              Enabled
            </label>
            <ErrorBox message={error} />
            <footer className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setSensor(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Save
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {stream && (
        <Modal
          title={stream.id ? "Edit Stream" : "New Stream"}
          onClose={() => {
            if (!busy) setStream(null);
          }}
        >
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                !stream.role?.trim() ||
                !stream.topic?.startsWith("/") ||
                !stream.dataType?.trim()
              ) {
                setError("Role, absolute topic and data type are required.");
                return;
              }
              if (
                await perform(() =>
                  write(
                    "sensor-streams",
                    stream.id ? "update" : "create",
                    stream,
                  ),
                )
              )
                setStream(null);
            }}
          >
            <label>
              Role *
              <input
                autoFocus
                value={stream.role || ""}
                onChange={(e) => setStream({ ...stream, role: e.target.value })}
              />
            </label>
            <label>
              Topic *
              <input
                value={stream.topic || ""}
                onChange={(e) =>
                  setStream({ ...stream, topic: e.target.value.trim() })
                }
              />
            </label>
            <label>
              Data type *
              <input
                value={stream.dataType || ""}
                onChange={(e) =>
                  setStream({ ...stream, dataType: e.target.value.trim() })
                }
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={!!stream.isEnabled}
                onChange={(e) =>
                  setStream({ ...stream, isEnabled: e.target.checked })
                }
              />
              Enabled
            </label>
            <ErrorBox message={error} />
            <footer className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setStream(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                Save
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title={`Delete “${deleting.name}”?`}
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p>Remove this saved sensor configuration? This cannot be undone.</p>
          <ErrorBox message={error} />
          <footer className="modal-actions">
            <button disabled={busy} onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                if (
                  await perform(() =>
                    write(deleting.resource, "delete", { id: deleting.id }),
                  )
                )
                  setDeleting(null);
              }}
            >
              Delete
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
