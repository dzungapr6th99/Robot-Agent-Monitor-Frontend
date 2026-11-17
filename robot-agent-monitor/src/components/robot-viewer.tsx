"use client";
import { useEffect, useRef, useState } from "react";
import { Maximize, RotateCcw, Box, Axis3D, Grid3X3 } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import URDFLoader, { type URDFRobot } from "urdf-loader";
import { useMonitor } from "./monitor-provider";
import { Empty } from "./ui";

export function RobotViewer({
  onSelect,
}: {
  onSelect?: (name: string) => void;
}) {
  const m = useMonitor();
  const container = useRef<HTMLDivElement>(null);
  const robotRef = useRef<URDFRobot | null>(null);
  const stateRef = useRef(m.jointState);
  const callbackRef = useRef(onSelect);
  const resetRef = useRef<() => void>(() => {});
  const [visual, setVisual] = useState(true),
    [collision, setCollision] = useState(false),
    [axes, setAxes] = useState(false),
    [grid, setGrid] = useState(true);
  const [error, setError] = useState("");
  const options = useRef({ visual, collision, axes, grid });
  useEffect(() => {
    stateRef.current = m.jointState;
  }, [m.jointState]);
  useEffect(() => {
    callbackRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    options.current = { visual, collision, axes, grid };
  }, [visual, collision, axes, grid]);
  // The imperative WebGL renderer can fail during setup; report that external failure in React.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const host = container.current;
    if (!host || !m.model) return;
    let disposed = false,
      frame = 0;
    const model = m.model;
    setError("");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0d1116");
    scene.up.set(0, 0, 1);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 2000);
    camera.up.set(0, 0, 1);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setError(
        "WebGL is unavailable. Enable hardware acceleration to view the robot.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xc7dfff, 0x344354, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(3, -4, 6);
    scene.add(light);
    const floor = new THREE.GridHelper(10, 40, 0x293e54, 0x1b2733);
    floor.rotation.x = Math.PI / 2;
    scene.add(floor);
    const worldAxes = new THREE.AxesHelper(0.35);
    scene.add(worldAxes);
    const disposeObject = (object: THREE.Object3D) =>
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        if (mesh.material) {
          for (const mat of Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]) {
            const textured = mat as THREE.MeshStandardMaterial;
            textured.map?.dispose();
            mat.dispose();
          }
        }
      });
    const manager = new THREE.LoadingManager();
    manager.onError = (url) => {
      if (!disposed)
        setError(
          `Mesh or texture could not load: ${decodeURIComponent(url.split("/").pop() || url)}`,
        );
    };
    const loader = new URDFLoader(manager);
    loader.parseCollision = true;
    const rootUrl = model.url.slice(0, model.url.indexOf("/assets/") + 8);
    const relative = decodeURIComponent(model.url.slice(rootUrl.length));
    loader.packages = (pkg) => {
      const reference = Array.from(
        model.xml.matchAll(/package:\/\/([^/]+)\/([^"<>\s]+)/g),
      ).find((match) => match[1] === pkg);
      if (reference) {
        const suffix = reference[2];
        const exact = model.assets.find(
          (name) =>
            name.endsWith(`/${pkg}/${suffix}`) || name === `${pkg}/${suffix}`,
        );
        const candidates = model.assets.filter(
          (name) => name.endsWith(`/${suffix}`) || name === suffix,
        );
        const match =
          exact || (candidates.length === 1 ? candidates[0] : undefined);
        if (match)
          return (
            rootUrl +
            match
              .slice(0, -suffix.length)
              .split("/")
              .map(encodeURIComponent)
              .join("/")
          );
      }
      const segments = relative.split("/");
      const index = segments.indexOf(pkg);
      return index >= 0
        ? rootUrl +
            segments
              .slice(0, index + 1)
              .map(encodeURIComponent)
              .join("/") +
            "/"
        : rootUrl + encodeURIComponent(pkg) + "/";
    };
    loader.workingPath = model.url.slice(0, model.url.lastIndexOf("/") + 1);
    try {
      const robot = loader.parse(model.xml);
      robotRef.current = robot;
      scene.add(robot);
      manager.onLoad = () => {
        if (!disposed) resetRef.current();
        else disposeObject(robot);
      };
      const frameAxes: THREE.AxesHelper[] = [];
      Object.values(robot.links).forEach((link) => {
        const helper = new THREE.AxesHelper(0.07);
        helper.userData.viewerAxis = true;
        link.add(helper);
        frameAxes.push(helper);
      });
      resetRef.current = () => {
        robot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(robot);
        const size = box.getSize(new THREE.Vector3()).length() || 1;
        const target = box.isEmpty()
          ? new THREE.Vector3(0, 0, 0.5)
          : box.getCenter(new THREE.Vector3());
        controls.target.copy(target);
        camera.position
          .copy(target)
          .add(new THREE.Vector3(size * 1.4, -size * 1.7, size * 0.9));
        camera.near = Math.max(size / 1000, 0.001);
        camera.far = size * 100 + 100;
        camera.updateProjectionMatrix();
        controls.update();
      };
      resetRef.current();
      const raycaster = new THREE.Raycaster();
      let pointerDown = { x: 0, y: 0 };
      const down = (e: PointerEvent) => {
        pointerDown = { x: e.clientX, y: e.clientY };
      };
      const pick = (e: PointerEvent) => {
        if (
          Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 5
        )
          return;
        const rect = renderer.domElement.getBoundingClientRect();
        raycaster.setFromCamera(
          new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            (-(e.clientY - rect.top) / rect.height) * 2 + 1,
          ),
          camera,
        );
        let object = raycaster
          .intersectObject(robot, true)
          .find((hit) => hit.object.visible)?.object;
        while (object && object !== robot) {
          const joint = model.joints.find(
            (j) => j.child === object?.name || j.name === object?.name,
          );
          if (joint) {
            callbackRef.current?.(joint.name);
            break;
          }
          object = object.parent || undefined;
        }
      };
      renderer.domElement.addEventListener("pointerdown", down);
      renderer.domElement.addEventListener("pointerup", pick);
      const resize = new ResizeObserver(() => {
        const w = host.clientWidth,
          h = host.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / Math.max(h, 1);
        camera.updateProjectionMatrix();
      });
      resize.observe(host);
      const animate = () => {
        if (disposed) return;
        frame = requestAnimationFrame(animate);
        const state = stateRef.current;
        if (state?.name)
          state.name.forEach((name, i) => {
            if (Number.isFinite(state.position?.[i]))
              robot.setJointValue(name, state.position[i]);
          });
        robot.traverse((object) => {
          if (
            (object as THREE.Object3D & { isURDFVisual?: boolean }).isURDFVisual
          )
            object.visible = options.current.visual;
          if (
            (object as THREE.Object3D & { isURDFCollider?: boolean })
              .isURDFCollider
          )
            object.visible = options.current.collision;
        });
        frameAxes.forEach((helper) => {
          helper.visible = options.current.axes;
        });
        worldAxes.visible = options.current.axes;
        floor.visible = options.current.grid;
        controls.update();
        renderer.render(scene, camera);
      };
      animate();
      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        resize.disconnect();
        renderer.domElement.removeEventListener("pointerdown", down);
        renderer.domElement.removeEventListener("pointerup", pick);
        controls.dispose();
        disposeObject(scene);
        renderer.dispose();
        renderer.domElement.remove();
        robotRef.current = null;
      };
    } catch (e) {
      setError((e as Error).message);
      renderer.dispose();
      renderer.domElement.remove();
    }
  }, [m.model]);
  /* eslint-enable react-hooks/set-state-in-effect */
  return (
    <div className="viewer-wrap">
      <div className="viewer-toolbar">
        <button
          className={visual ? "selected" : ""}
          onClick={() => setVisual(!visual)}
        >
          <Box size={12} />
          Visual
        </button>
        <button
          className={collision ? "selected" : ""}
          onClick={() => setCollision(!collision)}
        >
          Collision
        </button>
        <button
          className={axes ? "selected" : ""}
          onClick={() => setAxes(!axes)}
        >
          <Axis3D size={12} />
          Frames
        </button>
        <button
          className={grid ? "selected" : ""}
          onClick={() => setGrid(!grid)}
        >
          <Grid3X3 size={12} />
          Grid
        </button>
        <div className="spacer" />
        <button aria-label="Reset camera" onClick={() => resetRef.current()}>
          <RotateCcw size={13} />
        </button>
        <button
          aria-label="Fullscreen viewer"
          onClick={() =>
            container.current?.parentElement
              ?.requestFullscreen()
              .catch(() => {})
          }
        >
          <Maximize size={13} />
        </button>
      </div>
      <div className="viewer-canvas" ref={container} />
      {!m.model && (
        <div className="viewer-empty">
          <Empty
            title={
              m.modelError
                ? "Unable to load URDF"
                : m.config
                  ? "Loading model…"
                  : "No robot loaded"
            }
          >
            {m.modelError || "Select a configuration to inspect the robot."}
          </Empty>
        </div>
      )}
      {error && (
        <div className="viewer-error" role="alert">
          {error}
        </div>
      )}
      <div className="viewer-caption">
        <span className="mono">
          Z ↑ · URDF {m.fresh ? "live pose" : "last known / zero pose"}
        </span>
        <span>Orbit: drag · Pan: shift + drag · Zoom: scroll</span>
      </div>
    </div>
  );
}
