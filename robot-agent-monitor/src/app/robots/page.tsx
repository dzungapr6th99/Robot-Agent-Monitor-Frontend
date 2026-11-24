"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus, RefreshCw, FileCode2 } from "lucide-react";
import { useMonitor } from "../../components/monitor-provider";
import { RobotViewer } from "../../components/robot-viewer";
import { Badge, Empty, formatDate } from "../../components/ui";

export default function Robots() {
  const m = useMonitor();
  const [profileId, setProfileId] = useState<number | null>(null);
  const selected =
    profileId || m.profile?.id || m.data["robot-profiles"][0]?.id;
  const profile = m.data["robot-profiles"].find((p) => p.id === selected);
  const configurations = m.data["robot-configurations"].filter(
    (c) => c.robotProfileId === selected,
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Robots</h1>
          <p>Xem mô hình 3D URDF theo profile và cấu hình đang chọn</p>
        </div>
        <Link className="button primary" href="/urdf-models">
          <Plus size={15} />
          Upload / Quản lý URDF
        </Link>
      </div>
      <div className="robot-workspace">
        <section className="panel profile-list">
          <div className="section-title">
            <h2>Profiles</h2>
          </div>
          {m.data["robot-profiles"].length ? (
            m.data["robot-profiles"].map((p) => (
              <div
                key={p.id}
                className={`list-row ${p.id === selected ? "active" : ""}`}
              >
                <button
                  className="row-main"
                  onClick={() => {
                    setProfileId(p.id);
                    m.selectConfig(
                      m.data["robot-configurations"].find(
                        (c) => c.robotProfileId === p.id,
                      )?.id || null,
                    );
                  }}
                >
                  <strong>{p.name}</strong>
                  <small>
                    {
                      m.data["robot-configurations"].filter(
                        (c) => c.robotProfileId === p.id,
                      ).length
                    }{" "}
                    configurations
                  </small>
                </button>
              </div>
            ))
          ) : (
            <Empty
              title="No robot profiles yet"
              action={
                <Link className="button primary" href="/urdf-models">
                  Upload URDF
                </Link>
              }
            />
          )}
        </section>
        <section className="panel configuration-list">
          <div className="section-title">
            <h2>Configurations</h2>
            <Link className="text-button" href="/urdf-models">
              <Plus size={12} />
              Upload
            </Link>
          </div>
          {!profile ? (
            <Empty title="Select a profile" />
          ) : configurations.length ? (
            configurations.map((c) => (
              <button
                key={c.id}
                className={`list-row row-main ${m.configId === c.id ? "active" : ""}`}
                onClick={() => m.selectConfig(c.id)}
              >
                <strong>
                  <span className="dot blue" />
                  {c.name}
                </strong>
                <small>
                  {c.id === m.configId && m.model
                    ? `${m.model.joints.length} joints`
                    : "URDF configuration"}
                </small>
              </button>
            ))
          ) : (
            <Empty
              title="No configurations yet"
              action={
                <Link className="button" href="/urdf-models">
                  Upload URDF
                </Link>
              }
            />
          )}
        </section>
        <section className="configuration-detail">
          {m.config && m.config.robotProfileId === selected ? (
            <>
              <div className="detail-heading">
                <div>
                  <h2>
                    {m.profile?.name} · {m.config.name}
                  </h2>
                  <p className="mono muted">Configuration #{m.config.id}</p>
                </div>
                <div className="button-row">
                  <Link className="button" href="/urdf-models">
                    Quản lý URDF
                  </Link>
                  <Link
                    className="button"
                    href={`/vla-models?config=${m.config.id}`}
                  >
                    VLA Models
                  </Link>
                  <button aria-label="Reload model" onClick={m.reloadModel}>
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>
              <RobotViewer />
              <div className="panel summary">
                <div>
                  <FileCode2 size={17} />
                  <strong>URDF summary</strong>
                  <Badge tone={m.model ? "green" : "amber"}>
                    {m.model ? "Loaded and parsed" : "Not loaded"}
                  </Badge>
                </div>
                <p>
                  {m.model?.links.length ?? "—"} links ·{" "}
                  {m.model?.joints.length ?? "—"} joints
                </p>
                <code>{m.config.urdfPath}</code>
                <hr />
                <p className="muted">
                  Created {formatDate(m.config.createdAt)} · Referenced by{" "}
                  {
                    m.data.episodes.filter(
                      (e) => e.robotConfigurationId === m.configId,
                    ).length
                  }{" "}
                  episodes
                </p>
              </div>
            </>
          ) : (
            <div className="panel fill">
              <Empty title="Select a configuration">
                Inspect its 3D URDF model, links and joints.
              </Empty>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
