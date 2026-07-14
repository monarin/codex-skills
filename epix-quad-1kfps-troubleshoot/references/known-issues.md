# ePixQuad1kfps Known Issues

These notes summarize recurring UED/ePixQuad1kfps diagnosis patterns from
`psdaq/instructions/epix10ka` in `monarin/psana-nersc` plus later local
root-cause work. Use with `daq-troubleshoot`; do not skip the global log,
TEB, node-health, and timing order.

## EventBuilder Bypass 0x4 Causes 3 Subframes

Symptom:

```text
Missing data: subframe count 3 [expected 4]
```

Check the KCU/PCIe app lane EventBuilder for the lane in use:

```text
DevPcie.Application.AppLane[<lane>].EventBuilder
DataCnt[0]
DataCnt[1]
DataCnt[2]
TimeoutDropCnt[2]
Bypass
NUM_SLAVES_G
```

Interpretation:

- `Bypass = 0x4` sets bit 2 of the 3-bit `EventBuilder.Bypass` mask.
- AppLane input 2 is the XPM/timing message stream in this firmware path.
- If input 2 is bypassed, the DRP receives only three subframes and marks
  `Damage::MissingData`.
- `DataCnt[2] = 0` with `TimeoutDropCnt[2]` increasing is consistent with this.

Known root cause:

- The FPGA `devGui.py` in `lcls2-pgp-pcie-apps/software/scripts` defaults to
  `startupMode=False` and `yamlFileLclsI=config/defaults_LCLS-I.yml`.
- `defaults_LCLS-I.yml` sets
  `DevPcie.Application.AppLane[:].EventBuilder.Bypass: 0x4` because LCLS-I mode
  masks the XPM timing message port.
- `defaults_LCLS-II.yml` sets the same field to `0x0`.
- DAQ `epixquad1kfps_config.py` starts `DevRoot` with YAML loading disabled; if
  the DAQ path does not explicitly write `EventBuilder.Bypass`, stale devGui
  state can carry into DAQ use.
- `AxiStreamBatcherEventBuilder` preserves `Bypass` across soft/hard EventBuilder
  resets; `SoftRst` alone does not clear this register.

Fix:

- Preferred code/config fix: write `devPtr.EventBuilder.Bypass.set(0x0)` in the
  `epixquad1kfps_config.py` PCIe initialization path.
- Immediate manual recovery, with live-operation approval: set
  `DevPcie.Application.AppLane[<lane>].EventBuilder.Bypass = 0x0` in the KCU
  devGui, then restart/reset the run path and confirm `DataCnt[2]` increments.
- Avoid starting the FPGA devGui in default LCLS-I mode against the production
  card before DAQ. For LCLS-II checks, use LCLS-II startup/configuration and
  verify `Bypass` returns to `0x0`.

## Frame[2] or 1600-Byte Frame-Size Problem

Symptoms can include:

```text
Missing data: subframe[2] size 0
Missing data: subframe[2] size 1600
Frame[2] only seeing 1600 bytes
```

Known causes and checks:

- Old/manual camera YAML can reduce the frame size to 1600 bytes. Avoid loading
  deprecated UED ASIC YAML such as
  `epixQuad_ASICs_allAsics_UED_1080Hz_settings.yml` unless the current detector
  owner explicitly requests it.
- Check camera GUI `FrameCnt`, `FrameRate`, and frame-size-related counters before
  attributing this to DAQ or timing.

Known fix from operations:

```bash
python epix-quad-1kfps/software/scripts/epixQuadLoadFpga.py --type datadev --dev /dev/datadev_0 --l <lane>
```

Use the actual lane from the current config/logs. Do not run firmware-load
commands on live hardware without explicit approval.

## ADC Calibration GitHash Mismatch

Symptom after firmware flashing:

```text
AxiVersion.GitHash = ... != Calibration Githash = ...
Please re-train the ADC lanes ...
```

Fix pattern:

1. Run `epixQuadDAQ.py` from a writable directory with calibration enabled:

   ```bash
   python epix-quad-1kfps/software/scripts/epixQuadDAQ.py --l <lane> --adcCalib 1
   ```

2. Run the `AdcTrain` command in the GUI.
3. Reboot/reload the FPGA using the approved local procedure.
4. Restart `epixQuadDAQ.py` without `--adcCalib` and confirm the mismatch is gone.

Operational note: train after the detector temperature is stable, roughly
65-70 C in the historical UED notes. Preserve the generated
`ePixQuadAdcTrainingData.txt` and decoded values when comparing firmware updates.

## Trigger Delay and Run/DAQ Trigger Scheme

Use current logs/config as truth. Historical notes include:

- `start_ns` too small can produce a negative trigger-delay calculation.
- Basic formula:

  ```text
  triggerDelay = int(rawStart / clk_period - partitionDelay * msg_period)
  ```

- Later UED `epixquad1kfps_config.py` used a dual-trigger scheme:
  run trigger from EVR to keep the detector clocked continuously, and DAQ trigger
  from XPM for acquisition.
- After the firmware clock-domain fix, DAQ trigger delay used an additional
  `+9` tick offset in the deployed config path.
- For rate-specific EventBuilder timeout checks, use:

  ```text
  EventBuilder.Timeout = int(156.25e6 / event_rate_hz)
  ```

When diagnosing timing, correlate `partitionDelay`, `rawStart`, `clk_period`,
`msg_period`, `triggerDelay`, trigger-buffer indices, event code, and group from
the current detector log and `daqlog_header`.

## PCIe/KCU Firmware and Buffer Notes

- Confirm `AxiVersion.ImageName`, `FpgaVersion`, git hash, and submodule bundle
  from runtime logs before recommending firmware changes.
- Historical deployment paths include `/cds/sw/ds/ana/conda2/rel/lcls2_submodules_11032025`
  and DAQ release `/cds/home/opr/uedopr/git/lcls2_251031`.
- Historical KCU buffer settings for 1 kHz used a larger receive count and 2 MiB
  buffers:

  ```text
  cfgTxCount=4 cfgRxCount=1020 cfgSize=2097152 cfgMode=0x2
  ```

Changing kernel modules, KCU services, or firmware is not read-only; ask first.

## Fast Symptom Map

- Rogue transaction timeout reading `Top.AxiVersion.FpgaVersion`: retry/restart
  can clear a transient startup failure, but first check no other process owns
  the device.
- `AxiStreamDma: Failed to open ... /dev/datadev_0`: another process owns the VC.
  For config Python, avoid opening data VCs while DRP owns them.
- `Missing data: subframe count 3 [expected 4]`: check `EventBuilder.Bypass` for
  `0x4`; fix to `0x0`.
- `subframe[2] size 0` or `1600`: check for old YAML/frame-size issue; known
  recovery is `epixQuadLoadFpga.py` with the correct lane.
- IOC EDM registers read zero or detector powers off: suspect IOC/firmware/VC3
  communication or interlock behavior. Do not bypass interlocks; coordinate with
  detector/controls owners.
