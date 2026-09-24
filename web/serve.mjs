// Production entry point for the service managers (systemd on Linux, WinSW on Windows).
// Runs `next start` from wherever pnpm installed Next, which with the workspace's hoisted
// node_modules is the repository root rather than web/node_modules.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const host = process.env.HOST || "127.0.0.1";
const port = process.env.PORT || "3000";
process.argv = [process.argv[0], "next", "start", "--hostname", host, "--port", port];
await import(pathToFileURL(require.resolve("next/dist/bin/next")).href);
