# ADR 0031 — Detection identity and map editor command context

- **Status:** Proposed; needs Real-Time Architecture owner review
- **Covers:** FR-GM-09, FR-GM-11, FR-GM-15, ADR 0029

## Context

Two detection results can have equal wall counts while containing different walls. Exclusions by index must refer to the exact ordered result the GM edited. A private map draft can also take multiple commands to save while another GM changes the applied map.

## Decision

The GM-only detected-wall response carries `resultId`, the SHA-256 digest of the validated ordered wall array serialized as JSON. `wall.applyDetected.exclude` carries this identity instead of a wall count. Both the shared decision boundary and the private draft adapter reject exclusions whose identity differs from the result being applied. Results with identical ordered walls have identical exclusion semantics; worker jobs and preview image data remain unchanged.

Draft Save attaches optional `expectedMapUrl` to each `fog.add`, `fog.remove`, `wall.add`, `wall.remove`, `wall.clear`, and `portal.set` command. The shared decision boundary rejects these commands if the applied map URL differs, before producing events. Existing direct commands may omit the field. Save planning requires the draft and room map URLs to agree.

The client binds draft mutations and pending detection fetches to one editor session and map. Closing, reopening, discarding, or switching maps invalidates that session. A stale Save stops before its next command and cannot close a newer editor session.

## Consequences

The server and web client must deploy together for the changed exclusion and detected-wall response contracts. Persisted events, worker payloads, and room state schemas do not change. Save remains sequential rather than atomic: commands accepted before a map change stay committed, while subsequent commands are refused. Map identity follows the existing URL-based wall lifetime.
