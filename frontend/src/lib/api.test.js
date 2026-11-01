import { img } from "./api";

test("img omits a source when no image path is available", () => {
  expect(img("")).toBeUndefined();
  expect(img(null)).toBeUndefined();
});

test("img resolves relative media paths and preserves absolute URLs", () => {
  expect(img("products/dress.webp")).toMatch(/\/api\/media\/products\/dress\.webp$/);
  expect(img("https://cdn.example.test/dress.webp")).toBe("https://cdn.example.test/dress.webp");
});
