---
name: psana-xtc-config
description: Use when reasoning about LCLS2 xtc2 Configure dgrams, Names/NamesId/NamesLookup, ShapesData/Data layout, dgram.cc conversion, detector segment mapping, DescData offsets/shapes, or building CPU/GPU metadata tables from Configure.
---

# psana XTC Configure

Use this skill for psana work that depends on how xtc2 data is described by
Configure dgrams and interpreted for L1Accept/event dgrams.

## Quick Workflow

1. Start from current source in `~/lcls2`; do not rely on memory alone.
2. Inspect `psana/src/dgram.cc` first when tracing Python `Dgram` behavior.
3. Inspect `xtcdata/xtcdata/xtc/ShapesData.hh`, `DescData.hh`,
   `NameIndex.hh`, and `NamesId.hh` for the XTC schema and lookup mechanics.
4. For detector-specific Configure writers, inspect the relevant DRP source
   such as `psdaq/drp/Jungfrau.cc`.
5. When explaining event interpretation, separate:
   - Configure-time schema metadata: `Names`, detector name, alg, segment,
     fields, types, ranks, and `NamesId`.
   - Event-time data blocks: `ShapesData`, `Shapes`, `Data`, and payload bytes.

## Core Model

Configure dgrams contain `Names` records. Event dgrams contain `ShapesData`
records. The event `ShapesData` carries a `NamesId` in its XTC `src`; psana
uses that `NamesId` to find the matching Configure `Names` through
`NamesLookup`.

For Python event materialization, `dgram.cc` does:

```text
ShapesData.namesId()
  -> config NamesLookup[namesId]
  -> NameIndex / Names
  -> DescData(shapesdata, nameIndex)
  -> dictAssign(..., names.segment())
```

So detector segment numbers are recovered from Configure metadata, not from a
separate segment field in the L1Accept `ShapesData`.

## Source Map

- `psana/src/dgram.cc`: Python `Dgram`, Configure parsing, event conversion.
- `xtcdata/xtcdata/xtc/ShapesData.hh`: `Names`, `ShapesData`, `Shapes`, `Data`.
- `xtcdata/xtcdata/xtc/DescData.hh`: combines event `ShapesData` with Configure
  `NameIndex` to compute offsets and shapes.
- `xtcdata/xtcdata/xtc/NameIndex.hh`: field name maps and shape-index maps.
- `xtcdata/xtcdata/xtc/NamesId.hh`: encodes `nodeId` and `namesId`.
- `xtcdata/xtcdata/xtc/src/NamesIter.cc`: builds `NamesLookup`.
- `psdaq/drp/Jungfrau.cc`: concrete Jungfrau Configure and event writer.

## Detailed Reference

Read `references/configure-names-shapesdata.md` when the task needs precise
line-level reasoning about `NamesId`, segment mapping, payload offsets, or
GPU metadata-table design.

