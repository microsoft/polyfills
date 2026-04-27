import { expect, test } from "@playwright/test";
import { setupPage } from "./utils.js";

test("should not install style sheet with type=module by default", async ({
  page,
  channel,
}) => {
  await setupPage(page, channel);

  await expect(page.getByTestId("outside")).not.toHaveCSS(
    "text-decoration",
    "underline",
  );
});

test("should not install style sheet for non-shadow host element", async ({
  page,
  channel,
}) => {
  await setupPage(page, channel);

  await expect(page.getByTestId("non-host")).not.toHaveCSS(
    "text-decoration",
    "underline",
  );
});

test("should install style sheets to declarative shadow root", async ({
  page,
  channel,
}) => {
  await setupPage(page, channel);

  await expect(page.getByTestId("p1")).toHaveCSS(
    "text-decoration",
    "underline",
  );
  await expect(page.getByTestId("span1")).toHaveCSS(
    "text-decoration",
    "line-through",
  );
});

test("should install style sheets to custom element shadow root", async ({
  page,
  channel,
}) => {
  await setupPage(page, channel);

  await expect(page.getByTestId("p2")).toHaveCSS(
    "text-decoration",
    "underline",
  );
  await expect(page.getByTestId("span2")).toHaveCSS(
    "text-decoration",
    "line-through",
  );
});

test("should fetch and install style sheets to declarative shadow root", async ({
  page,
  channel,
}) => {
  await setupPage(page, channel);

  await expect(page.getByTestId("p3")).toHaveCSS(
    "text-decoration",
    "underline",
  );
  await expect(page.getByTestId("span3")).toHaveCSS(
    "text-decoration",
    "line-through",
  );
  await expect(page.getByTestId("b3")).toHaveCSS("padding", "4px");
});

test("should ignore non-existing style sheets", async ({ page, channel }) => {
  const nonExisting = [];
  page.on("response", (res) => {
    if (res.status() === 404) {
      nonExisting.push(new URL(res.url()).pathname);
    }
  });
  await setupPage(page, channel);
  await page.waitForResponse(/non-existing\.css$/);

  await expect(page.getByTestId("p4")).toHaveCSS(
    "text-decoration",
    "underline",
  );
  expect(nonExisting).toEqual(
    expect.arrayContaining(["/tests/non-existing.css"]),
  );
});

test("should install style sheets to nested declarative shadow root", async ({
  page,
  channel,
}) => {
  await setupPage(page, channel);

  await expect(page.getByTestId("p5-1")).toHaveCSS(
    "text-decoration",
    "underline",
  );
  await expect(page.getByTestId("span5-1")).not.toHaveCSS(
    "text-decoration",
    "line-through",
  );

  await expect(page.getByTestId("p5-2")).not.toHaveCSS(
    "text-decoration",
    "underline",
  );
  await expect(page.getByTestId("span5-2")).toHaveCSS(
    "text-decoration",
    "line-through",
  );
});

test("should install style sheets in nested declarative shadow root", async ({
  page,
  channel,
}) => {
  await setupPage(page, channel);

  await expect(page.getByTestId("span6")).toHaveCSS(
    "text-decoration",
    "double",
  );
});

test("should install style sheets to declarative shadow roots added dynamically", async ({
  page,
  channel,
}) => {
  await setupPage(page, channel);
  await page.getByTestId("container").evaluate((node) => {
    node.setHTMLUnsafe(
      `
    <div data-shadowrootadoptedstylesheets="s1 s2 s3 ./external.css non-existing">
      <template
        shadowrootmode="open"
        shadowrootadoptedstylesheets="s1 s2 s3 ./external.css non-existing"
      >
        <p data-testid="p7">
          text
          <span data-testid="span7">text</span>
          <b data-testid="b7">text</b>
        </p>
      </template>
    </div>
    `,
    );
  });

  await expect(page.getByTestId("p7")).toHaveCSS(
    "text-decoration",
    "underline",
  );
  await expect(page.getByTestId("span7")).toHaveCSS(
    "text-decoration",
    "double",
  );
  await expect(page.getByTestId("b7")).toHaveCSS("padding", "4px");
});

test("should install style sheets to nested declarative shadow roots added dynamically", async ({
  page,
  channel,
}) => {
  await setupPage(page, channel);
  await page.getByTestId("shadow-container").evaluate((node) => {
    node.setHTMLUnsafe(
      `
    <div data-shadowrootadoptedstylesheets="s1 s2 s3 ./external.css non-existing">
      <template
        shadowrootmode="open"
        shadowrootadoptedstylesheets="s1 s2 s3 ./external.css non-existing"
      >
        <p data-testid="p8">
          text
          <span data-testid="span8">text</span>
          <b data-testid="b8">text</b>
        </p>
      </template>
    </div>
    `,
    );
  });

  await expect(page.getByTestId("p8")).toHaveCSS(
    "text-decoration",
    "underline",
  );
  await expect(page.getByTestId("span8")).toHaveCSS(
    "text-decoration",
    "double",
  );
  await expect(page.getByTestId("b8")).toHaveCSS("padding", "4px");
});
