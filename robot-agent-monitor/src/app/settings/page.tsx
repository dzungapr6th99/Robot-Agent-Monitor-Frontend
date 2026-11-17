"use client";
import { baseUrl } from "../../lib/api";
import { useMonitor } from "../../components/monitor-provider";
import { ErrorBox } from "../../components/ui";
export default function Settings() {
  const m = useMonitor();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Application Settings</h1>
          <p>Connection settings</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <div className="form-stack">
          <label>
            API base URL
            <input readOnly value={baseUrl} />
          </label>
          <ErrorBox message={m.rosError} />
        </div>
      </section>
    </>
  );
}
