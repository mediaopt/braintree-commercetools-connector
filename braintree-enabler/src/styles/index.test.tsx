import { renderMaskButtonClasses } from "./index";

test("class names include full width", () => {
  const result = renderMaskButtonClasses(true, false, false);
  expect(result).toContain("w-full");
});

test("class names include enable class", () => {
  const result = renderMaskButtonClasses(false, true, false);
  expect(result).toContain(
    "focus:ring-2 focus:ring-blue-500 bg-blue-500 hover:bg-blue-600"
  );
});

test("class names include disable class", () => {
  const result = renderMaskButtonClasses(false, false, true);
  expect(result).toContain("bg-gray-500");
});
