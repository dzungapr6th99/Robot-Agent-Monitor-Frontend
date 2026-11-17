"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { baseUrl, list, request } from "../lib/api";
import { RosSocket } from "../lib/ros-socket";
import { assetUrl, parseUrdf } from "../lib/urdf";
import type {
  JointState,
  Resources,
  RobotModel,
  RosMessage,
  RosStatus,
} from "../lib/types";
const empty: Resources = {
  "robot-profiles": [],
  "robot-configurations": [],
  "joint-interfaces": [],
  "joint-groups": [],
  "joint-group-members": [],
  sensors: [],
  "sensor-streams": [],
  episodes: [],
};
const subscribeConfiguration = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("robot-config-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("robot-config-changed", callback);
  };
};
const configurationSnapshot = () =>
  Number(localStorage.getItem("robot-monitor-configuration")) || null;
function useMonitorState() {
  const [data, setData] = useState<Resources>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [ros, setRos] = useState<RosStatus | null>(null);
  const [rosError, setRosError] = useState("");
  const configId = useSyncExternalStore(
    subscribeConfiguration,
    configurationSnapshot,
    () => null,
  );
  const [loaded, setLoaded] = useState<{
    key: string;
    model: RobotModel | null;
    error: string;
  }>({ key: "", model: null, error: "" });
  const [modelVersion, setModelVersion] = useState(0);
  const [clock, setClock] = useState(0);
  const [samples, setSamples] = useState<
    Record<string, { message: RosMessage; time: number }>
  >({});
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [notice, setNotice] = useState("");
  const rosSocket = useRef<RosSocket | null>(null);
  const mounted = useRef(true);
  const refreshVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const keys = Object.keys(empty) as (keyof Resources)[];
      const values = await Promise.all(keys.map((key) => list(key)));
      if (!mounted.current || version !== refreshVersion.current) return;
      setData(
        Object.fromEntries(
          keys.map((key, i) => [key, values[i]]),
        ) as unknown as Resources,
      );
      setConnected(true);
      setError("");
    } catch (e) {
      if (mounted.current && version === refreshVersion.current) {
        setError((e as Error).message);
        setConnected(false);
      }
    } finally {
      if (mounted.current && version === refreshVersion.current)
        setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(refresh);
    const timer = setInterval(refresh, 15000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [refresh]);
  const selectConfig = useCallback((id: number | null) => {
    localStorage.setItem("robot-monitor-configuration", id ? String(id) : "");
    window.dispatchEvent(new Event("robot-config-changed"));
    setHistory({});
  }, []);
  const config =
    data["robot-configurations"].find((c) => c.id === configId) || null;
  const profile =
    data["robot-profiles"].find((p) => p.id === config?.robotProfileId) || null;
  const interfaces = data["joint-interfaces"].filter(
    (i) => i.robotConfigurationId === config?.id,
  );
  const stateTopic = interfaces.find(
    (i) =>
      i.isEnabled &&
      i.operation === "subscribe" &&
      i.dataType === "sensor_msgs/msg/JointState",
  )?.rosEndpoint;
  const stateTopicRef = useRef(stateTopic);
  useEffect(() => {
    stateTopicRef.current = stateTopic;
  }, [stateTopic]);
  useEffect(() => {
    const abort = new AbortController();
    let retry: ReturnType<typeof setTimeout>;
    let healthBusy = false;
    const health = async () => {
      if (healthBusy) return;
      healthBusy = true;
      try {
        await request("/api/health", { signal: abort.signal });
        setConnected(true);
      } catch {
        if (!abort.signal.aborted) setConnected(false);
      }
      healthBusy = false;
    };
    const connect = () => {
      rosSocket.current = new RosSocket(
        (frame) => {
          if (abort.signal.aborted) return;
          if (frame.type === "status") {
            setRos(frame.data);
            setRosError("");
          } else if (frame.type === "ros_message") {
            const message = frame.data;
            const time = Date.now();
            setSamples((prev) => ({
              ...prev,
              [message.topic]: { message, time },
            }));
            if (
              message.messageType === "sensor_msgs/msg/JointState" &&
              message.topic === stateTopicRef.current
            ) {
              const state = message.data as unknown as JointState;
              if (Array.isArray(state.name) && Array.isArray(state.position))
                setHistory((prev) => {
                  const next = { ...prev };
                  state.name.forEach((name, i) => {
                    if (Number.isFinite(state.position[i]))
                      next[name] = [
                        ...(prev[name] || []),
                        state.position[i],
                      ].slice(-120);
                  });
                  return next;
                });
            }
          } else if (frame.type === "messages_dropped") {
            setNotice(`Realtime buffer dropped ${frame.count} messages.`);
          } else if (frame.type === "error") {
            setNotice(frame.message);
          }
        },
        (event) => {
          if (abort.signal.aborted) return;
          rosSocket.current = null;
          setRos(null);
          setRosError(event.reason || "ROS WebSocket disconnected.");
          retry = setTimeout(connect, 3000);
        },
      );
    };
    void health();
    void Promise.resolve().then(() => {
      if (!abort.signal.aborted) connect();
    });
    const timer = setInterval(health, 5000);
    return () => {
      abort.abort();
      rosSocket.current?.close();
      rosSocket.current = null;
      clearInterval(timer);
      clearTimeout(retry);
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const modelKey = `${config?.id}:${config?.urdfPath}:${modelVersion}`;
  const model = loaded.key === modelKey ? loaded.model : null;
  const modelError = loaded.key === modelKey ? loaded.error : "";
  useEffect(() => {
    const abort = new AbortController();
    if (config?.urdfPath) {
      const url = baseUrl + assetUrl(config.id, config.urdfPath);
      fetch(url, { signal: abort.signal })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(`URDF unavailable (${response.status})`);
          return response.text();
        })
        .then(async (xml) => {
          const assets = await request<string[]>(
            `/api/v1/robot-configurations/${config.id}/manifest`,
            { signal: abort.signal },
          );
          if (!abort.signal.aborted)
            setLoaded({
              key: modelKey,
              model: { ...parseUrdf(xml, url), assets },
              error: "",
            });
        })
        .catch((e) => {
          if (!abort.signal.aborted)
            setLoaded({ key: modelKey, model: null, error: e.message });
        });
    }
    return () => abort.abort();
  }, [config?.id, config?.urdfPath, modelKey]);
  const sample = stateTopic ? samples[stateTopic] : undefined;
  const jointState =
    sample?.message.messageType === "sensor_msgs/msg/JointState"
      ? (sample.message.data as unknown as JointState)
      : null;
  const fresh = !!jointState && !!sample && clock - sample.time < 3000;
  return {
    data,
    loading,
    error,
    connected,
    ros,
    rosError,
    config,
    profile,
    interfaces,
    configId,
    selectConfig,
    model,
    modelError,
    reloadModel: () => setModelVersion((v) => v + 1),
    refresh,
    samples,
    history,
    jointState,
    stateTime: sample?.time,
    fresh,
    clock,
    notice,
    notify: setNotice,
    publish: (command: Parameters<RosSocket["publish"]>[0]) =>
      rosSocket.current?.publish(command) ??
      Promise.reject(new Error("ROS WebSocket is disconnected.")),
  };
}
type Monitor = ReturnType<typeof useMonitorState>;
const Context = createContext<Monitor | null>(null);
export function MonitorProvider({ children }: { children: ReactNode }) {
  const state = useMonitorState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useMonitor() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing MonitorProvider");
  return value;
}
