"use client";
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown, X } from "lucide-react";
import Link from "next/link";
import { useMonitor } from "../../components/monitor-provider";
import { RobotViewer } from "../../components/robot-viewer";
import { JointControl } from "../../components/joint-control";
import { Badge, Empty, Modal, ErrorBox } from "../../components/ui";
import { write } from "../../lib/api";
import type { JointInterface, JointGroup } from "../../lib/types";
const blank = {
  name: "",
  operation: "subscribe",
  rosEndpoint: "",
  dataType: "sensor_msgs/msg/JointState",
  isEnabled: true,
  isDefaultCommand: false,
};
function JointWorkspace() {
  const m = useMonitor();
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") || "live";
  const [selected, setSelected] = useState(""),
    [filter, setFilter] = useState(""),
    [groupFilter, setGroupFilter] = useState(0);
  const [editing, setEditing] = useState<Partial<JointInterface> | null>(null),
    [groupEdit, setGroupEdit] = useState<Partial<JointGroup> | null>(null),
    [pending, setPending] = useState<Record<number, string>>({});
  const [deleting, setDeleting] = useState<{
      resource: string;
      id: number;
      name: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [paused, setPaused] = useState(false),
    [frozen, setFrozen] = useState<Record<string, number[]>>({});
  const groups = m.data["joint-groups"]
    .filter((g) => g.robotConfigurationId === m.configId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const members = m.data["joint-group-members"];
  const joints = (m.model?.joints || []).filter(
    (j) =>
      j.type !== "fixed" &&
      j.name.toLowerCase().includes(filter.toLowerCase()) &&
      (!groupFilter ||
        members.some(
          (a) => a.jointGroupId === groupFilter && a.jointName === j.name,
        )),
  );
  const joint = m.model?.joints.find((j) => j.name === selected);
  const histories = paused ? frozen : m.history;
  const values = histories[selected] || [];
  const perform = async (
    action: () => Promise<unknown>,
    message = "Saved.",
  ) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await m.refresh();
      m.notify(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const saveInterface = async () => {
    if (!editing) return;
    setError("");
    if (
      !editing.name?.trim() ||
      !editing.rosEndpoint?.startsWith("/") ||
      !editing.dataType?.trim()
    ) {
      setError("Name, an absolute ROS endpoint and data type are required.");
      return;
    }
    if (
      m.interfaces.some(
        (i) => i.id !== editing.id && i.rosEndpoint === editing.rosEndpoint,
      )
    ) {
      setError("This endpoint is already configured.");
      return;
    }
    if (
      await perform(async () => {
        await write("joint-interfaces", editing.id ? "update" : "create", {
          ...editing,
          robotConfigurationId: m.configId,
        });
        if (editing.isDefaultCommand)
          for (const other of m.interfaces.filter(
            (i) => i.id !== editing.id && i.isDefaultCommand,
          ))
            await write("joint-interfaces", "update", {
              id: other.id,
              isDefaultCommand: false,
            });
      }, "Interface saved. Restart the agent to activate ROS configuration changes.")
    )
      setEditing(null);
  };
  const saveGroup = async () => {
    if (!groupEdit) return;
    const name = groupEdit.displayName?.trim();
    if (
      !name ||
      groups.some(
        (g) =>
          g.id !== groupEdit.id &&
          g.displayName.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError("Display name is required and must be unique.");
      return;
    }
    if (
      await perform(() =>
        write("joint-groups", groupEdit.id ? "update" : "create", {
          ...groupEdit,
          displayName: name,
          name: groupEdit.name || name.toLowerCase().replace(/\s+/g, "_"),
          robotConfigurationId: m.configId,
          sortOrder:
            groupEdit.sortOrder ??
            Math.max(0, ...groups.map((g) => g.sortOrder)) + 1,
        }),
      )
    )
      setGroupEdit(null);
  };
  const moveGroup = async (index: number, step: number) => {
    const a = groups[index],
      b = groups[index + step];
    if (!a || !b) return;
    await perform(async () => {
      const order = groups.map((g) => g.id);
      [order[index], order[index + step]] = [order[index + step], order[index]];
      for (let i = 0; i < order.length; i++)
        await write("joint-groups", "update", { id: order[i], sortOrder: i });
    });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Joints</h1>
          <p>
            Live state, ROS interfaces and joint groups
            {m.config ? ` for ${m.profile?.name} · ${m.config.name}` : ""}
          </p>
        </div>
      </div>
      {!m.config ? (
        <div className="panel">
          <Empty
            title="Select a robot configuration"
            action={
              <Link className="button primary" href="/robots">
                Open Robots
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="tabs">
            {[
              ["live", "Live State"],
              ["interfaces", "ROS Interfaces"],
              ["groups", "Joint Groups"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => {
                  router.replace(`/joints?tab=${id}`, { scroll: false });
                  setError("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {!editing && !groupEdit && !deleting && <ErrorBox message={error} />}
          {tab === "live" && (
            <div className="joint-workspace">
              <div>
                <section className="panel">
                  <div className="section-title">
                    <input
                      placeholder="Search joints…"
                      aria-label="Search joints"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                    <select
                      aria-label="Filter by joint group"
                      value={groupFilter}
                      onChange={(e) => setGroupFilter(Number(e.target.value))}
                    >
                      <option value={0}>All joints</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.displayName}
                        </option>
                      ))}
                    </select>
                    <Badge tone={m.fresh ? "green" : "amber"}>
                      {m.fresh ? "Live" : m.jointState ? "Stale" : "No state"}
                    </Badge>
                  </div>
                  {!m.jointState && m.rosError && (
                    <p className="muted">
                      {m.rosError}{" "}
                      <Link href="/settings">Realtime settings</Link>
                    </p>
                  )}
                  <div className="table-scroll">
                    <table className="joint-table">
                      <thead>
                        <tr>
                          {[
                            "Joint",
                            "Type",
                            "Position",
                            "Velocity",
                            "Effort",
                            "Limits",
                            "Status",
                          ].map((t) => (
                            <th key={t}>{t}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {joints.map((j) => {
                          const index =
                            m.jointState?.name.indexOf(j.name) ?? -1;
                          const hasPosition =
                            index >= 0 &&
                            Number.isFinite(m.jointState?.position[index]);
                          const value = (
                            key: "position" | "velocity" | "effort",
                          ) => {
                            const n =
                              index >= 0
                                ? m.jointState?.[key]?.[index]
                                : undefined;
                            return Number.isFinite(n) ? n!.toFixed(3) : "—";
                          };
                          return (
                            <tr
                              key={j.name}
                              className={selected === j.name ? "selected" : ""}
                              onClick={() => setSelected(j.name)}
                            >
                              <td>
                                <button
                                  className="text-button mono"
                                  onClick={() => setSelected(j.name)}
                                >
                                  {j.name}
                                </button>
                              </td>
                              <td>{j.type}</td>
                              <td className="mono">{value("position")}</td>
                              <td className="mono">{value("velocity")}</td>
                              <td className="mono">{value("effort")}</td>
                              <td className="mono">
                                [{j.lower ?? "—"}, {j.upper ?? "—"}]
                              </td>
                              <td>
                                <Badge
                                  tone={
                                    !hasPosition
                                      ? "muted"
                                      : m.fresh
                                        ? "green"
                                        : "amber"
                                  }
                                >
                                  {!m.jointState
                                    ? "Waiting"
                                    : !hasPosition
                                      ? "Missing"
                                      : m.fresh
                                        ? "Live"
                                        : "Stale"}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!joints.length && (
                    <Empty
                      title={
                        m.model
                          ? "No matching movable joints"
                          : "Load the URDF to inspect joints"
                      }
                    >
                      {m.modelError}
                    </Empty>
                  )}
                </section>
                <section className="panel chart-panel">
                  <div className="section-title">
                    <h2>{selected || "Joint"} · Position history</h2>
                    <button
                      disabled={!selected}
                      onClick={() => {
                        if (!paused) setFrozen(m.history);
                        setPaused(!paused);
                      }}
                    >
                      {paused ? "Resume" : "Pause"}
                    </button>
                  </div>
                  {values.length > 1 ? (
                    <svg
                      className="joint-chart"
                      viewBox="0 0 600 130"
                      role="img"
                      aria-label={`${selected} position history`}
                      preserveAspectRatio="none"
                    >
                      <path
                        d="M0 32 H600 M0 65 H600 M0 98 H600"
                        stroke="#202831"
                        fill="none"
                      />
                      <polyline
                        points={values
                          .map(
                            (v, i) =>
                              `${(i / (values.length - 1)) * 600},${115 - ((v - Math.min(...values)) / (Math.max(...values) - Math.min(...values) || 1)) * 100}`,
                          )
                          .join(" ")}
                        fill="none"
                        stroke="#6cb1ff"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  ) : (
                    <p className="panel-note">
                      {selected
                        ? "Waiting for live samples…"
                        : "Select a joint to inspect its history."}
                    </p>
                  )}
                  <div className="chart-caption">
                    Last {values.length} samples · position (
                    {joint?.type === "prismatic" ? "m" : "rad"}) ·{" "}
                    {paused ? "paused" : "live"}
                  </div>
                </section>
              </div>
              <section className="panel joint-inspector">
                <RobotViewer onSelect={setSelected} />
                {joint ? (
                  <JointControl
                    key={`${m.configId}:${joint.name}`}
                    joint={joint}
                  />
                ) : (
                  <Empty title="Select a joint">
                    Inspect its measured position, limits and control
                    availability.
                  </Empty>
                )}
              </section>
            </div>
          )}
          {tab === "interfaces" && (
            <section className="panel">
              <div className="section-title">
                <p className="muted">
                  Configure topics used by the agent. Changes take effect after
                  an agent restart.
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setError("");
                    setEditing(blank);
                  }}
                >
                  <Plus size={13} />
                  New Interface
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Name",
                        "Operation",
                        "Endpoint",
                        "Data Type",
                        "Default",
                        "Enabled",
                        "Status",
                        "",
                      ].map((t, i) => (
                        <th key={i}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {m.interfaces.map((i) => (
                      <tr key={i.id}>
                        <td>{i.name}</td>
                        <td>
                          <code>{i.operation}</code>
                        </td>
                        <td className="mono">{i.rosEndpoint}</td>
                        <td className="mono small">{i.dataType}</td>
                        <td>{i.isDefaultCommand ? "Default" : "—"}</td>
                        <td>
                          <Badge tone={i.isEnabled ? "green" : "muted"}>
                            {i.isEnabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </td>
                        <td>
                          <Badge
                            tone={
                              m.samples[i.rosEndpoint] &&
                              m.clock - m.samples[i.rosEndpoint].time < 3000
                                ? "green"
                                : "muted"
                            }
                          >
                            {m.samples[i.rosEndpoint] &&
                            m.clock - m.samples[i.rosEndpoint].time < 3000
                              ? "Receiving"
                              : "Not verified"}
                          </Badge>
                        </td>
                        <td>
                          <div className="button-row">
                            <button
                              onClick={() => {
                                setError("");
                                setEditing(i);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="danger-text"
                              onClick={() => {
                                setError("");
                                setDeleting({
                                  resource: "joint-interfaces",
                                  id: i.id,
                                  name: i.name,
                                });
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!m.interfaces.length && (
                <Empty title="No joint interfaces">
                  Add a state subscription to start receiving joint values.
                </Empty>
              )}
            </section>
          )}
          {tab === "groups" && (
            <>
              <div className="section-title">
                <span className="muted">
                  Organize joints independently of ROS interfaces.
                </span>
                <button
                  className="primary"
                  onClick={() => {
                    setError("");
                    setGroupEdit({});
                  }}
                >
                  <Plus size={13} />
                  New Group
                </button>
              </div>
              <div className="group-grid">
                {groups.map((g, i) => {
                  const mine = members
                    .filter((a) => a.jointGroupId === g.id)
                    .sort((a, b) => a.sortOrder - b.sortOrder);
                  const choices =
                    m.model?.joints.filter(
                      (j) =>
                        j.type !== "fixed" &&
                        !mine.some((a) => a.jointName === j.name),
                    ) || [];
                  const add = pending[g.id] || choices[0]?.name || "";
                  return (
                    <section className="panel group-card" key={g.id}>
                      <div className="section-title">
                        <div>
                          <h2>{g.displayName}</h2>
                          <small className="mono muted">{g.name}</small>
                        </div>
                        <div className="button-row">
                          <button
                            aria-label={`Move ${g.displayName} up`}
                            disabled={busy || i === 0}
                            onClick={() => moveGroup(i, -1)}
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            aria-label={`Move ${g.displayName} down`}
                            disabled={busy || i === groups.length - 1}
                            onClick={() => moveGroup(i, 1)}
                          >
                            <ArrowDown size={12} />
                          </button>
                          <button
                            onClick={() => {
                              setError("");
                              setGroupEdit(g);
                            }}
                          >
                            Rename
                          </button>
                          <button
                            aria-label={`Delete group ${g.displayName}`}
                            onClick={() => {
                              setError("");
                              setDeleting({
                                resource: "joint-groups",
                                id: g.id,
                                name: g.displayName,
                              });
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <div className="member-chips">
                        {mine.map((a, k) => (
                          <span className="member-chip" key={a.id}>
                            <span className="mono">{a.jointName}</span>
                            <button
                              disabled={busy || k === 0}
                              aria-label={`Move member ${a.jointName} up`}
                              onClick={() =>
                                perform(async () => {
                                  const ids = mine.map((x) => x.id);
                                  [ids[k - 1], ids[k]] = [ids[k], ids[k - 1]];
                                  for (let n = 0; n < ids.length; n++)
                                    await write(
                                      "joint-group-members",
                                      "update",
                                      { id: ids[n], sortOrder: n },
                                    );
                                })
                              }
                            >
                              <ArrowUp size={11} />
                            </button>
                            <button
                              disabled={busy}
                              aria-label={`Remove ${a.jointName}`}
                              onClick={() =>
                                perform(() =>
                                  write("joint-group-members", "delete", {
                                    id: a.id,
                                  }),
                                )
                              }
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        {!mine.length && (
                          <p className="muted">No members yet.</p>
                        )}
                      </div>
                      <div className="group-add">
                        <select
                          aria-label={`Add joint to ${g.displayName}`}
                          value={add}
                          onChange={(e) =>
                            setPending({ ...pending, [g.id]: e.target.value })
                          }
                        >
                          {choices.map((j) => (
                            <option key={j.name}>{j.name}</option>
                          ))}
                        </select>
                        <button
                          disabled={!add || busy}
                          onClick={() =>
                            perform(() =>
                              write("joint-group-members", "create", {
                                jointGroupId: g.id,
                                jointName: add,
                                sortOrder:
                                  Math.max(0, ...mine.map((a) => a.sortOrder)) +
                                  1,
                              }),
                            )
                          }
                        >
                          Add
                        </button>
                      </div>
                    </section>
                  );
                })}
              </div>
              {!groups.length && (
                <section className="panel">
                  <Empty title="No joint groups yet" />
                </section>
              )}
            </>
          )}
        </>
      )}
      {editing && (
        <Modal
          title={editing.id ? "Edit Interface" : "New Interface"}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveInterface();
            }}
          >
            <label>
              Name *
              <input
                autoFocus
                value={editing.name || ""}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              Operation
              <select
                value={editing.operation}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    operation: e.target.value,
                    isDefaultCommand:
                      e.target.value === "subscribe"
                        ? false
                        : editing.isDefaultCommand,
                  })
                }
              >
                <option>subscribe</option>
                <option>publish</option>
                <option>action_client</option>
              </select>
            </label>
            <label>
              ROS Endpoint *
              <input
                placeholder="/joint_states"
                value={editing.rosEndpoint || ""}
                onChange={(e) =>
                  setEditing({ ...editing, rosEndpoint: e.target.value.trim() })
                }
              />
            </label>
            <label>
              Data Type *
              <input
                list="ros-types"
                value={editing.dataType || ""}
                onChange={(e) =>
                  setEditing({ ...editing, dataType: e.target.value.trim() })
                }
              />
              <datalist id="ros-types">
                <option>sensor_msgs/msg/JointState</option>
                <option>control_msgs/action/FollowJointTrajectory</option>
              </datalist>
            </label>
            <div className="button-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!editing.isEnabled}
                  onChange={(e) =>
                    setEditing({ ...editing, isEnabled: e.target.checked })
                  }
                />
                Enabled
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  disabled={editing.operation === "subscribe"}
                  checked={!!editing.isDefaultCommand}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      isDefaultCommand: e.target.checked,
                    })
                  }
                />
                Default command
              </label>
            </div>
            <ErrorBox message={error} />
            <footer className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(null)}
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
      {groupEdit && (
        <Modal
          title={groupEdit.id ? "Rename Joint Group" : "New Joint Group"}
          onClose={() => {
            if (!busy) setGroupEdit(null);
          }}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveGroup();
            }}
          >
            <label>
              Display Name *
              <input
                autoFocus
                value={groupEdit.displayName || ""}
                onChange={(e) =>
                  setGroupEdit({ ...groupEdit, displayName: e.target.value })
                }
              />
            </label>
            <ErrorBox message={error} />
            <footer className="modal-actions">
              <button type="button" onClick={() => setGroupEdit(null)}>
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {groupEdit.id ? "Save" : "Create"}
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
          <p>
            This removes the saved configuration
            {deleting.resource === "joint-groups" ? " and its members" : ""}.
            This cannot be undone.
          </p>
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
                  await perform(
                    () =>
                      write(deleting.resource, "delete", { id: deleting.id }),
                    "Deleted.",
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

export default function Joints() {
  const monitor = useMonitor();
  return (
    <Suspense
      fallback={<div className="loading">Loading joint workspace…</div>}
    >
      <JointWorkspace key={monitor.config?.id || "none"} />
    </Suspense>
  );
}
