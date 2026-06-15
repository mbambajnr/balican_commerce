import { expect, test } from "@playwright/test";

test.describe("authentication journeys", () => {
  test.setTimeout(60_000);

  test("registration validates required fields in the browser", async ({ page }) => {
    await page.goto("/auth/register");
    await page.getByRole("button", { name: "Register Your Company" }).click();

    await expect(page.getByText("Company name is required")).toBeVisible();
    await expect(page.getByText("Min 8 characters")).toBeVisible();
    await expect(page.getByText("Required")).toHaveCount(4);
  });

  test("a buyer can register and sign in without exposing a browser token", async ({ page }) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `e2e-buyer-${unique}@test-sslplan.com`;
    const password = "E2eTestPass123!";

    await page.goto("/auth/register");
    await page.getByPlaceholder("Bali-Can Limited").fill(`E2E Buyer ${unique}`);
    await page.getByTestId("company-type-buyer").click();
    await page.getByPlaceholder("company@example.com").fill(email);
    await page.getByPlaceholder("John").fill("Browser");
    await page.getByPlaceholder("Doe").fill("Buyer");
    await page.getByPlaceholder("Min 8 characters").fill(password);

    const registrationResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/backend-api/auth/register") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Register Your Company" }).click();
    const response = await registrationResponse;
    expect(response.status(), await response.text()).toBe(201);

    await expect(page.getByRole("heading", { name: "Registration Submitted" })).toBeVisible();
    await page.getByRole("link", { name: "Go to Sign In" }).click();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    const signInResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/callback/credentials") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    const authResponse = await signInResponse;
    expect(authResponse.status(), await authResponse.text()).toBe(200);

    await expect(page).toHaveURL(/\/products$/, { timeout: 15_000 });
    const tokenKeys = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => /token/i.test(key))
    );
    expect(tokenKeys).toEqual([]);
  });

  test("protected admin pages redirect anonymous users", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("heading", { name: "Admin Portal" })).toBeVisible();
  });
});
