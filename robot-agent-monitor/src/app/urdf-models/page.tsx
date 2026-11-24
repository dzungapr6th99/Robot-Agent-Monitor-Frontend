"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { ImportRobot } from "../../components/import-robot";
import { useMonitor } from "../../components/monitor-provider";
import { Badge, Empty, ErrorBox, Modal, formatDate } from "../../components/ui";
import { baseUrl, vlaModels, write } from "../../lib/api";
import { assetUrl, parseUrdf } from "../../lib/urdf";
import type { RobotConfiguration, VlaModel } from "../../lib/types";

const ROS_IMAGE_TYPE = "sensor_msgs/msg/Image";

export default function UrdfModelsPage() {
  const m = useMonitor();
  const [search, setSearch] = useState("");
  const [wizard, setWizard] = useState(false);
  const [models, setModels] = useState<VlaModel[]>([]);
  const [jointCounts, setJointCounts] = useState<Record<number, number>>({});
  const [renaming, setRenaming] = useState<{
    id: number;
    name: string;
    profileId: number;
  } | null>(null);
  const [deleting, setDeleting] = useState<RobotConfiguration | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadVlaModels = useCallback(async (signal?: AbortSignal) => {
    try {
      const rows = await vlaModels.list({}, signal);
      setModels(rows);
    } catch {
      // Keep previous list if backend is temporarily unreachable.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadVlaModels(controller.signal));
    return () => controller.abort();
  }, [loadVlaModels, m.data["robot-configurations"].length]);

  useEffect(() => {
    const controller = new AbortController();
    const configs = m.data["robot-configurations"];
    void Promise.all(
      configs.map(async (c) => {
        if (!c.urdfPath) return null;
        try {
          const res = await fetch(baseUrl + assetUrl(c.id, c.urdfPath), {
            signal: controller.signal,
          });
          if (!res.ok) return null;
          const xml = await res.text();
          const parsed = parseUrdf(xml);
          const nonFixed = parsed.joints.filter(
            (j) => j.type !== "fixed",
          ).length;
          return [c.id, nonFixed] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (controller.signal.aborted) return;
      const next: Record<number, number> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setJointCounts(next);
    });
    return () => controller.abort();
  }, [m.data]);

  const vlaCountByConfig = useMemo(() => {
    const counts = new Map<number, number>();
    for (const model of models) {
      counts.set(
        model.robotConfigurationId,
        (counts.get(model.robotConfigurationId) ?? 0) + 1,
      );
    }
    return counts;
  }, [models]);

  const cameraCountByConfig = useMemo(() => {
    const counts = new Map<number, number>();
    const imageSensorIds = new Set(
      m.data["sensor-streams"]
        .filter((s) => s.isEnabled && s.dataType === ROS_IMAGE_TYPE)
        .map((s) => s.sensorId),
    );
    for (const sensor of m.data.sensors) {
      if (!sensor.isEnabled) continue;
      if (
        imageSensorIds.has(sensor.id) ||
        sensor.sensorType.toLowerCase().includes("camera")
      ) {
        counts.set(
          sensor.robotConfigurationId,
          (counts.get(sensor.robotConfigurationId) ?? 0) + 1,
        );
      }
    }
    return counts;
  }, [m.data]);

  const profileName = useCallback(
    (profileId: number) =>
      m.data["robot-profiles"].find((p) => p.id === profileId)?.name ??
      `Profile #${profileId}`,
    [m.data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return m.data["robot-configurations"].filter((c) => {
      if (!q) return true;
      const pName = profileName(c.robotProfileId).toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        pName.includes(q) ||
        (c.urdfPath || "").toLowerCase().includes(q)
      );
    });
  }, [m.data, search, profileName]);

  const saveRename = async () => {
    if (!renaming) return;
    setError("");
    const trimmed = renaming.name.trim();
    if (!trimmed) {
      setError("Tên URDF không được để trống.");
      return;
    }
    const dupe = m.data["robot-configurations"].some(
      (c) =>
        c.id !== renaming.id &&
        c.robotProfileId === renaming.profileId &&
        c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (dupe) {
      setError("Tên cấu hình URDF đã tồn tại trong profile này.");
      return;
    }
    setBusy(true);
    try {
      await write("robot-configurations", "update", {
        id: renaming.id,
        name: trimmed,
      });
      await m.refresh();
      setRenaming(null);
      m.notify("Đã đổi tên cấu hình URDF.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setError("");
    setBusy(true);
    try {
      await write("robot-configurations", "delete", { id: deleting.id });
      if (m.configId === deleting.id) {
        m.selectConfig(null);
      }
      await m.refresh();
      await loadVlaModels();
      setDeleting(null);
      m.notify("Đã xóa URDF và dọn thư mục lưu trữ.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>URDF Models</h1>
          <p>
            Quản lý, tìm kiếm và chọn cấu hình URDF đang hoạt động cho robot
          </p>
        </div>
        <button className="primary" onClick={() => setWizard(true)}>
          <Plus size={15} />
          Upload URDF
        </button>
      </div>

      <section className="panel">
        <div className="section-title">
          <h2>Danh sách URDF ({filtered.length})</h2>
          <input
            type="search"
            aria-label="Tìm kiếm URDF"
            placeholder="Tìm theo tên, profile hoặc urdfPath…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <Empty
            title={
              search.trim()
                ? "Không tìm thấy URDF khớp từ khóa"
                : "Chưa có URDF nào"
            }
            action={
              !search.trim() ? (
                <button className="primary" onClick={() => setWizard(true)}>
                  Upload URDF đầu tiên
                </button>
              ) : undefined
            }
          >
            {search.trim()
              ? "Thử từ khóa khác theo tên cấu hình, tên profile hoặc đường dẫn file URDF."
              : "Tải lên gói URDF và mesh để bắt đầu cấu hình sensor và nạp model VLA."}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Profile</th>
                  <th>File URDF</th>
                  <th>Số joint</th>
                  <th>Số camera</th>
                  <th>Số model VLA</th>
                  <th>Ngày tạo</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const isActive = c.id === m.configId;
                  const vlaCount = vlaCountByConfig.get(c.id) ?? 0;
                  const cameraCount = cameraCountByConfig.get(c.id) ?? 0;
                  const joints =
                    isActive && m.model
                      ? m.model.joints.filter((j) => j.type !== "fixed").length
                      : jointCounts[c.id];
                  return (
                    <tr key={c.id} className={isActive ? "selected" : ""}>
                      <td>
                        <strong>{c.name}</strong>{" "}
                        {isActive && <Badge tone="green">Đang chọn</Badge>}
                      </td>
                      <td>{profileName(c.robotProfileId)}</td>
                      <td>
                        <code>{c.urdfPath}</code>
                      </td>
                      <td>{joints !== undefined ? joints : "—"}</td>
                      <td>{cameraCount}</td>
                      <td>
                        <Link href={`/vla-models?config=${c.id}`}>
                          <Badge tone={vlaCount > 0 ? "blue" : "muted"}>
                            {vlaCount} model
                          </Badge>
                        </Link>
                      </td>
                      <td>{formatDate(c.createdAt)}</td>
                      <td>
                        <div className="button-row">
                          <button
                            className={isActive ? "" : "primary"}
                            disabled={isActive}
                            onClick={() => {
                              m.selectConfig(c.id);
                              m.notify(`Đã chọn URDF “${c.name}”.`);
                            }}
                          >
                            {isActive ? (
                              <>
                                <Check size={13} />
                                Đang chọn
                              </>
                            ) : (
                              "Chọn URDF này"
                            )}
                          </button>
                          <button
                            aria-label={`Đổi tên ${c.name}`}
                            onClick={() => {
                              setError("");
                              setRenaming({
                                id: c.id,
                                name: c.name,
                                profileId: c.robotProfileId,
                              });
                            }}
                          >
                            <Pencil size={13} />
                            Đổi tên
                          </button>
                          <button
                            className="danger-outline"
                            aria-label={`Xóa URDF ${c.name}`}
                            disabled={vlaCount > 0}
                            title={
                              vlaCount > 0
                                ? `Xóa hết ${vlaCount} model VLA trước`
                                : `Xóa URDF ${c.name}`
                            }
                            onClick={() => {
                              setError("");
                              setDeleting(c);
                            }}
                          >
                            <Trash2 size={13} />
                            Xóa
                          </button>
                          {vlaCount > 0 && (
                            <Link
                              className="small"
                              href={`/vla-models?config=${c.id}`}
                            >
                              Xóa hết {vlaCount} model VLA trước →
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {wizard && (
        <ImportRobot
          onClose={() => {
            setWizard(false);
            void loadVlaModels();
          }}
        />
      )}

      {renaming && (
        <Modal
          title="Đổi tên cấu hình URDF"
          onClose={() => {
            if (!busy) setRenaming(null);
          }}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveRename();
            }}
          >
            <label>
              Tên cấu hình *
              <input
                autoFocus
                value={renaming.name}
                onChange={(e) =>
                  setRenaming({ ...renaming, name: e.target.value })
                }
              />
            </label>
            <ErrorBox message={error} />
            <footer className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setRenaming(null)}
              >
                Hủy
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Đang lưu…" : "Lưu"}
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title={`Xóa URDF “${deleting.name}”?`}
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p>
            Thao tác này sẽ xóa cấu hình URDF cùng thư mục file trên đĩa. Không
            thể hoàn tác.
          </p>
          <ErrorBox message={error} />
          <footer className="modal-actions">
            <button disabled={busy} onClick={() => setDeleting(null)}>
              Hủy
            </button>
            <button className="danger" disabled={busy} onClick={confirmDelete}>
              {busy ? "Đang xóa…" : "Xóa URDF"}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}
