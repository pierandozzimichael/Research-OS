# Figure attachment contract

Figures are optional, local-first research context. They are not evidence by
default and do not change a record's review state, confidence, or claim status.

Store figure metadata in the canonical record frontmatter under `figures`.
Each useful figure should include a stable `id`, a factual `caption`, usable
`alt` text, `source_url`, a precise `locator` such as `Figure 2C`, and an
`evidence_status` of `staged`, `source-linked`, or `human-reviewed`.

An optional `path` points to a local asset relative to the selected vault, for
example `16 Media/FIG-PAP-014-01.png`. Do not put private lab figures in
`public/`, and do not fetch or redistribute publisher figures automatically.

For every local `path`, retain the upload-provided `mime_type` and
`asset_sha256`. `pnpm figures:check` verifies the path boundary, image
signature, size limit, and hash before a release. A failed check means the
asset must be re-uploaded or its manifest corrected; never replace the stored
hash merely to silence the error.

AI agents may propose a manifest entry or stage a local asset when permitted.
They must preserve provenance, never mark a figure `human-reviewed`, and never
use the presence of a figure as support for a claim. A frontier agent should
prefer a source link and locator when an image does not add decision-relevant
information.
