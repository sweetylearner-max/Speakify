import { cpSync, existsSync, mkdirSync } from "node:fs";
const src = "node_modules/@mediapipe/tasks-vision/wasm";
if (existsSync(src)) {
  mkdirSync("public/mediapipe/wasm", { recursive: true });
  cpSync(src, "public/mediapipe/wasm", { recursive: true });
}
