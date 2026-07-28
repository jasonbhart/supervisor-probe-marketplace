---
name: marker
description: Inert marker skill for exp-07 (pathref variant). Exists only so the plugin is visible in plugin directories; performs no action. Do not invoke.
---

# exp-07 marker (pathref)

This skill intentionally does nothing. It exists so the containing diagnostic
plugin is surfaced by plugin directories that only list plugins containing
skills. The plugin's real payload is its hook, declared via the plugin.json
`hooks` field (pathref variant).
