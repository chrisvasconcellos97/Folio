// scripts/render-pip-icon.js — generate the app icon + docs logo from the
// FROZEN Pip geometry (src/lib/pip3dGeometry.js). Never draws Pip by hand:
// the SVG is composed from buildPipFrame() exactly like PipOrb3D renders it,
// so the icon is mathematically the same Pip as the app.
//
// Outputs:
//   public/icon-512.png, public/icon-192.png  (dark bg, PWA/home-screen)
//   docs/assets/pip-logo.svg                  (transparent bg, PDF headers)
//
// Run: node scripts/render-pip-icon.js   (then `npm run docs:pdf` to re-embed
// the logo in the committed PDFs)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { PIP_SPEC, buildPipFrame } from "../src/lib/pip3dGeometry.js";

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var ROOT = path.join(__dirname, "..");

// Fixed frame — same t the mockups use for static renders (mid-breath, cells open).
var T = 1.1;

// Dark-theme work palette, baked concrete (standalone assets can't read app tokens).
var ACCENT = "#4db896", ACCENT_HI = "#9ff0d2", ACCENT_DEEP = "#2d8f70";
var BG = "#0D1F1C"; // manifest theme_color — matches the installed-app chrome

var BUCKET_COLORS = [ACCENT_DEEP, ACCENT, ACCENT, ACCENT_HI];

function pathEls(paths, range, sw, bOpa, bSw) {
  var out = "";
  for (var i = range[0]; i < range[1]; i++) {
    out += '<path fill="none" stroke="' + BUCKET_COLORS[i] +
      '" stroke-width="' + (sw * bSw[i]).toFixed(2) +
      '" opacity="' + bOpa[i] + '" stroke-linejoin="round" d="' + (paths[i] || "M0 0") + '"/>';
  }
  return out;
}

function buildSvg() {
  var f = buildPipFrame(T);
  var sw = PIP_SPEC.ring.sw;
  var bOpa = PIP_SPEC.bucketOpacities;
  var bSw = PIP_SPEC.bucketSwMult;
  var og = PIP_SPEC.outerGlowGrad;
  var cg = PIP_SPEC.coreGrad;

  function coreGradient(id) {
    var stopColors = [ACCENT_HI, ACCENT, ACCENT];
    return '<radialGradient id="' + id + '" cx="' + cg.cx + '" cy="' + cg.cy + '" r="' + cg.r + '">' +
      cg.stops.map(function (s, i) {
        return '<stop offset="' + s.offset + '" stop-color="' + stopColors[i] + '" stop-opacity="' + s.opacity + '"/>';
      }).join("") + "</radialGradient>";
  }

  var defs = "<defs>" +
    '<radialGradient id="og">' +
    og.stops.map(function (s) {
      return '<stop offset="' + s.offset + '" stop-color="' + ACCENT + '" stop-opacity="' + s.opacity + '"/>';
    }).join("") + "</radialGradient>" +
    coreGradient("hc") + coreGradient("tc") + "</defs>";

  var glow = '<circle cx="0" cy="0" r="' + og.r + '" fill="url(#og)" opacity="' + f.outerGlowOpacity.toFixed(2) + '"/>';
  var ringBack = "<g>" + pathEls(f.ringPaths, [0, 2], sw, bOpa, bSw) + "</g>";
  var ringFront = "<g>" + pathEls(f.ringPaths, [2, 4], sw, bOpa, bSw) + "</g>";

  function sphere(spec, paths, coreR, gradId) {
    return '<g opacity="' + spec.opacity + '">' +
      '<circle cx="' + spec.cx + '" cy="' + spec.cy + '" r="' + coreR + '" fill="url(#' + gradId + ')" opacity="' + f.coreOpacity.toFixed(2) + '"/>' +
      pathEls(paths, [0, 2], sw, bOpa, bSw) + pathEls(paths, [2, 4], sw, bOpa, bSw) +
      "</g>";
  }

  var spheres = '<g transform="scale(' + f.sphereScale.toFixed(3) + ')">' +
    sphere(PIP_SPEC.sphereTail, f.tailPaths, f.tailCoreR, "tc") +
    sphere(PIP_SPEC.sphereHead, f.headPaths, f.headCoreR, "hc") +
    "</g>";

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + PIP_SPEC.viewBox + '">' +
    defs + glow + ringBack + spheres + ringFront + "</svg>";
}

async function main() {
  var svg = buildSvg();

  // 1. docs logo — transparent bg, same 120-box interface as the old logo
  var logo = svg.replace("<svg ", '<svg width="120" height="120" ');
  fs.writeFileSync(path.join(ROOT, "docs/assets/pip-logo.svg"), logo + "\n");
  console.log("wrote docs/assets/pip-logo.svg");

  // 2. PNG icons — dark bg, Pip at ~78% of canvas
  var html = "<!doctype html><html><body style=\"margin:0;background:" + BG + "\">" +
    "<div style=\"width:512px;height:512px;display:grid;place-items:center\">" +
    "<div style=\"width:400px;height:400px\">" + svg.replace("<svg ", '<svg style="width:100%;height:100%" ') + "</div>" +
    "</div></body></html>";

  var browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  var page = await browser.newPage();
  await page.setViewport({ width: 512, height: 512 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(ROOT, "public/icon-512.png") });
  console.log("wrote public/icon-512.png");
  await page.setViewport({ width: 192, height: 192 });
  await page.evaluate(function () {
    var d = document.body.firstChild;
    d.style.width = d.style.height = "192px";
    d.firstChild.style.width = d.firstChild.style.height = "150px";
  });
  await page.screenshot({ path: path.join(ROOT, "public/icon-192.png") });
  console.log("wrote public/icon-192.png");
  await browser.close();
}

main().catch(function (e) { console.error(e); process.exit(1); });
