# Read-only sharing export

Research OS can produce a disposable share projection from selected public
records. The canonical Markdown vault remains authoritative; exports are for
discussion, navigation, and handoff only.

The export foundation provides three complementary forms:

- `buildLabShareSnapshot(...)` — compact Markdown for humans and agents.
- `buildLabShareManifest(...)` — `research-os-share-v1` JSON with stable IDs,
  typed connections, source links, provenance hash when supplied, and an
  exclusion manifest. Known private/restricted connection targets are removed
  and counted rather than leaking their stable IDs.
- `buildLabShareHtml(...)` — a script-free, self-contained HTML presentation
  with inline styles, escaped content, source hyperlinks, and the JSON manifest
  in a collapsed section.

Private and restricted records are excluded, and unsupported record types are
not rendered as cards. A selected record may inherit links from an explicitly
connected public paper/source/evidence record, but private source links are
never inherited. Raw record bodies, staging literature runs, and hidden
reasoning are not copied.

The HTML renderer follows the browser security boundary: untrusted text is
HTML-escaped, links are limited to `http`/`https`, no inline scripts or event
handlers are emitted, and the artifact includes a restrictive document CSP.
This follows the OWASP output-encoding guidance and MDN’s CSP guidance.

Email support intentionally stops at a short plain-text draft and `mailto:`
fallback. RFC 6068 does not provide a general attachment or rich-HTML email
transport. The draft tells the user to attach the generated HTML/Markdown/JSON
manually, or
the future UI may invoke the Web Share API after checking `navigator.canShare`.
That API is capability- and secure-context-dependent, so download/copy remains
the required fallback; no provider OAuth or automatic sending is performed.

Research references:

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [MDN Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API)
- [MDN Navigator.share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)
- [MDN Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
- [RFC 6068 mailto URI scheme](https://www.rfc-editor.org/rfc/rfc6068)
