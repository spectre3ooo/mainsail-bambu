# BAMBU_FORK

This repository is a fork of [`mainsail-crew/mainsail`](https://github.com/mainsail-crew/mainsail)
that adds Bambu-aware panels and workflows on top of vanilla Mainsail.
It exists to support
[`spectre3ooo/bambu-raker`](https://github.com/spectre3ooo/bambu-raker)
— a Bambu→Moonraker bridge that talks to Bambu Lab printers over LAN.

## Goals

- A user with a vanilla Klipper / Moonraker setup installing this
  fork sees the **exact same Mainsail experience** they would get
  from upstream. No new panels, no new behaviors, no cosmetic changes.
- A user with a `bambu-raker` backend sees the same Mainsail UX
  **plus** Bambu-specific panels (AMS, calibration, scan-to-assign,
  HMS announcements, etc.).
- Detection is automatic and based on the backend's `server.info`
  `components` list — no client configuration needed.

## Detection

The fork keys all Bambu-aware UI on the presence of `bambu_raker` in
the Moonraker `server.info.components` array. `bambu-raker`
advertises this string; vanilla Moonraker never does. See
`src/bambu/detection.ts`.

## Layout

All fork-specific code lives under `src/bambu/`. The fork avoids
modifying existing Mainsail files except for the minimum necessary
mount points (currently a single Vue component reference in
`src/components/TheTopbar.vue`). Each such modification is annotated
with a `Bambu fork:` comment so a future rebase clearly separates
our additions from upstream changes.

## Upstream sync

`upstream` remote points at `mainsail-crew/mainsail`. Rebase cadence
is roughly every 6 weeks (~Mainsail's release cadence). Conflict
surface should stay small because:

- All new Vue components are in `src/bambu/components/`
- Detection logic is a single standalone module in `src/bambu/`
- The only existing-file edits are tightly bounded and marked

If a rebase brings substantial conflicts, the plan is documented at
[bambu-raker docs/superpowers/plans/2026-05-11-mainsail-fork.md](https://github.com/spectre3ooo/bambu-raker/blob/main/docs/superpowers/plans/2026-05-11-mainsail-fork.md).

## Releases

Merges to `master` are built by GitHub Actions and published as a
GitHub release with a `mainsail.zip` asset. bambu-raker can install
that asset by setting `MAINSAIL_REPO=spectre3ooo/mainsail-bambu` and
`MAINSAIL_VERSION` to either a specific tag or `latest`.

## License

Inherits Mainsail's GPL-3.0-or-later license. All additions are also
GPL-3.0-or-later. See the unmodified `LICENSE` file at the repo root.

## Contributing back to upstream

For any change that is **not** Bambu-specific (general Mainsail
improvement, bug fix, etc.), prefer opening a PR against
`mainsail-crew/mainsail` directly rather than landing it here. The
fork should stay narrowly scoped to Bambu-aware behavior.
