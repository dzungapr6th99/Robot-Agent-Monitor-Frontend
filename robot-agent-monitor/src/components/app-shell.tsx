"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Box,
  Camera,
  CircleDot,
  Cpu,
  Database,
  FileCode2,
  LayoutDashboard,
  MessageSquare,
  Settings,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useMonitor } from "./monitor-provider";
import { Badge } from "./ui";
const navigation = [
  ["/", "Overview", LayoutDashboard],
  ["/robots", "Robots", Box],
  ["/urdf-models", "URDF Models", FileCode2],
  ["/vla-models", "VLA Models", Cpu],
  ["/joints", "Joints", Activity],
  ["/sensors", "Sensors", Camera],
  ["/teleoperation", "Teleoperation", CircleDot],
  ["/chat", "Robot Chat", MessageSquare],
  ["/data", "Data", Database],
] as const;
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const m = useMonitor();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Box size={17} />
          </span>
          <span>Robot Agent Monitor</span>
        </Link>
        <nav aria-label="Main navigation">
          {navigation.map(([href, name, Icon]) => (
            <Link
              key={href}
              aria-label={name}
              title={name}
              className={path === href ? "nav-link active" : "nav-link"}
              href={href}
            >
              <Icon size={16} />
              <span>{name}</span>
            </Link>
          ))}
          <Link
            href="/settings"
            className="nav-link mobile-settings"
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={16} />
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <label className="selector-label" htmlFor="active-config">
            Active configuration
          </label>
          <select
            id="active-config"
            aria-label="Active configuration"
            value={m.configId || ""}
            onChange={(e) => m.selectConfig(Number(e.target.value) || null)}
          >
            <option value="">Select configuration</option>
            {m.data["robot-configurations"].map((c) => (
              <option key={c.id} value={c.id}>
                {
                  m.data["robot-profiles"].find(
                    (p) => p.id === c.robotProfileId,
                  )?.name
                }{" "}
                · {c.name}
              </option>
            ))}
          </select>
          <div className="connection">
            <span>Backend</span>
            <Badge tone={m.connected ? "green" : "red"}>
              {m.connected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
          <div className="connection">
            <span>ROS Runtime</span>
            <Badge tone={m.ros?.running ? "green" : "muted"}>
              {m.ros?.running
                ? "Available"
                : m.rosError
                  ? "Access required"
                  : "Unavailable"}
            </Badge>
          </div>
          <Link href="/settings" className="nav-link">
            <Settings size={15} />
            Settings
          </Link>
          <div className="version">v0.1.0 · local</div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            aria-label="Toggle sidebar"
            className="icon-button"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
          <span>{m.profile?.name || "No robot selected"}</span>
          <span className="muted">/</span>
          <span className="muted">{m.config?.name || "—"}</span>
          <div className="topbar-right">
            <Badge tone={m.fresh ? "green" : "muted"}>
              {m.fresh ? "Live state" : "No live state"}
            </Badge>
            <button
              className="icon-button"
              aria-label="Refresh data"
              onClick={m.refresh}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </header>
        <main>
          {m.error && (
            <div className="error-box">
              {m.error} <button onClick={m.refresh}>Retry</button>
            </div>
          )}
          {m.loading ? (
            <div className="loading" role="status">
              Connecting to Robot Agent…
            </div>
          ) : (
            children
          )}
        </main>
      </div>
      {m.notice && (
        <div className="toast" role="status">
          {m.notice}
        </div>
      )}
    </div>
  );
}
