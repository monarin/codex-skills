---
name: epix-quad-1kfps-troubleshoot
description: Use with daq-troubleshoot when diagnosing UED ePix Quad/ePixQuad1kfps detector DAQ issues, including epixquad1kfps DRP logs, epixQuadDAQ, FPGA devGui, EventBuilder.Bypass 0x4, missing subframes, zero/1600-byte image subframes, AsicMask Configure errors, ADC calibration mismatch, UED timing sequence issues, trigger-delay/start_ns, and PGP/PCIe firmware checks.
---

# ePix Quad 1kfps Troubleshoot

Use `daq-troubleshoot` as the primary workflow for live hutch work: logs first,
TEB/DRP/control grouping, detector node health, timing, then summary. This skill
adds only ePixQuad1kfps-specific checks and known failure modes.

## First Checks

- Locate the newest `epixquad1kfps` detector log group and inspect the matching
  detector/DRP, `control.log`, and `teb*` logs before changing anything.
- Confirm the detector node and device path from the logs; common UED context is
  `drp-ued-cmp003` with `/dev/datadev_0`, but verify current logs/config.
- Check runtime code paths in `daqlog_header` before assuming a deployment:
  typical deployed files include `psdaq/psdaq/configdb/epixquad1kfps_config.py`,
  `psdaq/drp/EpixQuad.cc`, and submodules under
  `/sdf/group/lcls/ds/ana/sw/conda2-v4/rel/lcls2_submodules_*` or older `/cds/sw/ds/ana/conda2/rel/lcls2_submodules_*`.
- Read `references/known-issues.md` when log symptoms include missing subframes,
  `EventBuilder.Bypass`, zero/1600-byte frames, `AsicMask` verification,
  UED 360 Hz timing, ADC calibration, firmware mismatch, or IOC/MPOD behavior.

## Safety

- Treat UED detector, MPOD, IOC, Slurm, DAQ, firmware loading, and register writes
  as production operations.
- Do read-only inspection by default. Ask before changing registers, power,
  IOC state, Slurm state, firmware, kernel modules, or live DAQ state.
- Report exact log paths and line numbers, observed register values, and whether
  a step is observation, inference, or proposed fix.
