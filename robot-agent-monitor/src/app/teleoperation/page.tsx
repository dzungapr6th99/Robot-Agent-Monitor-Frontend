"use client";
import Link from "next/link";
import { useMonitor } from "../../components/monitor-provider";
import { JointControl } from "../../components/joint-control";
import { RobotViewer } from "../../components/robot-viewer";
import { Badge, Empty } from "../../components/ui";
export default function Teleoperation() {
  const m = useMonitor();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Teleoperation</h1>
          <p>Bounded joint targets through the configured default publisher</p>
        </div>
        <Link className="button" href="/joints?tab=interfaces">
          Configure interface
        </Link>
      </div>
      {m.rosError && (
        <div className="warning">
          {m.rosError} <Link href="/settings">Realtime settings</Link>
        </div>
      )}
      {!m.model ? (
        <section className="panel">
          <Empty
            title="Load a robot configuration first"
            action={
              <Link className="button primary" href="/robots">
                Open Robots
              </Link>
            }
          />
        </section>
      ) : (
        <div className="teleop-workspace">
          <section className="panel teleop-pose">
            <div className="section-title">
              <h2>Robot pose</h2>
              <Badge tone={m.fresh ? "green" : "amber"}>
                {m.fresh
                  ? "Live"
                  : m.jointState
                    ? "Stale"
                    : "Waiting for joint state"}
              </Badge>
            </div>
            <RobotViewer />
          </section>
          <div className="control-grid">
            {m.model.joints
              .filter((j) => ["revolute", "prismatic"].includes(j.type))
              .map((j) => (
                <section key={`${m.configId}:${j.name}`} className="panel">
                  <JointControl joint={j} />
                </section>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
