import { ApiError, baseUrl } from "./api";
import type { RosMessage, RosStatus } from "./types";

type Frame =
  | { type: "status"; data: RosStatus }
  | { type: "ros_message"; data: RosMessage }
  | { type: "messages_dropped"; count: number }
  | { type: "publish_result"; id: number; status: number }
  | { type: "error"; message: string };

type PublishRequest = { topic: string; messageType: string; data: object };
type PendingPublish = {
  finish: (error?: Error) => void;
};

export class RosSocket {
  private socket: WebSocket;
  private ready = false;
  private nextId = 0;
  private pending = new Map<number, PendingPublish>();

  constructor(
    onFrame: (frame: Frame) => void,
    onClose: (event: CloseEvent) => void,
  ) {
    const url = new URL(baseUrl + "/api/ros/ws", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(url);
    this.socket.onmessage = ({ data }) => {
      let frame: Frame;
      try {
        frame = JSON.parse(data) as Frame;
      } catch {
        this.socket.close();
        return;
      }
      if (frame.type === "status") this.ready = true;
      if (frame.type === "publish_result") {
        this.pending
          .get(frame.id)
          ?.finish(
            frame.status === 204
              ? undefined
              : new ApiError(
                  `ROS publish failed (${frame.status})`,
                  frame.status,
                ),
          );
        return;
      }
      onFrame(frame);
    };
    this.socket.onclose = (event) => {
      this.failPending();
      onClose(event);
    };
  }

  publish(request: PublishRequest): Promise<void> {
    if (!this.ready || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("ROS WebSocket is disconnected."));
    }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        this.pending.delete(id);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(
        () => finish(new Error("ROS publish confirmation timed out.")),
        5000,
      );
      this.pending.set(id, { finish });
      try {
        this.socket.send(JSON.stringify({ type: "publish", id, ...request }));
      } catch (error) {
        finish(error as Error);
      }
    });
  }

  close() {
    this.failPending();
    this.socket.close();
  }

  private failPending() {
    this.ready = false;
    for (const pending of this.pending.values()) {
      pending.finish(
        new Error("ROS WebSocket disconnected before confirmation."),
      );
    }
  }
}
