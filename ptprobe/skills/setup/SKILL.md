---
name: setup
description: Connect this workspace to the supervisory review service. Use when the user runs /ptprobe:setup, asks to connect/pair/authenticate the prooftrail plugin, or when a review was skipped because the plugin is not connected.
---

# Prooftrail setup (pairing)

Connect the plugin to the review service by exchanging a short-lived setup code for
a device token. The token is written to the plugin's data directory; the setup code
is the only thing the user pastes into the conversation (ADR-007 — the long-lived
token never transits chat).

## Steps

1. **Check if already connected.** If `${CLAUDE_PLUGIN_DATA}/auth.json` exists and is
   non-empty, tell the user they're already connected and stop (offer to re-pair only
   if they ask).

2. **Point the user to the dashboard.** The dashboard's address is not derivable
   from `SERVICE_URL` (that is the review API's origin; the dashboard is a
   separate origin). The current dashboard is:

   **https://supervisor-dashboard.pages.dev/setup**

   Tell the user, verbatim-ish:
   > Open **https://supervisor-dashboard.pages.dev/setup** in any browser, sign
   > in, and copy the 8-character setup code. Paste it here.

   The dashboard runs in the user's own browser — no sandbox egress needed for it.

   If that address does not work (self-hosted, or the service has since moved to
   its own domain), ask the user: "What's the URL for your review dashboard's
   setup page?" — and use what they give you. Do not invent a different one; in
   particular do NOT guess a hostname from the product name, as the dashboard
   origin does not track the product name.

   **Service URL:** the plugin ships with the hosted service's URL as a
   built-in default (since 2026-07-29), so most users configure nothing.
   Self-hosted deployments override it via the `SERVICE_URL` plugin setting
   or `REVIEWSVC_URL`. If step 3 prints `service URL not configured`, this is
   a stripped/self-hosted build — ask the user for their review API origin.

3. **Exchange the code.** When the user pastes a code like `WXYZ-2345`, run
   **exactly this**, including both environment variables:

   ```bash
   CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" \
   CLAUDE_PLUGIN_OPTION_SERVICE_URL="${CLAUDE_PLUGIN_OPTION_SERVICE_URL}" \
   node "${CLAUDE_PLUGIN_ROOT}/scripts/pair.js" <CODE>
   ```

   **Do not drop those env vars, and do not assume the plugin's settings reach
   this process.** They do not. A Bash tool call does NOT inherit this plugin's
   hook environment — verified on a real install 2026-07-28, where the ambient
   `CLAUDE_PLUGIN_DATA` pointed at a *different installed plugin's* data
   directory and `CLAUDE_PLUGIN_ROOT` was unset entirely. Without the override,
   `pair.js` would write this plugin's live 90-day token into that other
   plugin's directory and still print success, while the Stop hook (which runs
   with the correct environment) looks in the right place, finds nothing, and
   reports "not connected" forever — so each retry leaks another token. The
   values above are interpolated from the skill's own context, which is correct;
   the process environment is not. `pair.js` now also refuses outright if it
   detects it is about to write into another plugin's directory.

   If it prints `service URL not configured`, the `SERVICE_URL` setting did not
   reach the process. Ask the user for the review API origin and retry with it
   supplied explicitly:

   ```bash
   CLAUDE_PLUGIN_DATA="${CLAUDE_PLUGIN_DATA}" \
   REVIEWSVC_URL="<origin the user gave>" \
   node "${CLAUDE_PLUGIN_ROOT}/scripts/pair.js" <CODE>
   ```

   A failure here happens *before* any network call, so the setup code is NOT
   consumed — reuse the same one.

   The script exchanges the code, writes the token to
   `${CLAUDE_PLUGIN_DATA}/auth.json` (mode 0600), and then confirms the pair
   stuck by calling `/auth/whoami` **in-process** — the token never transits
   a subprocess argv (and so never appears in `ps`/`/proc` or shell history).

