# supervisor-probe-marketplace

Temporary marketplace hosting a single diagnostic plugin for a Claude Cowork plumbing
experiment: does the per-plugin data directory persist across sessions?

The plugin (supervisor-probe v0.3.0) is **log-only** - it records hook lifecycle events
and plugin-data markers to `supervisor-probe-log.jsonl` in the session working folder.
It never blocks, modifies, or interferes with anything. Expect this repo to disappear
when the experiment concludes.
