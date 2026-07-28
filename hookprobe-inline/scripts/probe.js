#!/usr/bin/env node
// exp-07 diagnostic hook: writes a marker file proving this hook executed,
// with enough env detail to attribute WHICH install channel ran it.
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
(async () => {
  try {
    let raw = '';
    for await (const c of process.stdin) raw += c;
    let evt = {}; try { evt = JSON.parse(raw); } catch {}
    const dir = path.join(os.tmpdir(), 'exp07');
    fs.mkdirSync(dir, { recursive: true });
    const tag = process.argv[2] || 'unknown';
    fs.writeFileSync(path.join(dir, `marker-${tag}-${Date.now()}.json`), JSON.stringify({
      tag,
      session_id: evt.session_id || null,
      plugin_root: process.env.CLAUDE_PLUGIN_ROOT || null,
      plugin_data: process.env.CLAUDE_PLUGIN_DATA || null,
      cwd: process.cwd(),
      ts: new Date().toISOString(),
    }, null, 2));
  } catch {}
  process.exit(0);
})();
