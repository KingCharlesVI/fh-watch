const fs = require("node:fs");
const path = require("node:path");

/**
 * The Apple Watch app, built into the iPhone app by @bacons/apple-targets at prebuild
 * (see docs/design.md). Everything in this folder is compiled into it; the engine
 * in Engine/ is also a Swift package for tests (../Package.swift).
 *
 * The watch app's version must match the iPhone app's, so Info.plist is written
 * here from the Expo config on every prebuild (and ignored by git).
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => {
  const plist = {
    CFBundleDisplayName: "FH Match Centre",
    CFBundleShortVersionString: config.version,
    CFBundleVersion: String(config.ios?.buildNumber ?? "1"),
    WKApplication: true,
    // Umpiring needs no phone; the phone is only for syncing afterwards.
    WKRunsIndependentlyOfCompanionApp: true,
    // A workout session keeps the clock, timers and haptics going with the wrist down.
    WKBackgroundModes: ["workout-processing"],
    NSHealthShareUsageDescription: "Your heart rate, distance, steps and calories during a match, for your workout summary.",
    NSHealthUpdateUsageDescription: "Keeps the match running with your wrist down, and saves each match as a workout in Health if you turn that on.",
  };
  fs.writeFileSync(path.join(__dirname, "Info.plist"), toPlist(plist));

  return {
    type: "watch",
    name: "FHMatchCentreWatch",
    displayName: "FH Match Centre",
    bundleIdentifier: ".watchkitapp",
    deploymentTarget: "10.0",
    icon: "../../assets/icon.png",
    colors: { $accent: "#106C3E" },
    frameworks: ["SwiftUI", "HealthKit", "WatchConnectivity"],
    entitlements: {
      "com.apple.developer.healthkit": true,
      "com.apple.developer.healthkit.access": [],
    },
  };
};

function toPlist(obj) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const value = (v) => {
    if (v === true) return "<true/>";
    if (v === false) return "<false/>";
    if (Array.isArray(v)) return `<array>${v.map(value).join("")}</array>`;
    return `<string>${esc(v)}</string>`;
  };
  const body = Object.entries(obj)
    .map(([k, v]) => `\t<key>${esc(k)}</key>\n\t${value(v)}`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}
