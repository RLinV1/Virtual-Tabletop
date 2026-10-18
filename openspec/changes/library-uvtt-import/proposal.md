# Proposal

## Why

A GM should be able to prepare a reusable UVTT map without creating a room. The library already stores map grids, walls and portal metadata, but its uploader accepts only images. Room UVTT uploads also bypass the library-saving option, and library placement copies geometry after applying the map.

## What Changes

- Import UVTT, DD2VTT and DF2VTT directly into the account's map library through the existing bounded validator.
- Save image, exact grid and complete geometry together; open the existing library editor for review and retain import warnings.
- Honor the room editor's library-saving option for UVTT while retaining private preview and Apply.
- Resolve owned library geometry on the server and apply map/grid/walls/fog/token adjustments in one reversible MapSet.

## Capabilities

### Modified Capabilities

- `asset-library`: Complete UVTT map imports, account authorization and reusable geometry.
- `map-preparation`: Atomic placement of server-resolved library maps and consistent room upload saving.

## Impact

Shared command/context/REST response contracts; upload routes and helpers; Postgres's existing asset insert; room FIFO; library and GM map editors. No database migration or new file parser. ADR 0043 requires Raymond Lin's architecture review. Builds on KAN-43/44/49 and ADRs 0037/0041/0042; keep the feature PR unmerged for the user.
