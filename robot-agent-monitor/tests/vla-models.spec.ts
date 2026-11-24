import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

function buildValidVlaZip(
  code = "e2e-smolvla",
  version = "1.0.0",
  joints = ["joint1"],
  camera = "front",
): Buffer {
  const onnxBytes = strToU8("dummy-onnx-model-bytes");
  const onnxSha = createHash("sha256").update(onnxBytes).digest("hex");
  const manifest = {
    formatVersion: 1,
    code,
    name: "E2E SmolVLA",
    modelType: "smolvla",
    version,
    robot: { jointNames: joints },
    onnx: { file: "model.onnx" },
    inputs: [
      { name: "state", kind: "joint_position", dtype: "float32" },
      {
        name: "image_front",
        kind: "image",
        camera,
        width: 8,
        height: 8,
        encoding: "rgb8",
        layout: "NCHW",
        scale: "0_1",
      },
    ],
    outputs: [
      { name: "actions", kind: "joint_position_chunk", dtype: "float32" },
    ],
    files: { "model.onnx": onnxSha },
  };
  const archive = zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "model.onnx": onnxBytes,
  });
  return Buffer.from(archive);
}

test("vla-models requires selecting URDF first, shows camera panel, handles search, 400 upload error and 409 delete error", async ({
  page,
}) => {
  await page.route("**/api/v1/robot-profiles/list*", (route) =>
    route.fulfill({ json: [{ id: 1, name: "YellowArm" }] }),
  );
  await page.route("**/api/v1/robot-configurations/list*", (route) =>
    route.fulfill({
      json: [
        {
          id: 10,
          robotProfileId: 1,
          name: "YellowArm Dual",
          urdfPath: "robots/1/10/arm.urdf",
        },
      ],
    }),
  );
  await page.route("**/api/v1/sensors/list*", (route) =>
    route.fulfill({
      json: [
        {
          id: 1,
          robotConfigurationId: 10,
          code: "front",
          displayName: "Front Cam",
          sensorType: "camera_rgb",
          isEnabled: true,
        },
      ],
    }),
  );
  await page.route("**/api/v1/sensor-streams/list*", (route) =>
    route.fulfill({
      json: [
        {
          id: 1,
          sensorId: 1,
          role: "color",
          topic: "/cam/front/image_raw",
          dataType: "sensor_msgs/msg/Image",
          isEnabled: true,
        },
      ],
    }),
  );
  await page.route("**/api/vla/status", (route) =>
    route.fulfill({
      json: {
        loadedModelId: 101,
        configurationId: 10,
        running: false,
        providers: ["tensorrt", "cuda", "cpu"],
      },
    }),
  );

  const sampleModel = {
    id: 101,
    robotConfigurationId: 10,
    code: "yellowarm-smolvla",
    displayName: "Pick Cube",
    modelType: "smolvla",
    version: "2026-11-20",
    description: "Initial checkpoint",
    formatVersion: 1,
    packageSha256: "a".repeat(64),
    packageBytes: 2048,
    storagePath: "vla/10/101",
    manifest: {
      formatVersion: 1,
      code: "yellowarm-smolvla",
      name: "Pick Cube",
      modelType: "smolvla",
      version: "2026-11-20",
      robot: { jointNames: ["joint1", "joint2"] },
      onnx: { file: "model.onnx" },
      inputs: [
        { name: "state", kind: "joint_position", dtype: "float32" },
        {
          name: "image_front",
          kind: "image",
          camera: "front",
          width: 224,
          height: 224,
          encoding: "rgb8",
          layout: "NCHW",
          scale: "0_1",
        },
      ],
      outputs: [
        { name: "actions", kind: "joint_position_chunk", dtype: "float32" },
      ],
    },
  };

  await page.route("**/api/vla/models*", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      return route.fulfill({
        status: 400,
        json: { message: "Missing required manifest.json in VLA package" },
      });
    }
    const url = new URL(req.url());
    const q = url.searchParams.get("q") || "";
    const filtered = q
      ? [sampleModel].filter((m) => m.version.includes(q))
      : [sampleModel];
    return route.fulfill({ json: filtered });
  });
  await page.route("**/api/vla/models/101", async (route) => {
    if (route.request().method() === "DELETE") {
      return route.fulfill({
        status: 409,
        json: { message: "Model đang được nạp hoặc đang chạy, không thể xóa" },
      });
    }
    return route.fulfill({ json: sampleModel });
  });

  // 1. Without URDF selected, list is hidden and prompt is displayed.
  await page.goto("/vla-models");
  await expect(page.getByText("Chọn URDF trước")).toBeVisible();
  await expect(page.getByLabel("Tìm kiếm model VLA")).toHaveCount(0);

  // 2. Select URDF -> table & camera detail panel appear.
  await page.getByLabel("Chọn URDF").selectOption("10");
  await expect(page.locator("tbody")).toContainText("Pick Cube");
  await expect(page.getByText("/cam/front/image_raw")).toBeVisible();
  await expect(page.getByText("Có trong sensors")).toBeVisible();

  // 3. Search filters via debounced API query.
  await page.getByLabel("Tìm kiếm model VLA").fill("2026-11-20");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Tìm kiếm model VLA").fill("not-found");
  await expect(
    page.getByText("Không tìm thấy model VLA phù hợp"),
  ).toBeVisible();
  await page.getByLabel("Tìm kiếm model VLA").fill("");
  await expect(page.locator("tbody tr")).toHaveCount(1);

  // 4. Uploading invalid zip displays 400 error message verbatim.
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "broken.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("not-a-zip"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Missing required manifest.json in VLA package",
  );

  // 5. Deleting an in-use model surfaces 409 conflict reason.
  await page.getByRole("button", { name: "Xóa Pick Cube" }).click();
  await page.getByRole("button", { name: "Xóa model" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Model đang được nạp hoặc đang chạy",
  );
});

