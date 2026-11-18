import { expect, test, type Page } from "@playwright/test";

async function rosOnline(page: Page) {
  // Explicit transport fixture: these UI tests do not emulate ROS execution.
  await page.routeWebSocket("**/api/ros/ws", (ws) => {
    ws.send(
      JSON.stringify({
        type: "status",
        data: { running: true, subscriptions: [], publishers: [], traffic: [] },
      }),
    );
  });
}

test("chat publishes a command and displays the returned step count", async ({
  page,
}) => {
  await rosOnline(page);
  await page.route("**/api/vla/models", (route) =>
    route.fulfill({
      json: [{ id: "test-arm", model: "smolvla", version: "v1" }],
    }),
  );
  await page.route("**/api/vla/commands", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      profileId: "test-arm",
      task: "hold position",
    });
    await route.fulfill({ json: { publishedSteps: 12 } });
  });
  await page.goto("/chat");
  await page.getByLabel("Instruction", { exact: true }).fill("hold position");
  await page.getByRole("button", { name: "Send instruction" }).click();
  await expect(page.getByRole("log")).toContainText(
    "Published 12 motion steps to ROS.",
  );
});

test("Stop shows Stopping until the command finishes", async ({ page }) => {
  await rosOnline(page);
  let finish!: () => void;
  const completion = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/vla/models", (route) =>
    route.fulfill({
      json: [{ id: "test-arm", model: "smolvla", version: "v1" }],
    }),
  );
  await page.route("**/api/vla/commands", async (route) => {
    await completion;
    await route.fulfill({ json: { publishedSteps: 1 } });
  });
  await page.route("**/api/vla/stop", (route) =>
    route.fulfill({ json: { stopping: true } }),
  );
  await page.goto("/chat");
  await page.getByLabel("Instruction", { exact: true }).fill("hold position");
  await page.getByRole("button", { name: "Send instruction" }).click();
  await page.getByRole("button", { name: "Stop VLA" }).click();
  await expect(page.getByRole("status")).toContainText("Stopping");
  await expect(page.getByRole("button", { name: "Stop VLA" })).toBeDisabled();
  finish();
  await expect(page.getByRole("log")).toContainText(
    "Published 1 motion steps to ROS.",
  );
});

test("real backend with ROS disabled prevents chat submission and returns 503", async ({
  page,
  request,
}) => {
  await page.goto("/chat");
  await page.getByLabel("Instruction", { exact: true }).fill("hold position");
  await expect(
    page.getByRole("button", { name: "Send instruction" }),
  ).toBeDisabled();
  await expect(
    page.getByText("ROS is offline. Connect ROS to send an instruction."),
  ).toBeVisible();
  const response = await request.post("/backend/api/vla/commands", {
    data: { profileId: "test-arm", task: "hold position" },
  });
  expect(response.status()).toBe(503);
  expect(await response.json()).toEqual({
    message: "ROS or VLA is unavailable",
  });
});

test("chat displays real backend 503 if ROS goes offline after status", async ({
  page,
}) => {
  // Stale running status allows the request; the VLA route uses the real backend.
  await rosOnline(page);
  await page.goto("/chat");
  await page.getByLabel("Instruction", { exact: true }).fill("hold position");
  await page.getByRole("button", { name: "Send instruction" }).click();
  await expect(page.getByRole("log")).toContainText(
    "ROS or VLA is unavailable",
  );
});
