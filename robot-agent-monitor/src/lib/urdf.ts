import type { Joint, RobotModel } from "./types";
export function parseUrdf(xml: string, url = ""): RobotModel {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (
    doc.querySelector("parsererror") ||
    doc.documentElement.tagName !== "robot"
  )
    throw new Error("Invalid URDF XML: expected a robot root element.");
  const root = doc.documentElement;
  if (!root.getAttribute("name")?.trim())
    throw new Error("Robot name is required.");
  const children = Array.from(root.children);
  const links = children
    .filter((el) => el.tagName === "link")
    .map((el) => el.getAttribute("name") || "");
  if (
    !links.length ||
    links.some((name) => !name) ||
    new Set(links).size !== links.length
  )
    throw new Error("URDF needs unique, named links.");
  const joints: Joint[] = children
    .filter((el) => el.tagName === "joint")
    .map((el) => {
      const name = el.getAttribute("name") || "";
      const type = el.getAttribute("type") || "";
      const parent = el.querySelector("parent")?.getAttribute("link") || "";
      const child = el.querySelector("child")?.getAttribute("link") || "";
      if (
        !name ||
        !links.includes(parent) ||
        !links.includes(child) ||
        parent === child
      )
        throw new Error(
          `Joint ${name || "(unnamed)"} references an invalid parent/child link.`,
        );
      if (
        ![
          "revolute",
          "continuous",
          "prismatic",
          "fixed",
          "floating",
          "planar",
        ].includes(type)
      )
        throw new Error(`Unknown joint type: ${type}`);
      const number = (attribute: string) => {
        const raw = el.querySelector("limit")?.getAttribute(attribute);
        return raw !== null && raw !== undefined && Number.isFinite(Number(raw))
          ? Number(raw)
          : null;
      };
      const lower = number("lower"),
        upper = number("upper");
      if (lower !== null && upper !== null && lower > upper)
        throw new Error(`Joint ${name} has reversed limits.`);
      return { name, type, lower, upper, parent, child };
    });
  if (new Set(joints.map((j) => j.name)).size !== joints.length)
    throw new Error("Duplicate joint name in URDF.");
  return {
    name: root.getAttribute("name")!,
    links,
    joints,
    assets: [],
    xml,
    url,
  };
}
export function assetUrl(id: number, urdfPath: string) {
  return `/api/v1/robot-configurations/${id}/assets/${urdfPath.split("/").slice(3).map(encodeURIComponent).join("/")}`;
}