test("real backend end-to-end: upload VLA package, block URDF delete, delete model, then delete URDF", async ({
  page,
  request,
}) => {
  const unique = Date.now();
  const profileResp = await request.post("/backend/api/v1/robot-profiles/create", {
    data: { requestId: `e2e-p-${unique}`, data: { name: `VlaProfile-${unique}` } },
  });
  expect(profileResp.ok()).toBeTruthy();
  const { recordId: profileId } = (await profileResp.json()) as { recordId: number };

  const urdfXml = `<?xml version="1.0"?>
<robot name="e2e_arm">
  <link name="base_link"/>
  <link name="link1"/>
  <joint name="joint1" type="revolute">
    <parent link="base_link"/>
    <child link="link1"/>
  </joint>
</robot>`;

  const cfgResp = await request.post(
    "/backend/api/v1/robot-configurations/create",
    {
      multipart: {
        RequestId: `e2e-c-${unique}`,
        "Data.RobotProfileId": String(profileId),
        "Data.Name": `VlaArm-${unique}`,
        AttachFiles: {
          name: "e2e_arm.urdf",
          mimeType: "application/xml",
          buffer: Buffer.from(urdfXml),
        },
      },
    },
  );
  expect(cfgResp.ok()).toBeTruthy();
  const { recordId: configId } = (await cfgResp.json()) as { recordId: number };

  const sensResp = await request.post("/backend/api/v1/sensors/create", {
    data: {
      requestId: `e2e-s-${unique}`,
      data: {
        robotConfigurationId: configId,
        code: "front",
        displayName: "Front Cam",
        sensorType: "camera_rgb",
        isEnabled: true,
      },
    },
  });
  expect(sensResp.ok()).toBeTruthy();
  const { recordId: sensorId } = (await sensResp.json()) as { recordId: number };

  const streamResp = await request.post("/backend/api/v1/sensor-streams/create", {
    data: {
      requestId: `e2e-st-${unique}`,
      data: {
        sensorId,
        role: "color",
        topic: "/e2e/front/image_raw",
        dataType: "sensor_msgs/msg/Image",
        isEnabled: true,
      },
    },
  });
  expect(streamResp.ok()).toBeTruthy();

  // Upload VLA package via UI on /vla-models.
  await page.goto(`/vla-models?config=${configId}`);
  const zipBuf = buildValidVlaZip(`e2e-vla-${unique}`, "1.0.0", ["joint1"], "front");
  await page.locator('input[type="file"]').setInputFiles({
    name: `e2e-vla-${unique}.zip`,
    mimeType: "application/zip",
    buffer: zipBuf,
  });

  await expect(page.locator("tbody")).toContainText("E2E SmolVLA");
  await expect(page.getByText("/e2e/front/image_raw")).toBeVisible();

  // Verify URDF delete is locked on /urdf-models.
  await page.goto("/urdf-models");
  const urdfDeleteBtn = page.getByRole("button", {
    name: `Xóa URDF VlaArm-${unique}`,
  });
  await expect(urdfDeleteBtn).toBeDisabled();

  // Delete VLA model on /vla-models.
  await page.goto(`/vla-models?config=${configId}`);
  await page.getByRole("button", { name: "Xóa E2E SmolVLA" }).click();
  await page.getByRole("button", { name: "Xóa model" }).click();
  await expect(
    page.getByText("URDF này chưa có model VLA nào"),
  ).toBeVisible();

  // Now URDF can be deleted on /urdf-models.
  await page.goto("/urdf-models");
  const urdfDeleteUnlocked = page.getByRole("button", {
    name: `Xóa URDF VlaArm-${unique}`,
  });
  await expect(urdfDeleteUnlocked).toBeEnabled();
  await urdfDeleteUnlocked.click();
  await page.getByRole("button", { name: "Xóa URDF" }).click();
  await expect(page.locator("tbody")).not.toContainText(`VlaArm-${unique}`);
});
