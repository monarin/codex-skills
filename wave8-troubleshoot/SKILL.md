---
name: wave8-troubleshoot
description: Use with daq-troubleshoot for Wave8/FIM DAQ issues, direct front-end timing, KCU1500 PGP monitoring, pgp-pcie-apps and Rogue compatibility, Wave8 devGui side effects, and IOC-managed DAQ setup in RIX or TMO.
---

# Wave8 / FIM Troubleshoot

Use daq-troubleshoot for hutch access, production safety, and the log/node/timing
workflow. This skill adds Wave8-specific topology, software selection, and IOC
context. For a narrow Python exception, inspect the script and environment first;
a hardware launch is not needed to diagnose an API mismatch.

## Choose The Correct Repository

In Mona's Wave8/FIM deployment, timing goes directly to the Wave8 front end;
the KCU1500 receives its PGP data. Use `~/pgp-pcie-apps`
(`slaclab/pgp-pcie-apps`) for that KCU firmware and PGP monitor.

Do not substitute `$SUBMODULEDIR/lcls2-pgp-pcie-apps`: that is the LCLS2 DAQ
application for detectors whose timing enters through the KCU1500. Confirm
actual cabling and firmware before applying either register map. The upstream
`pgp-pcie-apps` project is not inherently exclusive to Wave8; this distinction
describes which application this deployment uses.

The separate `~/wave8` (`slaclab/wave8`) contains Wave8 front-end Rogue software.
Compatibility of the PGP monitor does not establish compatibility of wave8DAQ.

For Mona's Wave8 PGP monitor, retain the hardware-tested `pgp-pcie-apps` commit
`7d44084` (`v2.5.0-9-g7d44084`) and its recorded submodules with Rogue 6.1.3.
Mona confirmed it works with the v2.5.0 KCU firmware on `drp-srcf-cmp004`.
See the PGP reference for full hashes and evidence; this supersedes the earlier
choice of cpo's newer `ac36573` checkout.

## Select The Investigation

- For `PgpMonitor.py`, `runPyDM(root=...)`, Rogue versions, cloning/submodules,
  LFS, or KCU firmware, read
  [references/pgp-monitor-and-firmware.md](references/pgp-monitor-and-firmware.md).
- For front-end devGui, timing-mode selection, IOC setup/recovery, FIM EPICS
  prefixes, or panel paths, read
  [references/wave8-ioc-and-gui.md](references/wave8-ioc-and-gui.md).
- For acquisition failures, locate the deployed Wave8 DRP, control, and TEB log
  group first. Confirm the data node, device, lane mask, and EPICS prefix from
  the launched configuration. The controls host and data-receiving node serve
  different roles; launch the PCIe monitor on the host with the card.

## Front-End GUI Can Change DAQ Configuration

Treat launching Wave8 devGui / `wave8DAQ.py` as a potential hardware mutation.
Startup can configure timing, load YAML defaults (including delay settings),
calibrate ADCs, and start triggers. `--enDataPath 0` relinquishes the data stream;
it does not make the process read-only. Disabling the viewer also does not
suppress startup writes.

Mona reports that the IOC managed through iocmanager provides the required DAQ
setup sequence. After devGui use, an IOC restart/reinitialization may be needed
to restore it. Record the affected lane, timing/delay values, and symptoms;
coordinate recovery with the operator. Do not automatically restart the IOC
or try to reproduce its setup with guessed register writes.

Use existing authorization when it covers the exact operation; otherwise ask
before front-end GUI startup, register/timing changes, IOC restart, or firmware
programming. Writing this skill does not authorize those operations.
The PGP monitor also exposes writable controls: do not use resets or writes as
part of a read-only investigation.

## Evidence And Reporting

Distinguish source inspection, operator-reported success, and live verification.
Report repository commit/submodule pins and the imported Rogue version, not
only a conda environment name. Historical commands in the references require
validation against the selected checkout and current IOC deployment.
