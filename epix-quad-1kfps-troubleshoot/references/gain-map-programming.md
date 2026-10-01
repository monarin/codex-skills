# ePixQuad gain-map programming and repeat tests

Evidence: production UED module on drp-ued-cmp003, September 28–30, 2026;
closeout October 1. Separate established bench context: rdsrv421. These are
observations for the tested hardware/configuration, not universal ASIC claims.

## Start with the retained guide

Investigation branch: `features/ued-epix10ka-rdsrv421-daq` in
`/sdf/home/m/monarin/lcls2_worktree/ued-epix10ka-rdsrv421-daq`.
Read `notes/epixquad/README.md` for the maintained entry points and
`notes/ued-full-daq-20260930/POST_MORTEM.md` for the evidence chain.
Generated evidence is mapped by `notes/epixquad/archived-files.csv` to
`/sdf/scratch/users/m/monarin/ued-epixquad-gainmap-20260930`.
Do not infer live detector/DAQ state from old PIDs or dated launch notes.

## Confirmed software cause

Full `epixquad1kfps_config.config_expert` previously did:

```text
IsEn=True → apply expert settings containing IsEn=0 → program map → IsEn=False
```

The remedy sets IsEn=True for the configured ASICs **after** expert settings,
immediately inside `if writePixelMap`, before any matrix/pixel programming.
Keep the existing retry and final acquisition-state cleanup. The minimal
four-line fix is commit `a4907da6f` on `fix/epixquad1kfps-isen-ordering`,
published as https://github.com/slac-lcls/lcls2/pull/152. Verify merge and
deployment state before claiming a running release contains it.

Calling `_apply_raw_pixel_map_program` in standalone did not reproduce full
Configure: the standalone wrapper set IsEn=True just before calling the helper.
An end-of-Configure YAML snapshot also misses the transient error because all
paths finish at IsEn=False. Test the whole Configure call sequence, including
expert application, with IsEn recorded at every matrix/pixel write.

IsEn=0 did not prevent every write. Some requested map pixels were correct while
43–44 extra row-0 addresses became FL. The electrical mechanism remains unknown;
do not describe IsEn as a universal SACI write-enable or assert all writes fail.

## Evidence and interpretations

- DB and recorded Configure matched expand2 exactly; they describe the requested
  map, not a pixel-SRAM readback. Codes FH=12, FL=8; all trbits=1 for MapFHL.
- Runs 1/2 near 540 Hz and run 3 at 360 Hz retained extra FPs. Correcting the
  bundle selection did not remove them. Rate or bundle drift alone was not the cause.
- Standalone internal timing with either helper, AsicSyncInjEn A/B/A and UED
  external timing were clean outside known-bad after startup. These did not
  exercise full DAQ Configure's expert/map ordering.
- Run 4: 51 matched DMA/pre-write/disk events already contained the FPs before
  disk. Captured pre-write datagrams equalled disk bytes. Direct ASIC reads of
  the 44 addresses returned 8 twice despite requested 12.
- Run 5: overwriting those addresses with FH corrected the data. This is a
  diagnostic intervention, not the production fix or a new known-bad list.
- Run 6: standalone-port Configure passed, but changed IsEn, gating and ordering.
- Run 7 isolated IsEn ordering with the original writer: 1,086 clean frames.
- Run 8 tested the minimal master-based build: 1,084 complete undamaged frames
  at 360.282 Hz, no FP/FN outside known-bad, first frame also clean; all 44
  addresses read 12 twice after EndRun. No pre-run readback/overwrite intervened.

The production known-bad baseline contains 352 pixels at ASIC 8 columns 97/98,
rows 0–175. Only 68 overlap expand2's 22,169 FL pixels, yielding 68 known-bad FNs
per frame. Keep all and first-frame-excluded counts. Never add the extra 43/44
FPs to that baseline, or transfer this module's known-bad list to rdsrv421.
Gain bits alone do not distinguish FH from FM; use configuration/trbit and
analog/pedestal evidence when identifying those modes.

The map is the real experiment-derived **expand2**, not expand4, raw shape
`(4,352,384)`, SHA256
`1739094ffe6e80a7eae0496961730399c0f1dce077f7426e445137fac4434894`.

## Shared data

```python
from psana import DataSource
ds = DataSource(exp="uedc00107", run=8,
    dir="/sdf/scratch/users/m/monarin/ued-epixquad-gainmap-20260930/xtc")
```

Run 3 is the preferred failing 360 Hz comparison (43 extra FPs); run 4 has 44
and the diagnostic capture. Runs 5–8 pass outside known-bad. All eight runs,
both streams and all 16 smalldata files are archived and readable by other SDF
users. Other evidence remains private. `DataSource(dir=...)` needs the matching
`smalldata/*.smd.xtc2` and path traversal permissions as well as the large XTC2
files. All eight runs were smoke-tested on October 1. Run-1/2 analyses covered
snapshots; do not relabel them complete-run analyses.

