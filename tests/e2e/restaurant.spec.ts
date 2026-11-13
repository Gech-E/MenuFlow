import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("mobile account form supports keyboard input, validation and narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  const email = page.getByRole("textbox", { name: "Email address" });
  await email.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(email).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("isolated guest and staff browsers complete a restaurant visit and record one cash receipt", async ({ page: staff, browser, baseURL }) => {
  test.skip(process.env.MENUFLOW_E2E_AUTH !== "1", "Requires local Supabase Auth and the migrated local Data API.");
  if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname !== "127.0.0.1" ||
      new URL(baseURL!).hostname !== "127.0.0.1") throw new Error("Run this account-creating test against the local stack only.");
  const id = randomUUID().slice(0,8);
  const button = (name: string) => staff.getByRole("button",{name,exact:true});
  await staff.goto("/register");
  await staff.getByLabel("Email address").fill("owner-" + id + "@example.com");
  await staff.getByLabel("Password",{exact:true}).fill(randomUUID() + "A9!");
  await button("Create account").click();
  await staff.getByLabel("Restaurant name",{exact:true}).fill("Cafe " + id);
  await staff.getByLabel("Branch name").fill("Central");
  await button("Create restaurant").click();
  await button("Menu").click();
  await button("New category").click();
  await staff.getByLabel("Category name",{exact:true}).fill("Coffee");
  await button("Save category").click();
  await button("New menu item").click();
  await staff.getByLabel("Item name",{exact:true}).fill("Macchiato");
  await staff.getByRole("dialog", { name: "New menu item" })
    .getByRole("combobox", { name: /^Category\b/ }).selectOption({ label: "Coffee" });
  await staff.getByLabel("Price (ETB)",{exact:true}).fill("100");
  await button("Save menu item").click();
  await expect(staff.getByRole("dialog")).toHaveCount(0);
  await button("Tables & QR").click();
  await button("New table").click();
  await staff.getByLabel("Table label").fill("Courtyard");
  await staff.getByLabel("Table number").fill("1");
  await button("Save table").click();
  await button("Show QR code").click();
  const tableLink = staff.getByRole("link", { name: "Open table menu" });
  await expect(tableLink).toHaveAttribute("href", /\/t\/[0-9a-f-]{36}$/);
  const tableURL = await tableLink.getAttribute("href");
  const download = staff.waitForEvent("download");
  await button("Download SVG").click();
  expect((await download).suggestedFilename()).toMatch(/\.svg$/);
  await button("Close dialog").click();
  await button("Open table").click();
  const code = (await staff.locator("output[aria-label='Admission code']").innerText()).trim();
  await button("Done").click();

  const context = await browser.newContext({ viewport: {width:390,height:844} });
  try {
    const guest = await context.newPage();
    const guestButton = (name: string) => guest.getByRole("button",{name,exact:true});
    await guest.goto(tableURL!);
    await guest.getByLabel("Table code").fill(code);
    await guestButton("Join table").click();
    await guestButton("Choose Macchiato").click();
    await guestButton("Add to cart").click();
    await guestButton("Cart (1)").click();
    await guestButton("Review order").click();
    await guestButton("Place order").click();
    await expect(guest.getByText(/Order received ·/)).toBeVisible();
    await button("Kitchen").click();
    for (const next of ["Accept","Start preparing","Mark ready","Mark served"]) await button(next).click();
    await expect(guest.locator("article").filter({ hasText: "Macchiato" }))
      .toContainText(/served/i);
    await guestButton("Bill").click();
    const tip = guest.getByRole("radio",{name:"10%",exact:true});
    await expect(tip).not.toBeChecked();
    await tip.check();
    await guestButton("Request checkout").click();
    await expect(guest.getByText(/Checkout updated/)).toBeVisible();
    await button("Billing").click();
    await staff.locator("summary").filter({hasText:/Courtyard.*110\.00 ETB.*Checkout/i}).click();
    await staff.getByLabel("Cash received (ETB)").fill("120");
    await button("Confirm cash received").click();
    await expect(guest.getByRole("heading",{name:"Paid receipt"})).toBeVisible();
    await guest.reload();
    await guestButton("Bill").click();
    await expect(guest.getByRole("heading",{name:"Paid receipt"})).toBeVisible();
    await expect(guest.getByText("110.00 ETB",{exact:true})).toBeVisible();
    await expect(staff.locator("summary").filter({hasText:/Receipt #/})).toHaveCount(1);
  } finally { await context.close(); }
});
