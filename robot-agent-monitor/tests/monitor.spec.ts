import { test, expect } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
const urdf = `<robot name="TestArm"><link name="base"><visual><geometry><box size="0.3 0.3 0.2"/></geometry></visual></link><link name="arm"><visual><origin xyz="0 0 0.3"/><geometry><cylinder radius="0.06" length="0.6"/></geometry></visual></link><joint name="shoulder" type="revolute"><parent link="base"/><child link="arm"/><origin xyz="0 0 0.2"/><axis xyz="0 1 0"/><limit lower="-1.5" upper="1.5" effort="10" velocity="2"/></joint></robot>`;
test("URDF import, profiles, persisted interfaces/groups and sensor CRUD use the real Rust API", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/robots");
  await expect(
    page.getByRole("heading", { name: "Robots", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import Robot", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: false })
    .fill("E2E Robot");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: false })
    .fill("Stock");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "robot.urdf",
      mimeType: "application/xml",
      buffer: Buffer.from(urdf),
    });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByText("Parsing complete", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(
    page.getByText("Robot ready to open.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open Robot", exact: true }).click();
  await expect(
    page.getByText("Loaded and parsed", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.screenshot({
    path: "test-results/robots-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Joints", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "shoulder", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "ROS Interfaces", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New Interface", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: false })
    .fill("Joint States");
  await page.getByLabel("ROS Endpoint").fill("/joint_states");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Joint States", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Joint Groups", exact: true }).click();
  await page.getByRole("button", { name: "New Group", exact: true }).click();
  await page.getByLabel("Display Name").fill("Right Arm");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".member-chip")).toContainText("shoulder");
  await page.reload();
  await expect(page.locator(".member-chip")).toContainText("shoulder");
  await page.getByRole("link", { name: "Sensors", exact: true }).click();
  await page.getByRole("button", { name: "New Sensor", exact: true }).click();
  await page.getByLabel("Code", { exact: false }).fill("head");
  await page.getByLabel("Display name", { exact: false }).fill("Head Camera");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Head Camera", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add stream", exact: true }).click();
  await page.getByLabel("Role", { exact: false }).fill("color");
  await page.getByLabel("Topic", { exact: false }).fill("/camera/color");
  await page
    .getByLabel("Data type", { exact: false })
    .fill("sensor_msgs/msg/Image");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("/camera/color", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByText("Joint States", { exact: true })).toBeVisible();
  await expect(page.getByText("Head Camera", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  const profiles = await (
    await request.get("/backend/api/v1/robot-profiles/list")
  ).json();
  expect(
    profiles.some((p: { name: string }) => p.name === "E2E Robot"),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
test("real API validates package assets, pagination, read isolation and episode references", async ({
  request,
}) => {
  const profiles = await (
    await request.get("/backend/api/v1/robot-profiles/list")
  ).json();
  const configs = await (
    await request.get("/backend/api/v1/robot-configurations/list")
  ).json();
  const config = configs.find((c: { name: string }) => c.name === "Stock");
  expect(config).toBeTruthy();
  const asset = await request.get(
    `/backend/api/v1/robot-configurations/${config.id}/assets/robot.urdf`,
  );
  expect(asset.status()).toBe(200);
  expect(await asset.text()).toContain('name="TestArm"');
  const bad = await request.get(
    `/backend/api/v1/robot-configurations/${config.id}/assets/%2e%2e%2f%2e%2e%2fother.db`,
  );
  expect(bad.ok()).toBeFalsy();
  const upload = await request.post(
    "/backend/api/v1/robot-configurations/create",
    {
      multipart: {
        "Data.RobotProfileId": String(profiles[0].id),
        "Data.Name": "Mesh Package",
        AttachFiles: {
          name: "model.urdf",
          mimeType: "application/xml",
          buffer: Buffer.from(urdf),
        },
        AssetFiles: {
          name: "meshes/part.stl",
          mimeType: "model/stl",
          buffer: Buffer.from("solid part\nendsolid part"),
        },
      },
    },
  );
  expect(upload.ok()).toBeTruthy();
  const packageId = (await upload.json()).recordId;
  const mesh = await request.get(
    `/backend/api/v1/robot-configurations/${packageId}/assets/meshes/part.stl`,
  );
  expect(mesh.status()).toBe(200);
  expect(await mesh.text()).toContain("solid part");
  const page = await (
    await request.get(
      "/backend/api/v1/robot-configurations/list?limit=1&offset=1",
    )
  ).json();
  expect(page.length).toBe(1);
  const episode = await request.post("/backend/api/v1/episodes/create", {
    data: {
      requestId: "e2e",
      data: {
        robotConfigurationId: config.id,
        name: "Reference",
        status: "completed",
      },
    },
  });
  expect(episode.ok()).toBeTruthy();
  const remove = await request.delete(
    "/backend/api/v1/robot-configurations/delete",
    { data: { requestId: "e2e", data: { id: config.id } } },
  );
  expect(remove.ok()).toBeFalsy();
});
test("WebSocket JointState renders live values then disables targets when stale; offline state is honest", async ({
  page,
}) => {
  // Runtime is mocked here: CRUD, URDF and asset requests still reach the actual Rust process.
  const configs = await (
    await page.request.get("/backend/api/v1/robot-configurations/list")
  ).json();
  const config = configs.find((c: { name: string }) => c.name === "Stock");
  await page.addInitScript(
    (id) => localStorage.setItem("robot-monitor-configuration", String(id)),
    config.id,
  );
  await page.routeWebSocket("**/api/ros/ws", (ws) => {
    ws.send(
      JSON.stringify({
        type: "status",
        data: {
          running: true,
          subscriptions: [
            {
              name: "/joint_states",
              messageType: "sensor_msgs/msg/JointState",
            },
          ],
          publishers: [],
        },
      }),
    );
    ws.send(
      JSON.stringify({
        type: "ros_message",
        data: {
          topic: "/joint_states",
          messageType: "sensor_msgs/msg/JointState",
          data: {
            name: ["shoulder"],
            position: [0.75],
            velocity: [0.1],
            effort: [1.2],
          },
        },
      }),
    );
  });
  await page.goto("/joints");
  await expect(
    page.getByRole("cell", { name: "0.750", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "shoulder", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Send Target", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: "test-results/joints-live.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("cell", { name: "Stale", exact: true }),
  ).toBeVisible({ timeout: 8000 });
  await page.route("**/api/health", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.locator(".connection").filter({ hasText: "Backend" }),
  ).toContainText("Disconnected");
});

test("joint targets use the configured publish contract and clamp to URDF limits", async ({
  page,
  request,
}) => {
  const configs = await (
    await request.get("/backend/api/v1/robot-configurations/list")
  ).json();
  const config = configs.find((c: { name: string }) => c.name === "Stock");
  await request.post("/backend/api/v1/joint-interfaces/create", {
    data: {
      data: {
        robotConfigurationId: config.id,
        name: "Position command",
        operation: "publish",
        rosEndpoint: "/joint_commands",
        dataType: "sensor_msgs/msg/JointState",
        isEnabled: true,
        isDefaultCommand: true,
      },
    },
  });
  await page.addInitScript((id) => {
    localStorage.setItem("robot-monitor-configuration", String(id));
  }, config.id);
  let published:
    | {
        topic: string;
        messageType: string;
        data: { name: string[]; position: number[] };
      }
    | undefined;
  await page.routeWebSocket("**/api/ros/ws", (ws) => {
    ws.onMessage((raw) => {
      const frame = JSON.parse(String(raw));
      if (frame.type === "publish") {
        published = frame;
        ws.send(
          JSON.stringify({ type: "publish_result", id: frame.id, status: 204 }),
        );
        return;
      }
    });
    ws.send(
      JSON.stringify({
        type: "status",
        data: {
          running: true,
          subscriptions: [],
          publishers: [
            {
              name: "/joint_commands",
              messageType: "sensor_msgs/msg/JointState",
            },
          ],
        },
      }),
    );
    ws.send(
      JSON.stringify({
        type: "ros_message",
        data: {
          topic: "/joint_states",
          messageType: "sensor_msgs/msg/JointState",
          data: {
            name: ["shoulder"],
            position: [0.75],
            velocity: [],
            effort: [],
          },
        },
      }),
    );
  });
  await page.goto("/joints");
  await page.getByRole("button", { name: "shoulder", exact: true }).click();
  const target = page.getByLabel("Target position", { exact: true });
  await expect(target).toBeEnabled();
  await target.fill("99");
  await expect(target).toHaveValue("1.5");
  await page.getByRole("button", { name: "Send Target", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Target published" }),
  ).toBeVisible();
  expect(published).toMatchObject({
    topic: "/joint_commands",
    messageType: "sensor_msgs/msg/JointState",
    data: { name: ["shoulder"], position: [1.5] },
  });
});
test("ZIP import resolves package:// meshes through the actual asset manifest", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const meshUrdf = urdf.replace(
    '<box size="0.3 0.3 0.2"/>',
    '<mesh filename="package://robot_pkg/meshes/part.stl"/>',
  );
  const stl =
    "solid part\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 0.3 0 0\nvertex 0 0.3 0\nendloop\nendfacet\nendsolid part";
  const archive = zipSync({
    "robot_pkg/urdf/model.urdf": strToU8(meshUrdf),
    "robot_pkg/meshes/part.stl": strToU8(stl),
  });
  await page.goto("/robots");
  await page
    .getByRole("button", { name: "Import Robot", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: false })
    .fill("Zip Configuration");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "robot.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(archive),
    });
  await expect(page.getByRole("combobox", { name: "Main URDF" })).toContainText(
    "model.urdf",
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(
    page.getByText("Robot ready to open.", { exact: true }),
  ).toBeVisible();
  const meshResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/assets/robot_pkg/meshes/part.stl") &&
      response.status() === 200,
  );
  await page.getByRole("button", { name: "Open Robot", exact: true }).click();
  await meshResponse;
  await expect(
    page.getByText("Loaded and parsed", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".viewer-error")).toHaveCount(0);
  expect(errors).toEqual([]);
});
