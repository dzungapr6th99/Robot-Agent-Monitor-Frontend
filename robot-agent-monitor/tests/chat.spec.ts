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

async function mockUrdfs(page: Page) {
  await page.route("**/api/v1/robot-profiles/list*", (route) =>
    route.fulfill({ json: [{ id: 1, name: "YellowArm" }] }),
  );
  await page.route("**/api/v1/robot-configurations/list*", (route) =>
    route.fulfill({
      json: [
        {
          id: 10,
          robotProfileId: 1,
          name: "Arm-A",
          urdfPath: "robots/1/10/arm.urdf",
        },
        {
          id: 20,
          robotProfileId: 1,
          name: "Arm-B",
          urdfPath: "robots/1/20/arm.urdf",
        },
      ],
    }),
  );
}

const modelForA = {
  id: 101,
  robotConfigurationId: 10,
  code: "yellowarm-smolvla",
  displayName: "Pick Cube",
  modelType: "smolvla",
  version: "v1",
  formatVersion: 1,
  packageSha256: "a".repeat(64),
  packageBytes: 1024,
  storagePath: "vla/10/101",
};

const modelForB = {
  id: 202,
  robotConfigurationId: 20,
  code: "yellowarm-groot",
  displayName: "Stack Block",
  modelType: "groot",
  version: "v2",
  formatVersion: 1,
  packageSha256: "b".repeat(64),
  packageBytes: 2048,
  storagePath: "vla/20/202",
};

test("chat selects URDF then model, publishes command and refreshes model list on URDF switch", async ({
  page,
}) => {
  await rosOnline(page);
  await mockUrdfs(page);
  await page.route("**/api/vla/status", (route) =>
    route.fulfill({
      json: {
        loadedModelId: null,
        configurationId: null,
        running: false,
        providers: ["cpu"],
      },
    }),
  );
  await page.route("**/api/vla/models*", (route) => {
    const url = new URL(route.request().url());
    const cfg = Number(url.searchParams.get("robotConfigurationId"));
    if (cfg === 10) return route.fulfill({ json: [modelForA] });
    if (cfg === 20) return route.fulfill({ json: [modelForB] });
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/vla/commands", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      robotConfigurationId: 10,
      modelId: 101,
      task: "hold position",
    });
    await route.fulfill({ json: { publishedSteps: 12 } });
  });

  await page.goto("/chat?config=10&model=101");
  await expect(page.getByLabel("URDF")).toHaveValue("10");
  await expect(page.getByLabel("Model")).toContainText(
    "Pick Cube · smolvla · v1",
  );

  await page.getByLabel("Instruction", { exact: true }).fill("hold position");
  await page.getByRole("button", { name: "Send instruction" }).click();
  await expect(page.getByRole("log")).toContainText(
    "Published 12 motion steps to ROS.",
  );

  // Switching URDF clears and reloads the model dropdown for the new URDF.
  await page.getByLabel("URDF").selectOption("20");
  await expect(page.getByLabel("Model")).toContainText(
    "Stack Block · groot · v2",
  );
});

test("Stop shows Stopping until the command finishes", async ({ page }) => {
  await rosOnline(page);
  await mockUrdfs(page);
  let finish!: () => void;
  const completion = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/vla/status", (route) =>
    route.fulfill({
      json: {
        loadedModelId: 101,
        configurationId: 10,
        running: false,
        providers: ["cpu"],
      },
    }),
  );
  await page.route("**/api/vla/models*", (route) =>
    route.fulfill({ json: [modelForA] }),
  );
  await page.route("**/api/vla/commands", async (route) => {
    await completion;
    await route.fulfill({ json: { publishedSteps: 1 } });
  });
  await page.route("**/api/vla/stop", (route) =>
    route.fulfill({ json: { stopping: true } }),
  );

  await page.goto("/chat?config=10&model=101");
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

test("chat displays 409 wrong-robot and 503 camera/ROS errors cleanly", async ({
  page,
}) => {
  await rosOnline(page);
  await mockUrdfs(page);
  await page.route("**/api/vla/status", (route) =>
    route.fulfill({
      json: {
        loadedModelId: null,
        configurationId: null,
        running: false,
        providers: ["cpu"],
      },
    }),
  );
  await page.route("**/api/vla/models*", (route) =>
    route.fulfill({ json: [modelForA] }),
  );
  let count = 0;
  await page.route("**/api/vla/commands", async (route) => {
    count += 1;
    if (count === 1) {
      return route.fulfill({
        status: 409,
        json: { message: "VLA model #101 does not belong to URDF configuration #10" },
      });
    }
    return route.fulfill({
      status: 503,
      json: { message: "Camera 'front' has not received a frame yet" },
    });
  });

  await page.goto("/chat?config=10&model=101");
  await page.getByLabel("Instruction", { exact: true }).fill("pick cube");
  await page.getByRole("button", { name: "Send instruction" }).click();
  await expect(page.getByRole("log")).toContainText("does not belong to URDF");

  await page.getByLabel("Instruction", { exact: true }).fill("pick cube again");
  await page.getByRole("button", { name: "Send instruction" }).click();
  await expect(page.getByRole("log")).toContainText(
    "has not received a frame yet",
  );
});

test("real backend disables chat when ROS is offline and rejects unknown model with 404", async ({
  page,
  request,
}) => {
  await page.goto("/chat");
  await expect(
    page.getByRole("button", { name: "Send instruction" }),
  ).toBeDisabled();
  await expect(
    page.getByText("ROS is offline. Connect ROS to send an instruction."),
  ).toBeVisible();
  const response = await request.post("/backend/api/vla/commands", {
    data: { robotConfigurationId: 999, modelId: 999, task: "hold position" },
  });
  expect(response.status()).toBe(404);
});
