#!/usr/bin/env node
// supervisor-probe v0.3.0 — plugin-data persistence probe (experiment 05).
// Log-only: NEVER blocks or interferes with the session.
//
// On every hooked event it:
//   1. ensures a per-session "birth marker" exists in ${CLAUDE_PLUGIN_DATA}
//      (birth-<sessionid-prefix>.json with session id + timestamp),
//   2. lists ALL birth markers currently present (name + content),
//   3. appends a record to supervisor-probe-log.jsonl in the session cwd AND
//      the plugin data dir, including the actual CLAUDE_PLUGIN_ROOT/DATA paths.
//
// Persistence verdict comes from session B seeing session A's marker.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const EVENT = process.argv[2] || "unknown";

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let evt = {};
  try { evt = JSON.parse(raw); } catch {}

  const dataDir = process.env.CLAUDE_PLUGIN_DATA || "";
  const sid = evt.session_id || "unknown";
  let markers = [];
  let markerError = null;

  if (dataDir) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const mine = path.join(dataDir, `birth-${sid.slice(0, 8)}.json`);
      if (!fs.existsSync(mine)) {
        fs.writeFileSync(mine, JSON.stringify({ session_id: sid, born: new Date().toISOString() }));
      }
      markers = fs.readdirSync(dataDir)
        .filter((f) => f.startsWith("birth-"))
        .map((f) => {
          let content = null;
          try { content = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8")); } catch {}
          return { file: f, content };
        });
    } catch (e) {
      markerError = String(e && e.message);
    }
  }

  const record = {
    probe_ts: new Date().toISOString(),
    probe_version: "0.3.0",
    event: EVENT,
    session_id: sid,
    cwd: evt.cwd,
    env: {
      platform: process.platform,
      hostname: os.hostname(),
      node: process.version,
      plugin_root: process.env.CLAUDE_PLUGIN_ROOT || null,
      plugin_data: dataDir || null,
    },
    markers_seen: markers,
    marker_error: markerError,
    received_keys: Object.keys(evt).sort(),
  };
  if (EVENT === "Stop") {
    record.stop_hook_active = evt.stop_hook_active;
    record.transcript_exists = evt.transcript_path ? fs.existsSync(evt.transcript_path) : null;
  }

  const line = JSON.stringify(record) + "\n";
  const targets = [path.join(evt.cwd || process.cwd(), "supervisor-probe-log.jsonl")];
  if (dataDir) targets.push(path.join(dataDir, "supervisor-probe-log.jsonl"));
  let wrote = false;
  for (const t of targets) {
    try { fs.appendFileSync(t, line); wrote = true; } catch {}
  }
  if (!wrote) process.stderr.write("supervisor-probe: all log targets unwritable\n");
  process.exit(0);
});
