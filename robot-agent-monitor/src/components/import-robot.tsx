"use client";
import Link from "next/link";
import { unzipSync } from "fflate";
import { useState, type InputHTMLAttributes } from "react";
import { UploadCloud, FileCode2, CheckCircle2, FolderOpen } from "lucide-react";
import { request, write } from "../lib/api";
import { parseUrdf } from "../lib/urdf";
import type { RobotModel } from "../lib/types";
import { useMonitor } from "./monitor-provider";
import { ErrorBox, Modal } from "./ui";
export function ImportRobot({
  onClose,
  profileId,
}: {
  onClose: () => void;
  profileId?: number;
}) {
  const m = useMonitor();
  const [step, setStep] = useState(1),
    [mode, setMode] = useState(
      profileId
        ? "existing"
        : m.data["robot-profiles"].length
          ? "existing"
          : "new",
    );
  const [profile, setProfile] = useState(
      profileId || m.data["robot-profiles"][0]?.id || 0,
    ),
    [profileName, setProfileName] = useState(""),
    [description, setDescription] = useState(""),
    [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]),
    [main, setMain] = useState(""),
    [model, setModel] = useState<RobotModel | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [createdProfile, setCreatedProfile] = useState<number | null>(null);
  const path = (file: File) => file.webkitRelativePath || file.name;
  const urdfs = files.filter((f) => /\.(urdf|xml)$/i.test(f.name));
  const maxBytes = Number(process.env.NEXT_PUBLIC_URDF_MAX_BYTES);
  const choose = async (input: File[]) => {
    try {
      const chosen: File[] = [];
      for (const file of input) {
        if (/\.zip$/i.test(file.name)) {
          if (file.size > maxBytes)
            throw new Error("ZIP archive exceeds the package size limit.");
          let total = 0,
            count = 0;
          const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
            filter: (entry) => {
              if (entry.name.endsWith("/")) return false;
              total += entry.originalSize;
              if (total > maxBytes || ++count > 500)
                throw new Error(
                  "Expanded ZIP exceeds the package limit (500 files).",
                );
              return true;
            },
          });
          for (const [name, data] of Object.entries(entries)) {
            if (
              name.startsWith("/") ||
              name.includes("\\") ||
              name.includes(":") ||
              name.split("/").some((part) => part === ".." || part === ".")
            )
              throw new Error("ZIP contains an invalid file path.");
            chosen.push(new File([data.slice().buffer as ArrayBuffer], name));
          }
        } else chosen.push(file);
      }
      if (new Set(chosen.map(path)).size !== chosen.length)
        throw new Error("Duplicate file paths in package.");
      setFiles(chosen);
      setMain(
        chosen.find((f) => /\.(urdf|xml)$/i.test(f.name))
          ? path(chosen.find((f) => /\.(urdf|xml)$/i.test(f.name))!)
          : "",
      );
      setModel(null);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const next = async () => {
    setError("");
    try {
      if (step === 1) {
        if (mode === "new" && !profileName.trim())
          throw new Error("Profile name is required.");
        if (
          mode === "new" &&
          m.data["robot-profiles"].some(
            (p) => p.name.toLowerCase() === profileName.trim().toLowerCase(),
          )
        )
          throw new Error("A profile with this name already exists.");
        if (mode === "existing" && !profile)
          throw new Error("Select a profile.");
      }
      if (step === 2) {
        if (!name.trim()) throw new Error("Configuration name is required.");
        if (
          m.data["robot-configurations"].some(
            (c) =>
              c.robotProfileId === profile &&
              c.name.toLowerCase() === name.trim().toLowerCase(),
          ) &&
          mode === "existing"
        )
          throw new Error(
            "Configuration name must be unique within this profile.",
          );
      }
      if (step === 3) {
        if (!main) throw new Error("Select a main .urdf or .xml file.");
        if (files.length > 500)
          throw new Error("Choose at most 500 files per package.");
        const bad = files.find(
          (f) =>
            !/\.(urdf|xml|stl|dae|obj|mtl|png|jpe?g|glb|gltf|bin)$/i.test(
              f.name,
            ),
        );
        if (bad)
          throw new Error(
            `Unsupported file: ${path(bad)}. Remove it before importing.`,
          );
        if (files.reduce((sum, f) => sum + f.size, 0) > maxBytes)
          throw new Error("Package exceeds the configured upload limit.");
        setModel(parseUrdf(await files.find((f) => path(f) === main)!.text()));
      }
      if (step === 4) {
        setBusy(true);
        let id = createdProfile || profile;
        if (mode === "new" && !createdProfile) {
          const result = await write("robot-profiles", "create", {
            name: profileName.trim(),
            description: description.trim(),
          });
          if (!result.recordId)
            throw new Error("Backend did not return a profile ID.");
          id = result.recordId;
          setCreatedProfile(id);
        }
        const form = new FormData();
        form.append("RequestId", crypto.randomUUID());
        form.append("Data.RobotProfileId", String(id));
        form.append("Data.Name", name.trim());
        const mainFile = files.find((f) => path(f) === main)!;
        form.append("AttachFiles", mainFile, main);
        files
          .filter((f) => f !== mainFile)
          .forEach((file) => form.append("AssetFiles", file, path(file)));
        const result = await request<{ recordId: number }>(
          "/api/v1/robot-configurations/create",
          { method: "POST", body: form },
        );
        await m.refresh();
        m.selectConfig(result.recordId);
        m.notify("Robot configuration imported.");
      }
      setStep(step + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Import Robot"
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="wizard-steps">
        {["Profile", "Configuration", "Upload", "Parse", "Complete"].map(
          (label, i) => (
            <div
              key={label}
              className={
                step === i + 1 ? "current" : step > i + 1 ? "done" : ""
              }
            >
              <b>{step > i + 1 ? "✓" : i + 1}</b>
              {label}
            </div>
          ),
        )}
      </div>
      <ErrorBox message={error} />
      {step === 1 && (
        <div className="form-stack">
          <div className="segmented">
            <button
              className={mode === "existing" ? "selected" : ""}
              onClick={() => setMode("existing")}
            >
              Use existing profile
            </button>
            <button
              className={mode === "new" ? "selected" : ""}
              onClick={() => setMode("new")}
            >
              Create new profile
            </button>
          </div>
          {mode === "existing" ? (
            <label>
              Profile
              <select
                value={profile}
                onChange={(e) => setProfile(Number(e.target.value))}
              >
                <option value={0}>Select profile</option>
                {m.data["robot-profiles"].map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                Name *
                <input
                  autoFocus
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </label>
              <label>
                Description
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </>
          )}
        </div>
      )}
      {step === 2 && (
        <div className="form-stack">
          <p className="muted">
            Configuration for{" "}
            <strong>
              {mode === "new"
                ? profileName
                : m.data["robot-profiles"].find((p) => p.id === profile)?.name}
            </strong>
          </p>
          <label>
            Name *
            <input
              autoFocus
              placeholder="e.g. Stock, Wrist RGB-D Camera"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
      )}
      {step === 3 && (
        <>
          <div
            className="upload-zone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              choose(Array.from(e.dataTransfer.files));
            }}
          >
            <UploadCloud size={30} />
            <h3>Upload your robot package</h3>
            <p>
              URDF, meshes or ZIP · Up to {Math.round(maxBytes / 1048576)} MB
              total
            </p>
            <div className="button-row">
              <label className="button primary">
                <FileCode2 size={14} />
                Browse files
                <input
                  type="file"
                  multiple
                  onChange={(e) => choose(Array.from(e.target.files || []))}
                  hidden
                />
              </label>
              <label className="button">
                <FolderOpen size={14} />
                Browse folder
                <input
                  type="file"
                  multiple
                  {...({
                    webkitdirectory: "",
                  } as InputHTMLAttributes<HTMLInputElement>)}
                  onChange={(e) => choose(Array.from(e.target.files || []))}
                  hidden
                />
              </label>
            </div>
          </div>
          {files.length > 0 && (
            <>
              <label>
                Main URDF
                <select
                  aria-label="Main URDF"
                  value={main}
                  onChange={(e) => setMain(e.target.value)}
                >
                  {urdfs.map((f) => (
                    <option key={path(f)} value={path(f)}>
                      {path(f)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="file-tree">
                {files.map((f) => (
                  <div key={path(f)}>
                    <FileCode2 size={12} />
                    <span>{path(f)}</span>
                    <small>{(f.size / 1024).toFixed(1)} KB</small>
                    <button
                      type="button"
                      aria-label={`Remove file ${path(f)}`}
                      onClick={() => {
                        const remaining = files.filter((file) => file !== f);
                        setFiles(remaining);
                        if (main === path(f))
                          setMain(
                            remaining.find((file) =>
                              /\.(urdf|xml)$/i.test(file.name),
                            )
                              ? path(
                                  remaining.find((file) =>
                                    /\.(urdf|xml)$/i.test(file.name),
                                  )!,
                                )
                              : "",
                          );
                        setError("");
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {step === 4 && model && (
        <div className="parse-result">
          <CheckCircle2 size={32} />
          <h3>Parsing complete</h3>
          <p className="mono">{model.name}</p>
          <p>
            {model.links.length} links · {model.joints.length} joints
          </p>
          <p className="muted">
            The package will be saved when you click Import.
          </p>
        </div>
      )}
      {step === 5 && (
        <div className="parse-result">
          <CheckCircle2 size={36} />
          <h3>Robot ready to open.</h3>
          <p>
            {name} · {model?.links.length} links · {model?.joints.length} joints
          </p>
          <div className="button-row">
            <button className="primary" onClick={onClose}>
              Open Robot
            </button>
            <Link
              className="button"
              onClick={onClose}
              href="/joints?tab=interfaces"
            >
              Configure Joint Interfaces
            </Link>
          </div>
        </div>
      )}
      {step < 5 && (
        <footer className="modal-actions">
          <button
            disabled={step === 1 || busy}
            onClick={() => {
              setStep(step - 1);
              setError("");
            }}
          >
            Back
          </button>
          <span className="spacer" />
          <button className="primary" disabled={busy} onClick={next}>
            {busy ? "Importing…" : step === 4 ? "Import" : "Next"}
          </button>
        </footer>
      )}
    </Modal>
  );
}
