#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const required = [
  {
    dir: path.join(root, "ios", "sherpa-onnx.xcframework"),
    label: "ios/sherpa-onnx.xcframework",
  },
  {
    dir: path.join(root, "ios", "onnxruntime.xcframework"),
    label: "ios/onnxruntime.xcframework",
  },
  {
    dir: path.join(root, "android", "src", "main", "jniLibs", "arm64-v8a"),
    label: "android/src/main/jniLibs/arm64-v8a",
  },
  {
    dir: path.join(root, "android", "src", "main", "jniLibs", "armeabi-v7a"),
    label: "android/src/main/jniLibs/armeabi-v7a",
  },
  {
    dir: path.join(root, "android", "src", "main", "jniLibs", "x86_64"),
    label: "android/src/main/jniLibs/x86_64",
  },
];

const missing = [];

for (const { dir, label } of required) {
  if (!fs.existsSync(dir)) {
    missing.push(label);
    continue;
  }
  const entries = fs.readdirSync(dir);
  if (entries.length === 0) {
    missing.push(`${label} (empty)`);
  }
}

if (missing.length > 0) {
  console.error("ERROR: Required native binaries are missing or empty:");
  for (const m of missing) {
    console.error(`  - ${m}`);
  }
  console.error(
    '\nSee CONTRIBUTING.md "Building Native Binaries" for build instructions.'
  );
  process.exit(1);
}

console.log("All native binaries verified.");
