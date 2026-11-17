"use client";
import Link from "next/link";
import {
  Activity,
  Server,
  Radio,
  Disc,
  ArrowUpRight,
  Upload,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { useMonitor } from "../components/monitor-provider";
import { Badge, Empty, SectionTitle, formatDate } from "../components/ui";
import { RobotViewer } from "../components/robot-viewer";
import { ImportRobot } from "../components/import-robot";
export default function Overview() {
  const m = useMonitor();
  const [importing, setImporting] = useState(false);
  const sensors = m.data.sensors.filter(
    (s) => s.robotConfigurationId === m.configId,
  );
  const episodes = m.data.episodes
    .filter((e) => e.robotConfigurationId === m.configId)
    .slice()
    .sort((a, b) =>
      (b.startedAt || b.createdAt || "").localeCompare(
        a.startedAt || a.createdAt || "",
      ),
    )
    .slice(0, 5);
  const diagnostics = Object.values(m.samples)
    .filter((s) => s.message.messageType.startsWith("diagnostic_msgs/"))
    .flatMap((s) =>
      Array.isArray(s.message.data.status)
        ? s.message.data.status
        : [s.message.data],
    )
    .filter((s) => Number(s.level) > 0) as {
    name?: string;
    message?: string;
    level?: number;
  }[];
  const cards = [
    {
      label: "Backend",
      value: m.connected ? "Connected" : "Disconnected",
      detail: m.connected
        ? "REST API responding"
        : "Check the agent connection",
      tone: m.connected ? "green" : "red",
      icon: Server,
    },
    {
      label: "ROS Runtime",
      value: m.ros?.running
        ? "Available"
        : m.rosError
          ? "Access required"
          : "Unavailable",
      detail: m.ros?.running
        ? `${m.ros.subscriptions.length} subscriptions · ${m.ros.publishers.length} publishers`
        : m.rosError
          ? "Configure access in Settings"
          : "ROS is disabled or offline",
      tone: m.ros?.running ? "green" : "amber",
      icon: Radio,
    },
    {
      label: "Joint State",
      value: m.fresh ? "Receiving" : m.jointState ? "Stale" : "No state",
      detail: m.jointState
        ? `${m.jointState.name.length} joints · ${Math.max(0, Math.floor((m.clock - (m.stateTime || 0)) / 1000))}s ago`
        : "Waiting for configured state topic",
      tone: m.fresh ? "green" : "muted",
      icon: Activity,
    },
    {
      label: "Recording",
      value: "Unavailable",
      detail: "Recorder runtime is not configured",
      tone: "muted",
      icon: Disc,
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Overview</h1>
          <p>System and robot readiness at a glance</p>
        </div>
        <span className="muted small">Local agent · ROS 2</span>
      </div>
      {!m.data["robot-profiles"].length && (
        <div className="panel welcome">
          <div>
            <h2>No robot configured yet</h2>
            <p>
              Create a robot profile and upload a URDF configuration to see live
              status, joint state and sensor data here.
            </p>
          </div>
          <div className="button-row">
            <button className="primary" onClick={() => setImporting(true)}>
              <Upload size={14} />
              Import Robot
            </button>
            <Link className="button" href="/robots">
              Create Empty Profile
            </Link>
          </div>
        </div>
      )}
      {!m.config && m.data["robot-profiles"].length > 0 && (
        <div className="warning">
          Choose a robot configuration in the sidebar or{" "}
          <Link href="/robots">open Robots</Link> to begin.
        </div>
      )}
      {m.config && !m.fresh && (
        <div className="warning">
          <Activity size={14} />
          <span>
            {m.jointState
              ? "Joint state is stale. Controls are disabled until fresh data arrives."
              : "No live joint state received for this configuration."}{" "}
            <Link href="/joints?tab=interfaces">Check joint interfaces →</Link>
          </span>
        </div>
      )}
      <div className="stat-grid">
        {cards.map((c) => (
          <section key={c.label} className="panel stat-card">
            <div className="stat-label">
              {c.label}
              <c.icon size={15} />
            </div>
            <Badge tone={c.tone}>{c.value}</Badge>
            <p>{c.detail}</p>
          </section>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel model-panel">
          <SectionTitle
            title={
              m.config
                ? `${m.profile?.name} · ${m.config.name}`
                : "Robot viewport"
            }
          >
            <button className="text-button" onClick={m.reloadModel}>
              <RefreshCw size={12} />
              Reload model
            </button>
          </SectionTitle>
          <RobotViewer />
          <div className="model-info">
            <span>
              {m.model
                ? `${m.model.links.length} links · ${m.model.joints.length} joints`
                : "No URDF loaded"}
            </span>
            <Link href="/robots">
              Manage robot <ArrowUpRight size={12} />
            </Link>
          </div>
        </section>
        <div className="overview-side">
          <section className="panel">
            <SectionTitle title="Joint Interfaces">
              <Link href="/joints?tab=interfaces">Configure</Link>
            </SectionTitle>
            {m.interfaces.length ? (
              m.interfaces.map((i) => (
                <div className="summary-row" key={i.id}>
                  <div>
                    <strong>{i.name}</strong>
                    <small>
                      {i.operation} ·{" "}
                      <span className="mono">{i.rosEndpoint}</span>
                    </small>
                  </div>
                  <Badge
                    tone={
                      !i.isEnabled
                        ? "muted"
                        : m.samples[i.rosEndpoint] &&
                            m.clock - m.samples[i.rosEndpoint].time < 3000
                          ? "green"
                          : "muted"
                    }
                  >
                    {!i.isEnabled
                      ? "Disabled"
                      : m.samples[i.rosEndpoint] &&
                          m.clock - m.samples[i.rosEndpoint].time < 3000
                        ? "Receiving"
                        : "No data"}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="panel-note">No interface data available.</p>
            )}
          </section>
          <section className="panel">
            <SectionTitle title="Sensors">
              <Link href="/sensors">Configure</Link>
            </SectionTitle>
            {sensors.length ? (
              sensors.map((s) => (
                <div key={s.id} className="summary-row">
                  <div>
                    <strong>{s.displayName}</strong>
                    <small>
                      {s.sensorType} ·{" "}
                      {
                        m.data["sensor-streams"].filter(
                          (t) => t.sensorId === s.id,
                        ).length
                      }{" "}
                      streams
                    </small>
                  </div>
                  <Badge>{s.isEnabled ? "Configured" : "Disabled"}</Badge>
                </div>
              ))
            ) : (
              <p className="panel-note">No sensor data available.</p>
            )}
          </section>
        </div>
      </div>
      <section className="panel episodes">
        <SectionTitle title="Recent Episodes">
          <Link href="/data">View all</Link>
        </SectionTitle>
        {episodes.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Name",
                    "Task",
                    "Status",
                    "Result",
                    "Duration",
                    "Started",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {episodes.map((e) => (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td>{e.task || "—"}</td>
                    <td>
                      <Badge>{e.status || "—"}</Badge>
                    </td>
                    <td>{e.result || "—"}</td>
                    <td>
                      {e.durationNs
                        ? (e.durationNs / 1e9).toFixed(1) + "s"
                        : "—"}
                    </td>
                    <td>{formatDate(e.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No episodes recorded yet" />
        )}
      </section>
      {diagnostics.length > 0 && (
        <section className="panel">
          <SectionTitle title="ROS Diagnostics" />
          {diagnostics.map((d, i) => (
            <div key={i} className="summary-row">
              <strong>{d.name}</strong>
              <span>{d.message}</span>
              <Badge tone={Number(d.level) >= 2 ? "red" : "amber"}>
                {Number(d.level) >= 2 ? "Error" : "Warning"}
              </Badge>
            </div>
          ))}
        </section>
      )}
      {importing && <ImportRobot onClose={() => setImporting(false)} />}
    </>
  );
}
