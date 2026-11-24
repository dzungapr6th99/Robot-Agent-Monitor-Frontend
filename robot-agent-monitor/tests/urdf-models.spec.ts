import { expect, test } from "@playwright/test";

test("urdf-models supports search, active selection synced with sidebar, and blocks delete when VLA models exist", async ({
  page,
}) => {
  await page.route("**/api/v1/robot-profiles/list*", (route) =>
    route.fulfill({
      json: [
        { id: 1, name: "YellowArm" },
        { id: 2, name: "Unitree G1" },
      ],
    }),
  );
  await page.route("**/api/v1/robot-configurations/list*", (route) =>
    route.fulfill({
      json: [
        {
          id: 10,
          robotProfileId: 1,
          name: "YellowArm Dual",
          urdfPath: "robots/1/10/yellowarm.urdf",
          createdAt: "2026-11-20T10:00:00Z",
        },
        {
          id: 20,
          robotProfileId: 2,
          name: "G1 Stock",
          urdfPath: "robots/2/20/g1.urdf",
          createdAt: "2026-11-21T10:00:00Z",
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
  await page.route("**/api/vla/models*", (route) =>
    route.fulfill({
      json: [
        {
          id: 101,
          robotConfigurationId: 10,
          code: "yellowarm-smolvla",
          displayName: "YellowArm Pick",
          modelType: "smolvla",
          version: "1.0.0",
          formatVersion: 1,
          packageSha256: "a".repeat(64),
          packageBytes: 1024,
          storagePath: "vla/10/101",
        },
      ],
    }),
  );

  await page.goto("/urdf-models");

  // Delete button for YellowArm Dual (which has 1 VLA model) must be disabled with tooltip.
  const lockedDelete = page.getByRole("button", {
    name: "Xóa URDF YellowArm Dual",
  });
  await expect(lockedDelete).toBeDisabled();
  await expect(lockedDelete).toHaveAttribute(
    "title",
    "Xóa hết 1 model VLA trước",
  );

  // Delete button for G1 Stock (0 VLA models) is enabled.
  await expect(
    page.getByRole("button", { name: "Xóa URDF G1 Stock" }),
  ).toBeEnabled();

  // Select G1 Stock and verify sidebar selector syncs.
  const g1Row = page.locator("tr", { hasText: "G1 Stock" });
  await g1Row.getByRole("button", { name: "Chọn URDF này" }).click();
  await expect(page.getByLabel("Active configuration")).toHaveValue("20");

  // Search filters rows by name / profile / path.
  await page.getByLabel("Tìm kiếm URDF").fill("yellowarm.urdf");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("YellowArm Dual");
});