## Shared scripts, separate host profiles

Use `psdaq/psdaq/debugtools/epixquad1kfps/capture_standalone.py` with profiles:

- `rdsrv421.json`: C1100/PGP4 lane 0, XpmMini, bench-specific PROM-check bypass.
  Earlier mapping work passed; the new shared headless lifecycle is not claimed
  hardware-validated on this host. Check its OS/environment and accessible paths.
- `drp-ued-cmp003.json`: KCU1500/PGP4 lane 0, internal timing, production camera
  baseline and PROM validation. Never automatically enable the bench bypass.
- `drp-ued-cmp003-external.json`: dedicated UED 119 MHz dual-trigger path, not
  generic 186 MHz external initialization. Operator controls groupca RUN; wait
  for `READY FOR GROUPCA RUN`, then stop RUN afterward. No XPM PV writes in the
  standalone script. Full-frame payload variants include 1,095,344 bytes here.

Preview with `--dry-run`. Select new output paths outside source. Capture FH/FM/FL
before map tests; retain detector identity, map/hash, full-frame sizes, raw data,
first-frame and persistent mismatch counts, counters, software pins/imports and
YAML snapshots. `--gain-writer daq` is an inner-helper comparison only.
`--save-config-yaml` does not read pixel SRAM. The generic mismatch exporter is
usable on either module; the dated UED reviewers intentionally enforce its
specific identity/map/baseline. `run_once.py` and `restore_camera_idle.py` are
historical UED wrappers using a saved preflight state, not generic restore tools.

## UED timing and readout clock

On September 30 the installed `ued_seq_setup_new.py` defaulted to 360 Hz and
had **no `--a360` flag**. The normal `ued_seq` alias selected that wrapper.
Preview in a subshell so the operator setup does not overwrite the test build:

```bash
(
  source /sdf/home/u/uedopr/daq/scripts/setup_env.sh &&
  python /cds/group/pcds/dist/pds/ued/scripts/ued_seq_setup_new.py \
    --cam 0 --pv DAQ:UED:XPM:0 --eng 0 --test
)
```

Only for an authorized timing change, omit `--test`. `--cam 0` avoids Andor
camera PV updates. Apply starts/resets engine 0 and changes PART:0:SeqMask;
verify current wrapper/route first. Continuous run trigger (EVR code 6, buffer
4, normally 1080 Hz) and XPM DAQ/readout trigger (buffer 0, 360 Hz) are distinct.

Standalone production rate tests needed the full-DAQ override
`--asic-ro-clk-ticks 3`: full period 3, half-period readback 1. This is **not**
AsicRoClkHalfT=3. Verify full frames at 10 Hz before 360 Hz; record drop/buffer
counters. Do not generalize the override to another module without checking.
Fresh full DAQ initialization and Configure restore production routing after
standalone; merely Enable does not. Power-off does not necessarily reset PCIe/XPM.

## Memory readback and diagnostic capture

`notes/ued-full-daq-20260930/read-fp-pixels.py` defaults to a plan; `--execute`
uses existing Rogue servers and verifies production identity. It controls
trigger/readout gates, IsEn and address registers even without pixel writes.
`--overwrite-fh` is an explicit separate intervention. Keep reads bounded and
outside the timed Configure transition; acquire before readback for unmodified
evidence. Verify restoration on success/failure. Do not contact a powered-off
detector. The saved 44-address fixture is specific to this experiment.

The retained C++ diagnostic hook copies bounded DMA and pre-write data inside
DRP; it does not steal VC0 from DAQ. Compare exact matched pixels/datagrams to
finalized XTC2 through EndRun; missing/incomplete matches are not a clean result.
Keep diagnostic capture off in ordinary operation. Offline native buffer and
Python comparison tests are listed in `notes/epixquad/OFFLINE_CHECKS.md`.

DAQ launch configs may execute without `__file__`; derive roots from an explicit
environment variable. daqstat's filtered Slurm environment must carry those
variables too. Validate with the installed daqmgr Runner, not only runpy.
Use runtime log headers/import paths to verify TESTRELDIR, SUBMODULEDIR and
actual code; sourcing a setup in a shell does not replace running processes.

## Closeout and compatibility

Only TEST was changed: epixquad1kfps_0, timing_0 and trigger_0; epixquad_0 was
untouched and BEAM stayed at key 1402 in the recorded checks. Original TEST key
1125 was backed up; map upload produced key 1406. Restoration requires checking
for intervening edits and saving the final TEST before restoring the three
entries. It creates a new key. No TEST restoration is recorded as completed.

Current raw-schema BEAM is compatible with the checked lcls2_091026 deployment;
pre-migration code expects older pixel_map and is not a safe arbitrary rollback.
Use a matched release, Python/native install and submodule bundle. Shared
production builds were not modified. Private bundle promotion and upstream
superproject pin/patch publication remain a separate follow-up; see
[submodule-bundles.md](submodule-bundles.md).
