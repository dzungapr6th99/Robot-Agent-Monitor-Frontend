"""Run browser integration checks against an isolated Rust agent + SQLite fixture.
Requires cargo build -p robot-agent and npm install + npx playwright install chromium.
The fixture is test-only and never opens an existing database.
"""
from contextlib import closing
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RUST = ROOT.parents[1] / "Robot-Agent-Monitor-Rust"
TABLES = {
 "robot_profiles": "name TEXT NOT NULL UNIQUE, description TEXT",
 "robot_configurations": "robot_profile_id INTEGER NOT NULL REFERENCES robot_profiles(id) ON DELETE RESTRICT, name TEXT NOT NULL, urdf_path TEXT NOT NULL, UNIQUE(robot_profile_id,name)",
 "joint_interfaces": "robot_configuration_id INTEGER NOT NULL REFERENCES robot_configurations(id) ON DELETE CASCADE, name TEXT NOT NULL, operation TEXT, ros_endpoint TEXT, data_type TEXT, is_enabled INTEGER, is_default_command INTEGER",
 "joint_groups": "robot_configuration_id INTEGER NOT NULL REFERENCES robot_configurations(id) ON DELETE CASCADE, name TEXT NOT NULL, display_name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0",
 "joint_group_members": "joint_group_id INTEGER NOT NULL REFERENCES joint_groups(id) ON DELETE CASCADE, joint_name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(joint_group_id,joint_name)",
 "sensors": "robot_configuration_id INTEGER NOT NULL REFERENCES robot_configurations(id) ON DELETE CASCADE, code TEXT, display_name TEXT, sensor_type TEXT, is_enabled INTEGER, UNIQUE(robot_configuration_id,code)",
 "sensor_streams": "sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE, role TEXT, topic TEXT, data_type TEXT, is_enabled INTEGER",
 "pose_presets": "robot_configuration_id INTEGER REFERENCES robot_configurations(id) ON DELETE CASCADE, name TEXT, description TEXT",
 "pose_preset_joints": "pose_preset_id INTEGER REFERENCES pose_presets(id) ON DELETE CASCADE, joint_name TEXT, position REAL, sort_order INTEGER NOT NULL DEFAULT 0",
 "episodes": "robot_configuration_id INTEGER NOT NULL REFERENCES robot_configurations(id) ON DELETE RESTRICT, name TEXT NOT NULL, task TEXT, status TEXT, result TEXT, recording_path TEXT, operator_note TEXT, started_at TEXT, ended_at TEXT, duration_ns INTEGER",
 "episode_annotations": "episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE, start_ns INTEGER, end_ns INTEGER, label TEXT, note TEXT",
}
def wait(port, process):
 for _ in range(180):
  if process.poll() is not None: raise RuntimeError(f"Server exited: {process.returncode}")
  try:
   with socket.create_connection(("127.0.0.1",port),timeout=0.3): return
  except OSError: time.sleep(0.5)
 raise TimeoutError(f"Server {port} did not start")

def main():
 flags = getattr(subprocess,"CREATE_NO_WINDOW",0)
 with tempfile.TemporaryDirectory(prefix="robot-frontend-e2e-") as directory:
  temp=Path(directory); db=temp/"fixture.db"
  with closing(sqlite3.connect(db)) as con, con:
   for table, fields in TABLES.items():
    # Put timestamp columns before table-level constraints.
    parts=fields.split(", UNIQUE("); columns=parts[0]; constraint=", UNIQUE("+parts[1] if len(parts)>1 else ""
    con.execute(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY, {columns}, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP{constraint})")
  env=dict(os.environ,ROBOT_AGENT_DATABASE=str(db),URDF_DATA_ROOT=str(temp/"assets"),ROS_ENABLED="false",REALTIME_AUTHORITY="",AGENT_LISTEN="127.0.0.1:18080",BACKEND_URL="http://127.0.0.1:18080",NEXT_TELEMETRY_DISABLED="1")
  for key in ["ROBOT_CONFIGURATION_ID"]: env.pop(key,None)
  processes=[]
  logs=ROOT/".e2e-logs";logs.mkdir(exist_ok=True)
  try:
   with (logs/"backend.log").open("wb") as back_log,(logs/"frontend.log").open("wb") as front_log:
    backend=subprocess.Popen([str(RUST/"target/debug/robot-agent.exe")],cwd=RUST,env=env,stdout=back_log,stderr=back_log,creationflags=flags);processes.append(backend);wait(18080,backend)
    frontend=subprocess.Popen(["node",str(ROOT/"node_modules/next/dist/bin/next"),"dev","--port","3100"],cwd=ROOT,env=env,stdout=front_log,stderr=front_log,creationflags=flags);processes.append(frontend);wait(3100,frontend)
    result=subprocess.run(["node",str(ROOT/"node_modules/@playwright/test/cli.js"),"test"],cwd=ROOT,env=env,creationflags=flags,capture_output=True,text=True,encoding="utf-8",errors="replace")
    print(result.stdout,flush=True); print(result.stderr,flush=True)
    (logs/"results.txt").write_text(result.stdout+result.stderr,encoding="utf-8")
    return result.returncode
  finally:
   for process in reversed(processes):
    subprocess.run(["taskkill","/PID",str(process.pid),"/T","/F"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=flags)
   for process in processes: process.wait(timeout=10)
if __name__=="__main__":raise SystemExit(main())
