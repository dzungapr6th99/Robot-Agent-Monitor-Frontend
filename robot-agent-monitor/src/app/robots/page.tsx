"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw, FileCode2 } from "lucide-react";
import { useMonitor } from "../../components/monitor-provider";
import { RobotViewer } from "../../components/robot-viewer";
import { ImportRobot } from "../../components/import-robot";
import { Badge, Empty, ErrorBox, Modal, formatDate } from "../../components/ui";
import { write } from "../../lib/api";
import type { RobotProfile } from "../../lib/types";
export default function Robots() {
  const m = useMonitor();
  const [profileId, setProfileId] = useState<number | null>(null),
    [wizard, setWizard] = useState(false),
    [uploadProfile, setUploadProfile] = useState<number | undefined>();
  const selected =
    profileId || m.profile?.id || m.data["robot-profiles"][0]?.id;
  const profile = m.data["robot-profiles"].find((p) => p.id === selected);
  const configurations = m.data["robot-configurations"].filter(
    (c) => c.robotProfileId === selected,
  );
  const [edit, setEdit] = useState<{
    type: "profile" | "configuration";
    id?: number;
    name: string;
    description: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<{
    type: "profile" | "configuration";
    id: number;
    name: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const episodes = m.data.episodes.filter((e) =>
    deleting?.type === "configuration"
      ? e.robotConfigurationId === deleting.id
      : m.data["robot-configurations"].some(
          (c) =>
            c.robotProfileId === deleting?.id &&
            c.id === e.robotConfigurationId,
        ),
  );
  const save = async () => {
    if (!edit) return;
    setError("");
    setBusy(true);
    try {
      if (!edit.name.trim()) throw new Error("Name is required.");
      const dupe =
        edit.type === "profile"
          ? m.data["robot-profiles"].some(
              (p) =>
                p.id !== edit.id &&
                p.name.toLowerCase() === edit.name.trim().toLowerCase(),
            )
          : m.data["robot-configurations"].some(
              (c) =>
                c.id !== edit.id &&
                c.robotProfileId === selected &&
                c.name.toLowerCase() === edit.name.trim().toLowerCase(),
            );
      if (dupe) throw new Error("Name must be unique.");
      await write(
        edit.type === "profile" ? "robot-profiles" : "robot-configurations",
        edit.id ? "update" : "create",
        {
          ...(edit.id ? { id: edit.id } : {}),
          name: edit.name.trim(),
          ...(edit.type === "profile" ? { description: edit.description } : {}),
        },
      );
      await m.refresh();
      setEdit(null);
      m.notify("Saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!deleting) return;
    setError("");
    setBusy(true);
    try {
      await write(
        deleting.type === "profile" ? "robot-profiles" : "robot-configurations",
        "delete",
        { id: deleting.id },
      );
      if (deleting.type === "configuration" && m.configId === deleting.id)
        m.selectConfig(null);
      await m.refresh();
      setDeleting(null);
      m.notify("Deleted.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const newProfile = () => {
    setError("");
    setEdit({ type: "profile", name: "", description: "" });
  };
  const editProfile = (p: RobotProfile) => {
    setError("");
    setEdit({
      type: "profile",
      id: p.id,
      name: p.name,
      description: p.description || "",
    });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Robots</h1>
          <p>Manage robot profiles, configurations and URDF packages</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setUploadProfile(undefined);
            setWizard(true);
          }}
        >
          <Plus size={15} />
          Import Robot
        </button>
      </div>
      <div className="robot-workspace">
        <section className="panel profile-list">
          <div className="section-title">
            <h2>Profiles</h2>
            <button
              className="icon-button"
              title="Create profile"
              aria-label="Create profile"
              onClick={newProfile}
            >
              <Plus size={15} />
            </button>
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
                <button
                  className="icon-button"
                  aria-label={`Edit profile ${p.name}`}
                  onClick={() => editProfile(p)}
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete profile ${p.name}`}
                  onClick={() => {
                    setError("");
                    setDeleting({ type: "profile", id: p.id, name: p.name });
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          ) : (
            <Empty
              title="No robot profiles yet"
              action={
                <button onClick={newProfile}>Create Empty Profile</button>
              }
            />
          )}
        </section>
        <section className="panel configuration-list">
          <div className="section-title">
            <h2>Configurations</h2>
            <button
              className="text-button"
              disabled={!profile}
              onClick={() => {
                setUploadProfile(selected);
                setWizard(true);
              }}
            >
              <Plus size={12} />
              Upload
            </button>
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
                <button
                  onClick={() => {
                    setUploadProfile(selected);
                    setWizard(true);
                  }}
                >
                  Upload Configuration
                </button>
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
                  <button
                    onClick={() => {
                      setError("");
                      setEdit({
                        type: "configuration",
                        id: m.config!.id,
                        name: m.config!.name,
                        description: "",
                      });
                    }}
                  >
                    Rename
                  </button>
                  <button aria-label="Reload model" onClick={m.reloadModel}>
                    <RefreshCw size={13} />
                  </button>
                  <button
                    className="danger-outline"
                    onClick={() => {
                      setError("");
                      setDeleting({
                        type: "configuration",
                        id: m.config!.id,
                        name: m.config!.name,
                      });
                    }}
                  >
                    <Trash2 size={13} />
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
                Inspect its URDF model, links and joints.
              </Empty>
            </div>
          )}
        </section>
      </div>
      {wizard && (
        <ImportRobot
          profileId={uploadProfile}
          onClose={() => {
            setWizard(false);
            setProfileId(null);
          }}
        />
      )}
      {edit && (
        <Modal
          title={edit.id ? `Edit ${edit.type}` : "Create Profile"}
          onClose={() => {
            if (!busy) setEdit(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="form-stack"
          >
            <label>
              Name *
              <input
                autoFocus
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </label>
            {edit.type === "profile" && (
              <label>
                Description
                <textarea
                  value={edit.description}
                  onChange={(e) =>
                    setEdit({ ...edit, description: e.target.value })
                  }
                />
              </label>
            )}
            <ErrorBox message={error} />
            <footer className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEdit(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title={
            episodes.length
              ? `Cannot delete “${deleting.name}”`
              : `Delete “${deleting.name}”?`
          }
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p>
            {episodes.length
              ? `Referenced by ${episodes.length} episodes. Delete or reassign those episodes first.`
              : deleting.type === "profile" && configurations.length
                ? "Delete this profile's configurations first."
                : "This removes the configuration metadata and its dependent interfaces, sensors and groups. This cannot be undone."}
          </p>
          <ErrorBox message={error} />
          <footer className="modal-actions">
            <button disabled={busy} onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              className="danger"
              disabled={
                busy ||
                episodes.length > 0 ||
                (deleting.type === "profile" &&
                  m.data["robot-configurations"].some(
                    (c) => c.robotProfileId === deleting.id,
                  ))
              }
              onClick={remove}
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
