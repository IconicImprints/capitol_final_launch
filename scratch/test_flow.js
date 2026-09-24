const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on("console", msg => {
    if (msg.type() === "error") {
      console.error("[PAGE ERROR]", msg.text());
      errors.push(msg.text());
    } else {
      console.log("[PAGE LOG]", msg.text());
    }
  });
  page.on("pageerror", err => {
    console.error("[PAGE UNCAUGHT]", err.message, err.stack);
    errors.push(err.message + "\n" + err.stack);
  });

  console.log("Navigating to http://localhost:3001...");
  await page.goto("http://localhost:3001");
  await page.waitForTimeout(1000);

  console.log("Page title:", await page.title());

  // Check if landing page loaded
  const textContent = await page.textContent("body");
  console.log("Initial page text snippet:", textContent.slice(0, 200).replace(/\s+/g, ' '));

  // Find Sign up button
  console.log("Looking for sign up / start your room button...");
  const signupBtn = await page.locator("button:has-text('start your room')").first();
  if (await signupBtn.isVisible()) {
    console.log("Clicking start your room button...");
    await signupBtn.click();
    await page.waitForTimeout(1000);
  } else {
    console.log("No signup button found directly, looking at all buttons:");
    const buttons = await page.locator("button, a").allTextContents();
    console.log("Buttons:", buttons);
  }

  // Check if form is visible
  const nameInput = page.locator('input[placeholder*="Display Name"]');
  if (await nameInput.isVisible()) {
    const randomSuffix = Math.floor(Math.random() * 100000);
    const username = `testuser${randomSuffix}`;
    const email = `testuser${randomSuffix}@example.com`;
    console.log(`Filling form for ${username}...`);
    await nameInput.fill(`Test User ${randomSuffix}`);
    await page.locator('input[placeholder*="User ID"]').fill(username);
    await page.locator('input[placeholder*="Email"]').fill(email);
    await page.locator('input[placeholder*="Password"]').fill("password123");

    console.log("Submitting signup form...");
    const submitBtn = page.locator('button:has-text("Create account")');
    await submitBtn.click();

    await page.waitForTimeout(1500);
  }

  console.log("Checking current state after signup...");
  const bodyTextAfterSignup = await page.textContent("body");
  console.log("Text after signup snippet:", bodyTextAfterSignup.slice(0, 300).replace(/\s+/g, ' '));

  // See if niche options are present
  const nicheBtn = page.locator('text=/Coding \\/ Building|Fitness/i').first();
  if (await nicheBtn.isVisible()) {
    console.log("Clicking niche option...");
    await nicheBtn.click();
    await page.waitForTimeout(1000);

    console.log("Looking for age options...");
    const ageBtn = page.locator('text=/19 – 22|16 – 18|23 – 29/i').first();
    if (await ageBtn.isVisible()) {
      console.log("Clicking age option...");
      await ageBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  // Wait for matching or completion
  console.log("Waiting for matching or dashboard transition...");
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const currentText = await page.textContent("body");
    if (currentText.includes("Community Safety Guidelines") || currentText.includes("One last thing")) {
      console.log("Found Safety Guidelines screen!");
      // Check checkbox and continue
      const checkbox = page.locator('input[type="checkbox"]');
      if (await checkbox.isVisible()) {
        // Scroll guidelines box
        await page.evaluate(() => {
          const boxes = document.querySelectorAll('div');
          for (const b of boxes) {
            if (b.scrollHeight > b.clientHeight) {
              b.scrollTop = b.scrollHeight;
            }
          }
        });
        await page.waitForTimeout(500);
        await checkbox.check({ force: true });
        const agreeBtn = page.locator('button:has-text("I Agree & Continue")');
        if (await agreeBtn.isVisible()) {
          console.log("Clicking I Agree & Continue...");
          await agreeBtn.click();
          await page.waitForTimeout(1000);
        }
      }
    }
    if (currentText.includes("Dashboard") || currentText.includes("Streak Card") || currentText.includes("Good work") || currentText.includes("Hey,")) {
      console.log("Reached Dashboard successfully!");
      break;
    }
  }

  console.log("Current body text snippet:", (await page.textContent("body")).slice(0, 300).replace(/\s+/g, ' '));
  console.log("Total errors encountered:", errors.length);
  if (errors.length > 0) {
    console.error("Errors list:\n", errors.join("\n---\n"));
  }

  await browser.close();
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