4. **Relay the script's own stdout to the user, verbatim.** `pair.js` already prints
   exactly one of these lines — do not re-derive or re-check anything yourself:
   - `Prooftrail: connected as <label> (<plan>, <used>/<limit> reviews).` — pairing
     confirmed; relay it as-is.
   - `Prooftrail: pairing did not stick (token not recognized) — please re-run setup.`
     — tell the user to re-run `/ptprobe:setup` with a fresh code.
   - `Prooftrail: connected, but couldn't confirm right now — do not re-pair.` — the
     service couldn't be reached to confirm (e.g. a transient outage), but pairing
     itself succeeded; tell the user they're connected and NOT to request a new code.

   If the script exits non-zero instead, relay its stderr (e.g. "request a fresh
   code") — codes are single-use and expire in 10 minutes — and stop.

5. **Tell the user to restart their session — pairing alone does NOT start reviews.**
   On a successful pair, always finish with:

   > Restart your Claude Code session to activate reviews. Pairing is saved, but
   > the hooks don't start firing until a session that begins after the install.

   This is not optional politeness. Claude Code snapshots plugin state at session
   start (docs/05 bug register, upstream #68020), so a plugin installed mid-session
   has its **skill** available immediately — which is how this pairing flow ran at
   all — while its **hooks are not wired**. Verified 2026-07-28 on a real install:
   after a successful pair, the session ended and *nothing happened*. No captured
   prompt, no review, no notice. Every visible signal said it was working.

   That silence is the failure mode to prevent: the user sees the skill appear,
   pairs, gets `connected as … (free, N/50 reviews)`, and concludes the product is
   running when it is completely inert. Say the restart line every time.

## Sandbox surfaces (Cowork local VM and cloud) — pairing is PER-SESSION here

**Check the surface first.** The signals that this session is a Cowork sandbox:
the hostname is `vm`, `CLAUDE_CODE_ENTRYPOINT` is `remote_cowork`, or
`${CLAUDE_PLUGIN_DATA}` looks like `/root/.claude/plugins/data/<name>-inline`
(verified exp-08).

**Pairing works here — but only for this session.** Sandbox plugin data is wiped
between sessions (exp-05), and claude.ai has no editor for the API_TOKEN setting
(upstream anthropics/claude-code#39455), so a pairing cannot persist the normal
way. Egress to the service works (verified 2026-07-29), so proceed with the
normal code-exchange flow above — and tell the user, plainly and BEFORE they
fetch a code:

> Pairing will work for this session only — sandbox plugin data is wiped between
> sessions. You'll need a fresh setup code next session, unless you persist the
> token in your project (below).

**Persisting across sessions — the workspace token file.** This is the user's
job on their own machine, NOT something you do from inside the sandbox.

> **NEVER route the token through this conversation.** Do not offer to write,
> attach, download, upload, display, or otherwise move `auth.json` through the
> chat — not as a file card, not as an attachment, not as text. ADR-007 exists
> precisely so the long-lived token never transits the conversation; that is the
> entire reason pairing uses a disposable single-use code instead. A sandbox has
> no direct write path to the user's own folders, and the apparent workaround —
> passing the credential through chat to get it there — is the specific thing
> the design forbids. If you find yourself reasoning toward it, stop.

The correct direction is the reverse: the token never leaves the user's machine.
Tell them to do this themselves, on a **host** surface:

> Pair on a host surface (Claude Code CLI, the desktop Code tab, or an SSH
> session). That writes `auth.json` into the plugin's data directory on your own
> machine. Copy it to `.prooftrail/auth.json` inside the folder you attach to
> Cowork — the file then syncs INTO the sandbox as part of your project, and
> Prooftrail finds it there automatically. The token never passes through a
> conversation.

If they would rather not, per-session pairing is a perfectly good answer: one
fresh setup code at the start of each session, about thirty seconds. Say so
plainly rather than pushing persistence — note that each pairing consumes a
device token, so a user pairing every session will accumulate them.

`/ptprobe:doctor` afterwards confirms the state either way.

## Notes
- Tokens are per-surface (host / local-VM / cloud). If the user works across surfaces,
  each pairs once.
- Never ask the user for the token directly, and never echo it. Only the disposable
  setup code belongs in the conversation.
- If reviews still do not appear after pairing and a restart, run
  `/ptprobe:doctor` — it names the cause, including the duplicate-install case
  that silently strips hooks.
