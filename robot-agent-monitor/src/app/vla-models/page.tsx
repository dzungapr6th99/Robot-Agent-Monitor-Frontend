"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  Copy,
  Cpu,
  Pencil,
  Play,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useMonitor } from "../../components/monitor-provider";
import { Badge, Empty, ErrorBox, Modal, formatDate } from "../../components/ui";
import { uploadVlaPackage, vlaModels } from "../../lib/api";
import type { VlaManifest, VlaModel, VlaStatus } from "../../lib/types";

const ROS_IMAGE_TYPE = "sensor_msgs/msg/Image";

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

function parseManifest(model: VlaModel | null): VlaManifest | null {
  if (!model) return null;
  if (model.manifest) return model.manifest;
  if (model.manifestJson) {
    try {
      return JSON.parse(model.manifestJson) as VlaManifest;
    } catch {
      return null;
    }
  }
  return null;
}

function VlaModelsContent() {
  const m = useMonitor();
  const { selectConfig } = m;
  const searchParams = useSearchParams();
  const queryConfigRaw = searchParams.get("config");
  const queryConfigId = queryConfigRaw ? Number(queryConfigRaw) || null : null;

  const appliedQueryConfig = useRef<number | null>(null);
  useEffect(() => {
    if (queryConfigId && appliedQueryConfig.current !== queryConfigId) {
      appliedQueryConfig.current = queryConfigId;
      selectConfig(queryConfigId);
    }
  }, [queryConfigId, selectConfig]);

  const selectedConfigId = m.configId;

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [models, setModels] = useState<VlaModel[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<VlaStatus | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailModel, setDetailModel] = useState<VlaModel | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");

  const [editing, setEditing] = useState<{
    id: number;
    displayName: string;
    description: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<VlaModel | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchModels = useCallback(
    async (configId: number, q: string, signal?: AbortSignal) => {
      setLoadingList(true);
      setListError("");
      try {
        const rows = await vlaModels.list(
          { configurationId: configId, q },
          signal,
        );
        if (!signal?.aborted) {
          setModels(rows);
          setSelectedId((prev) =>
            prev && rows.some((r) => r.id === prev)
              ? prev
              : (rows[0]?.id ?? null),
          );
        }
      } catch (e) {
        if (!signal?.aborted) {
          setListError((e as Error).message);
        }
      } finally {
        if (!signal?.aborted) setLoadingList(false);
      }
    },
    [],
  );

  const fetchStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const s = await vlaModels.status(signal);
      if (!signal?.aborted) setRuntimeStatus(s);
    } catch {
      // Ignore transient status polling error.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => fetchStatus(controller.signal));
    return () => controller.abort();
  }, [fetchStatus]);

  useEffect(() => {
    if (!selectedConfigId) return;
    const controller = new AbortController();
    void Promise.resolve().then(() =>
      fetchModels(selectedConfigId, debouncedQuery, controller.signal),
    );
    return () => controller.abort();
  }, [selectedConfigId, debouncedQuery, fetchModels]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    vlaModels
      .get(selectedId, controller.signal)
      .then((row) => {
        if (!controller.signal.aborted) setDetailModel(row);
      })
      .catch(() => {
        // Fallback to list item data if detail fetch fails.
      });
    return () => controller.abort();
  }, [selectedId]);

  const activeDetail =
    detailModel && detailModel.id === selectedId
      ? detailModel
      : (models.find((row) => row.id === selectedId) ?? null);
  const activeManifest = useMemo(
    () => parseManifest(activeDetail),
    [activeDetail],
  );

  const cameraTopicMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!selectedConfigId) return map;
    for (const sensor of m.data.sensors) {
      if (sensor.robotConfigurationId !== selectedConfigId || !sensor.isEnabled)
        continue;
      const stream = m.data["sensor-streams"].find(
        (s) =>
          s.sensorId === sensor.id &&
          s.isEnabled &&
          s.dataType === ROS_IMAGE_TYPE &&
          s.topic.trim().length > 0,
      );
      if (stream && sensor.code) {
        map.set(sensor.code, stream.topic);
      }
    }
    return map;
  }, [m.data, selectedConfigId]);

  const handleSelectConfig = (nextId: number | null) => {
    selectConfig(nextId);
    setModels([]);
    setSelectedId(null);
    setDetailModel(null);
    setUploadError("");
    setListError("");
  };

  const handleUploadFile = async (file: File | undefined) => {
    if (!file || !selectedConfigId) return;
    setUploadError("");
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setUploadError("Gói model VLA phải có định dạng file .zip.");
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const created = await uploadVlaPackage(
        selectedConfigId,
        file,
        setUploadProgress,
      );
      m.notify(`Đã cài đặt model VLA “${created.displayName}”.`);
      await fetchModels(selectedConfigId, debouncedQuery);
      setSelectedId(created.id);
      await fetchStatus();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (uploading) return;
    const file = e.dataTransfer.files[0];
    void handleUploadFile(file);
  };

  const saveEdit = async () => {
    if (!editing || !selectedConfigId) return;
    setModalError("");
    if (!editing.displayName.trim()) {
      setModalError("Tên hiển thị không được để trống.");
      return;
    }
    setModalBusy(true);
    try {
      const updated = await vlaModels.update(editing.id, {
        displayName: editing.displayName.trim(),
        description: editing.description,
      });
      setModels((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (detailModel?.id === updated.id) setDetailModel(updated);
      setEditing(null);
      m.notify("Đã cập nhật thông tin model VLA.");
    } catch (e) {
      setModalError((e as Error).message);
    } finally {
      setModalBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || !selectedConfigId) return;
    setModalError("");
    setModalBusy(true);
    try {
      await vlaModels.remove(deleting.id);
      setDeleting(null);
      m.notify(`Đã xóa model VLA “${deleting.displayName}”.`);
      await fetchModels(selectedConfigId, debouncedQuery);
      await fetchStatus();
    } catch (e) {
      setModalError((e as Error).message);
    } finally {
      setModalBusy(false);
    }
  };

  const copySha = async (sha: string) => {
    try {
      await navigator.clipboard.writeText(sha);
      m.notify("Đã sao chép SHA-256.");
    } catch {
      m.notify(sha);
    }
  };

  const loadedModelName = useMemo(() => {
    if (!runtimeStatus?.loadedModelId) return null;
    const found = models.find((x) => x.id === runtimeStatus.loadedModelId);
    return found
      ? `${found.displayName} (#${found.id})`
      : `Model #${runtimeStatus.loadedModelId}`;
  }, [runtimeStatus, models]);

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>VLA Models</h1>
          <p>
            Quản lý, nạp gói ONNX `.zip` và tìm kiếm model VLA gắn với từng URDF
          </p>
        </div>
        <div className="button-row">
          <Badge tone={runtimeStatus?.running ? "amber" : "muted"}>
            <Cpu size={12} />
            {runtimeStatus?.loadedModelId
              ? `Đang nạp: ${loadedModelName}`
              : "Chưa nạp model"}
          </Badge>
          {runtimeStatus && runtimeStatus.providers.length > 0 && (
            <Badge tone="blue">
              Providers: {runtimeStatus.providers.join(", ")}
            </Badge>
          )}
        </div>
      </div>

      <section className="panel" style={{ padding: 16, marginBottom: 16 }}>
        <div className="model-toolbar" style={{ marginBottom: 0 }}>
          <label>
            Bước 1 — Chọn URDF
            <select
              aria-label="Chọn URDF"
              value={selectedConfigId ?? ""}
              onChange={(e) =>
                handleSelectConfig(Number(e.target.value) || null)
              }
            >
              <option value="">-- Chọn cấu hình URDF --</option>
              {m.data["robot-configurations"].map((c) => {
                const pName = m.data["robot-profiles"].find(
                  (p) => p.id === c.robotProfileId,
                )?.name;
                return (
                  <option key={c.id} value={c.id}>
                    {pName ? `${pName} · ` : ""}
                    {c.name}
                  </option>
                );
              })}
            </select>
          </label>
          <Link className="button" href="/urdf-models">
            Quản lý URDF Models
          </Link>
        </div>
      </section>

      {!selectedConfigId ? (
        <section className="panel">
          <Empty
            title="Chọn URDF trước"
            action={
              <Link className="button primary" href="/urdf-models">
                Đi tới URDF Models
              </Link>
            }
          >
            Mỗi model VLA được kiểm tra khớp joint và camera với một cấu hình
            URDF cụ thể. Hãy chọn URDF ở trên hoặc tạo mới tại trang URDF
            Models.
          </Empty>
        </section>
      ) : (
        <>
          <section className="panel" style={{ padding: 16, marginBottom: 16 }}>
            <div
              className="upload-zone"
              style={{ marginBottom: 0 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
            >
              <UploadCloud size={26} />
              <h3>Tải lên gói model VLA (.zip) cho URDF đang chọn</h3>
              <p>
                Kéo thả file `.zip` (formatVersion 1) chứa `manifest.json`,
                `model.onnx` và tokenizer/normalization tùy chọn.
              </p>
              <label className="button primary">
                {uploading ? `Đang tải lên (${uploadProgress}%)…` : "Chọn file .zip"}
                <input
                  type="file"
                  accept=".zip,application/zip"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void handleUploadFile(file);
                  }}
                  hidden
                />
              </label>
              {uploading && (
                <div style={{ width: "100%", maxWidth: 360 }}>
                  <div className="vla-progress" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className="vla-progress-bar"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="small muted">{uploadProgress}%</p>
                </div>
              )}
            </div>
            {uploadError && (
              <div style={{ marginTop: 12 }}>
                <ErrorBox message={uploadError} />
              </div>
            )}
          </section>

          <div className="vla-layout">
            <section className="panel">
              <div className="section-title">
                <h2>
                  Danh sách model VLA ({models.length})
                  {loadingList ? " · Đang tải…" : ""}
                </h2>
                <input
                  type="search"
                  aria-label="Tìm kiếm model VLA"
                  placeholder="Tìm theo tên, code, loại, version…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>

              {listError && (
                <div style={{ padding: 12 }}>
                  <ErrorBox message={listError} />
                </div>
              )}

              {models.length === 0 ? (
                <Empty
                  title={
                    debouncedQuery
                      ? "Không tìm thấy model VLA phù hợp"
                      : "URDF này chưa có model VLA nào"
                  }
                >
                  {debouncedQuery
                    ? "Thử từ khóa khác theo tên, code, loại hoặc version."
                    : "Kéo thả file gói .zip vào khung tải lên ở phía trên để cài đặt model đầu tiên."}
                </Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Tên</th>
                        <th>Code</th>
                        <th>Loại</th>
                        <th>Version</th>
                        <th>Số joint</th>
                        <th>Camera dùng</th>
                        <th>Dung lượng</th>
                        <th>SHA-256</th>
                        <th>Ngày cài</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {models.map((item) => {
                        const manifest = parseManifest(item);
                        const cameras = manifest
                          ? manifest.inputs
                              .filter((i) => i.kind === "image" && i.camera)
                              .map((i) => i.camera as string)
                          : [];
                        const isSelected = item.id === selectedId;
                        const isLoaded =
                          runtimeStatus?.loadedModelId === item.id;
                        return (
                          <tr
                            key={item.id}
                            className={isSelected ? "selected" : ""}
                            onClick={() => setSelectedId(item.id)}
                          >
                            <td>
                              <strong>{item.displayName}</strong>{" "}
                              {isLoaded && <Badge tone="green">Đang nạp</Badge>}
                            </td>
                            <td className="mono">{item.code}</td>
                            <td>
                              <Badge tone="blue">{item.modelType}</Badge>
                            </td>
                            <td className="mono">{item.version}</td>
                            <td>{manifest?.robot.jointNames.length ?? "—"}</td>
                            <td>
                              {cameras.length ? cameras.join(", ") : "Không"}
                            </td>
                            <td>{formatBytes(item.packageBytes)}</td>
                            <td>
                              <span className="sha-cell mono">
                                {item.packageSha256.slice(0, 12)}
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label={`Copy SHA-256 ${item.code}`}
                                  title="Sao chép SHA-256 đầy đủ"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void copySha(item.packageSha256);
                                  }}
                                >
                                  <Copy size={12} />
                                </button>
                              </span>
                            </td>
                            <td>{formatDate(item.createdAt)}</td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="button-row">
                                <Link
                                  className="button primary"
                                  href={`/chat?config=${selectedConfigId}&model=${item.id}`}
                                >
                                  <Play size={12} />
                                  Chạy
                                </Link>
                                <button
                                  aria-label={`Sửa ${item.displayName}`}
                                  onClick={() => {
                                    setModalError("");
                                    setEditing({
                                      id: item.id,
                                      displayName: item.displayName,
                                      description: item.description ?? "",
                                    });
                                  }}
                                >
                                  <Pencil size={12} />
                                  Sửa
                                </button>
                                <button
                                  className="danger-outline"
                                  aria-label={`Xóa ${item.displayName}`}
                                  onClick={() => {
                                    setModalError("");
                                    setDeleting(item);
                                  }}
                                >
                                  <Trash2 size={12} />
                                  Xóa
                                </button>
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

            <section className="panel">
              <div className="section-title">
                <h2>Chi tiết model</h2>
                {activeManifest && (
                  <Badge tone="muted">
                    formatVersion: {activeManifest.formatVersion}
                  </Badge>
                )}
              </div>
              {!activeDetail ? (
                <Empty title="Chọn một model">
                  Bấm vào một dòng trong bảng để xem danh sách joint, camera và
                  input/output của manifest.
                </Empty>
              ) : (
                <div className="vla-detail">
                  <div>
                    <h3>{activeDetail.displayName}</h3>
                    <p className="mono muted">
                      {activeDetail.code} · {activeDetail.modelType} ·{" "}
                      {activeDetail.version}
                    </p>
                    {activeDetail.description && (
                      <p style={{ marginTop: 6 }}>{activeDetail.description}</p>
                    )}
                  </div>

                  <div>
                    <p className="selector-label">
                      Joints ({activeManifest?.robot.jointNames.length ?? 0})
                    </p>
                    <div className="chip-list">
                      {(activeManifest?.robot.jointNames ?? []).map((joint) => (
                        <Badge key={joint} tone="muted">
                          {joint}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="selector-label">Camera & ROS Topic</p>
                    <div className="vla-detail-list">
                      {(activeManifest?.inputs ?? [])
                        .filter((i) => i.kind === "image")
                        .map((img) => {
                          const cam = img.camera ?? "";
                          const topic = cameraTopicMap.get(cam);
                          return (
                            <div key={img.name} className="vla-detail-row">
                              <div>
                                <strong>{cam}</strong>
                                <div className="mono muted">
                                  {topic ?? "Chưa gắn topic Image"}
                                </div>
                                <div className="small muted">
                                  {img.width}×{img.height} · {img.encoding} ·{" "}
                                  {img.layout} · {img.scale ?? "0_1"}
                                </div>
                              </div>
                              <Badge tone={topic ? "green" : "red"}>
                                {topic ? "Có trong sensors" : "Thiếu trong sensors"}
                              </Badge>
                            </div>
                          );
                        })}
                      {(activeManifest?.inputs ?? []).every(
                        (i) => i.kind !== "image",
                      ) && (
                        <p className="muted small">
                          Model không yêu cầu camera input.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="selector-label">
                      Inputs ({activeManifest?.inputs.length ?? 0})
                    </p>
                    <div className="vla-detail-list">
                      {(activeManifest?.inputs ?? []).map((inp) => (
                        <div key={inp.name} className="vla-detail-row">
                          <span className="mono">{inp.name}</span>
                          <span className="small muted">
                            {inp.kind}
                            {inp.dtype ? ` · ${inp.dtype}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="selector-label">
                      Outputs ({activeManifest?.outputs.length ?? 0})
                    </p>
                    <div className="vla-detail-list">
                      {(activeManifest?.outputs ?? []).map((out) => (
                        <div key={out.name} className="vla-detail-row">
                          <span className="mono">{out.name}</span>
                          <span className="small muted">
                            {out.kind}
                            {out.dtype ? ` · ${out.dtype}` : ""}
                            {out.optional ? " · optional" : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="selector-label">SHA-256</p>
                    <code>{activeDetail.packageSha256}</code>
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      {editing && (
        <Modal
          title="Sửa thông tin model VLA"
          onClose={() => {
            if (!modalBusy) setEditing(null);
          }}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <label>
              Tên hiển thị *
              <input
                autoFocus
                value={editing.displayName}
                onChange={(e) =>
                  setEditing({ ...editing, displayName: e.target.value })
                }
              />
            </label>
            <label>
              Mô tả
              <textarea
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
            <ErrorBox message={modalError} />
            <footer className="modal-actions">
              <button
                type="button"
                disabled={modalBusy}
                onClick={() => setEditing(null)}
              >
                Hủy
              </button>
              <button className="primary" disabled={modalBusy}>
                {modalBusy ? "Đang lưu…" : "Lưu"}
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title={`Xóa model VLA “${deleting.displayName}”?`}
          onClose={() => {
            if (!modalBusy) setDeleting(null);
          }}
        >
          <p>
            Xóa model <strong>{deleting.code}</strong> ({deleting.version}) khỏi
            cơ sở dữ liệu và thư mục lưu trữ trên đĩa. Không thể xóa nếu model
            đang nạp hoặc đang chạy.
          </p>
          <ErrorBox message={modalError} />
          <footer className="modal-actions">
            <button disabled={modalBusy} onClick={() => setDeleting(null)}>
              Hủy
            </button>
            <button
              className="danger"
              disabled={modalBusy}
              onClick={confirmDelete}
            >
              {modalBusy ? "Đang xóa…" : "Xóa model"}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}

export default function VlaModelsPage() {
  return (
    <Suspense fallback={<div className="loading">Đang tải VLA Models…</div>}>
      <VlaModelsContent />
    </Suspense>
  );
}
