# Wave8 Front-End GUI And IOC Context

## Sources And Verification Status

Mona supplied excerpts titled “FIM/Wave8” and “Wave8/FIM Information for users”
on 2026-10-16. Page URLs were not supplied and the pages were not retrieved
independently. Preserve those notes as historical/operator context; the source
checks below take precedence for the inspected checkout.

Front-end repository: [slaclab/wave8](https://github.com/slaclab/wave8).
Local `~/wave8` was clean at
`0b88c097de7f0f555475f6021ab681e0401f9a86` on 2026-10-16. It was not changed or
launched. Historical `~cpo/git/wave8_2.4.2/` is a different checkout; do not
assume it has the same CLI or firmware requirements.

## Historical GUI Commands And Current Differences

Supplied examples, run from the selected `wave8/software/`:

```bash
python scripts/wave8DAQ.py --start_viewer 1 --l 2
python scripts/wave8DAQ.py --l 3 --enDataPath 0 --startupMode 1
```

These are records, not approved launch instructions. Inspect the parser and
startup code before running any GUI, even with the viewer disabled:

- Current `~/wave8/software/scripts/wave8DAQ.py` accepts `--start_gui`, not
  `--start_viewer`. Replacing the flag alone does not establish compatibility.
- `--l` is a lane index; DAQ DRP `-l` is a bitmask. Verify the FIM/device;
  lanes 2 and 3 in these examples are not universal.
- `--enDataPath 0` allows an external C++ process to consume the data stream.
  It does not suppress register writes, timing setup, or trigger/run commands.
- `--startupMode 1` selects LCLS-II timing; `0` selects LCLS-I. In this checkout,
  `--standAloneMode` distinguishes local timing from fiber timing. LCLS-II startup
  calls `ConfigureXpmMini()` for standalone timing and `ConfigLclsTimingV2()` for
  fiber timing. `startupMode` alone is not the XpmMini/fiber switch.
- `--lclsHE` defaults to true, selecting a different front-end implementation
  and configuration from legacy Wave8. Verify the firmware type before use.
- This GUI passes `display_factory=` to `runPyDM`. The inspected Rogue 6.1.3 API
  lacks that argument, so it needs separate compatibility work before use in
  `daq_20250402_r9`. Fixing PgpMonitor does not fix wave8DAQ.

The old KCU GUI command was `python scripts/PcieDebugGui.py --boardType
XilinxKcu1500`, with the board flag needed for QSFP optical powers per the
supplied notes. Use the other reference's PgpMonitor command for our checkout.

## Why devGui Can Disrupt DAQ

In `firmware/python/wave8_shared/_Top.py`, `start()` checks the firmware/version
lock, stops triggers, calibrates/initializes ADCs, configures timing, and loads
YAML configuration. `wave8DAQ.py` then calls `StartRun()`, resetting counters,
changing event-builder state, and enabling triggers. A firmware-lock failure
does not authorize a firmware update.

Mona reports devGui can overwrite delays and only the iocmanager-managed IOC
has the intended DAQ setup sequence. If behavior changes after GUI use, record
the FIM/lane and timing/delay state, coordinate closing the conflicting GUI,
and propose the established IOC restart/reinitialization sequence. Obtain
authorization for recovery; do not restart all FIM IOCs speculatively. Verify
restored configuration and acquisition after an authorized recovery.

Historical optical mapping from the supplied notes:

| GUI entry | Front-panel label | Role |
| --- | --- | --- |
| `sfp[0]` | `pgp1` | DAQ data |
| `sfp[2]` | `evr1` | LCLS-II timing |

Confirm hardware revision and cabling. These indices are not PCIe lane numbers.

## RIX Hosts, Lanes, And EPICS Prefixes

Mona identifies `ctl-rix-fim-01` as the RIX controls machine talking to the FIMs.
Its DNS resolved from `drp-srcf-cmp004` on 2026-10-16, but a personal-account SSH
probe to it did not complete. IOC service state was not verified.

Local `~/lcls2/psdaq/psdaq/cnf/rix.cnf` contains this mapping on
`drp-srcf-cmp004` (source inspection, not proof of deployed configuration):

| DRP alias | DRP lane mask | Lane index | EPICS prefix |
| --- | --- | --- | --- |
| `rix_fim2_0` | `0x1` | 0 | `RIX:FIM:W8:03` |
| `rix_fim1_0` | `0x2` | 1 | `MR4K2:FIM:W8:02` |
| `rix_fim0_0` | `0x4` | 2 | `MR3K2:FIM:W8:01` |

The config says this node is shared with TMO; check both hutches' lane ownership
before changes. Confirm prefixes from deployed config/logs and IOC startup
files. A historical read-only probe is:

```bash
caget 'MR4K2:FIM:W8:02:Top:TriggerEventManager:TriggerEventBuffer[0]:Partition'
```

Quote brackets to avoid globbing. A successful read establishes PV reachability
and value, not full IOC/DAQ health; timeouts can also be CA routing trouble.
This exact PV was not queried in the inspection. For discovery problems use
daq-troubleshoot's EPICS reference.

## Historical IOC Panel Launchers

Supplied common/TMO installation path:

```text
/cds/group/pcds/epics/ioc/common/pgpWave8/latest/
```

RIX FIM 3 panel launcher from the supplied notes:

```text
/cds/group/pcds/epics/ioc/common/pgpWave8/latest/children/build/iocBoot/ioc-rix-pgpw8-03/edm-ioc-rix-pgpw8-03.cmd
```

RIX top launcher (Bruce's note: HV and Wave8 lanes 0 and 1):

```text
/cds/group/pcds/epics/ioc/common/pgpWave8/latest/edm-rix-fim-01-top.cmd
```

Treat these as panel launchers, not IOC process startup commands. Inspect their
macros and iocmanager configuration for each FIM's prefix and real startup
procedure. These paths were absent on `drp-srcf-cmp004` in the 2026-10-16 check;
they may require a controls host/filesystem. The controls-host probe failed,
so current existence remains unverified.
