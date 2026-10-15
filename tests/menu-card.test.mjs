import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const componentSource = await readFile(new URL("../app/components/menu-card-content.tsx", import.meta.url), "utf8");
const componentJs = ts.transpileModule(componentSource, { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href));
const { MenuCardCourses, ArchiveCardArc } = await import("data:text/javascript;base64," + Buffer.from(componentJs).toString("base64"));
const fontSource = await readFile(new URL("../app/menu-fonts-shared.ts", import.meta.url), "utf8");
const fontJs = ts.transpileModule(fontSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { TEMPLATE_DEFAULT_FONTS, BUILTIN_MENU_FONTS } = await import("data:text/javascript;base64," + Buffer.from(fontJs).toString("base64"));
const courses = ["starter", "main", "staple", "soup"].map(id => ({ id, label: id, english: id, dishes: Array.from({ length: id === "main" ? 24 : 2 }, (_, n) => ({ name: `${id}-${n}`, description: "这是完整的菜品介绍，保留较长文字以检查不会遗漏内容。".repeat(3) })) }));

test("all 18 templates render complete descriptions and support hiding them", () => {
  assert.equal(Object.keys(TEMPLATE_DEFAULT_FONTS).length, 18);
  for (const template of Object.keys(TEMPLATE_DEFAULT_FONTS)) {
    const html = renderToStaticMarkup(React.createElement(MenuCardCourses, { template, courses }));
    assert.equal((html.match(/<article>/g) || []).length, 30, template);
    assert.equal((html.match(/这是完整的菜品介绍/g) || []).length, 90, template);
    const hidden = renderToStaticMarkup(React.createElement(MenuCardCourses, { template, courses, showDescriptions: false }));
    assert.ok(!hidden.includes("这是完整的菜品介绍"), template);
    assert.equal((hidden.match(/<article>/g) || []).length, 30, template);
    assert.ok(TEMPLATE_DEFAULT_FONTS[template] === "system-serif" || BUILTIN_MENU_FONTS.some(font => font.id === TEMPLATE_DEFAULT_FONTS[template]), template);
  }
});

test("atlas keeps three left sections and one full right column, including missing categories", () => {
  for (const items of [courses, courses.filter(course => course.id === "main")]) {
    const html = renderToStaticMarkup(React.createElement(MenuCardCourses, { template: "ingredient-atlas", courses: items }));
    const left = html.slice(html.indexOf('class="ingredient-atlas-left"'), html.indexOf('<section data-course="main">'));
    assert.deepEqual([...left.matchAll(/data-course="([^"]+)"/g)].map(match => match[1]), ["starter", "staple", "soup"]);
    assert.equal((html.match(/data-course="main"/g) || []).length, 1);
  }
  const arc = renderToStaticMarkup(React.createElement(ArchiveCardArc, { id: "test-arc" }));
  assert.equal((arc.match(/<textPath/g) || []).length, 5);
  assert.ok(arc.includes('startOffset="50%" text-anchor="middle">小'));
});

test("every referenced banquet image and default font is present in the release", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const assets = new Set([...styles.matchAll(/url\("(\/banquet\/[^"?]+)"\)/g)].map(match => match[1]));
  for (const asset of assets) {
    const bytes = await readFile(new URL(`../public${asset}`, import.meta.url));
    const meta = await sharp(bytes).metadata();
    assert.ok(meta.width >= 100 && meta.height >= 100, asset);
  }
  assert.ok(assets.has("/banquet/birthday-candlelight.webp"));
  assert.ok(assets.has("/banquet/birthday-ribbon-flowers.png"));
  assert.ok(assets.has("/banquet/birthday-middle-botanical.png"));
});
