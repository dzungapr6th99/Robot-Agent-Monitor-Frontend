"use client";
import { useState } from "react";
import { useMonitor } from "../../components/monitor-provider";
import { Badge, Empty, ErrorBox, Modal, formatDate } from "../../components/ui";
import { write } from "../../lib/api";
import type { Episode } from "../../lib/types";
export default function Data() {
  const m = useMonitor();
  const [filter, setFilter] = useState(""),
    [edit, setEdit] = useState<Episode | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const episodes = m.data.episodes.filter(
    (e) =>
      (!m.config || e.robotConfigurationId === m.configId) &&
      `${e.name} ${e.task || ""} ${e.status || ""} ${e.result || ""}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Data</h1>
          <p>Episode metadata from the local agent</p>
        </div>
        <input
          style={{ maxWidth: 240 }}
          aria-label="Filter episodes"
          placeholder="Filter episodes…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="warning">
        MCAP recording and replay are not exposed by this backend yet. Existing
        episode metadata can be reviewed below.
      </div>
      <section className="panel">
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
                  "",
                ].map((t, i) => (
                  <th key={i}>{t}</th>
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
                    {e.durationNs ? (e.durationNs / 1e9).toFixed(1) + "s" : "—"}
                  </td>
                  <td>{formatDate(e.startedAt)}</td>
                  <td>
                    <button
                      onClick={() => {
                        setEdit(e);
                        setError("");
                      }}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!episodes.length && <Empty title="No episodes recorded yet" />}
      </section>
      {edit && (
        <Modal
          title={edit.name}
          onClose={() => {
            if (!busy) setEdit(null);
          }}
        >
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await write("episodes", "update", {
                  id: edit.id,
                  result: edit.result || null,
                  operatorNote: edit.operatorNote || null,
                });
                await m.refresh();
                setEdit(null);
                m.notify("Episode review saved.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Result
              <select
                value={edit.result || ""}
                onChange={(e) => setEdit({ ...edit, result: e.target.value })}
              >
                <option value="">Not reviewed</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
              </select>
            </label>
            <label>
              Operator note
              <textarea
                value={edit.operatorNote || ""}
                onChange={(e) =>
                  setEdit({ ...edit, operatorNote: e.target.value })
                }
              />
            </label>
            <label>
              Recording path
              <input readOnly value={edit.recordingPath || "Not available"} />
            </label>
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
                Save
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
