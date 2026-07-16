---
name: daq-troubleshoot
description: Use when troubleshooting LCLS DAQ hutch operations on production hutch DAQ nodes, including daqmgr/daqstat restart issues, Slurm job launch failures, CPU binding/environment leaks, DAQ process logs, TPR/XPM timing trigger routing for hutch cameras, EPICS CA/PVA camera PV discovery or drp_pva damage, and hutch operator account context for tmo, fix, txi, ued, mfx, or xpp.
---

# DAQ Troubleshoot

## Safety First

These are real experiment hutch operator accounts. Treat them as production systems.

- Do read-only inspection by default.
- Do not modify files, submit jobs, restart processes, run `daqmgr start/stop/restart`, `sbatch`, `scancel`, or change live state unless Mona explicitly grants permission in the current turn.
- If a command could affect data acquisition, ask first and state the exact command.
- Prefer summarizing evidence from logs and commands over making changes.

## Hutch Access

Hutch DAQ hosts follow:

```bash
ssh <hutch>-daq -l <hutch>opr
```

Known hutches: `tmo`, `fix`, `txi`, `ued`, `mfx`, `xpp`.

Examples:

```bash
ssh xpp-daq -l xppopr 'hostname; cat /etc/os-release; echo "$HOME"'
ssh mfx-daq -l mfxopr 'ls -lt "$HOME"/daq/logs/*/* 2>/dev/null | head'
```

Rocky 9 hutches have home/log files under `/sdf`; RHEL7 hutches have files under `/cds`. Always confirm with `echo "$HOME"` and `cat /etc/os-release` instead of hard-coding paths.

For more path and command notes, see `references/hutch-nodes.md`.

## Detector-Specific Overlays

When troubleshooting a named detector, use this skill as the primary workflow.
Also use any detector-specific skill whose description matches the detector name
or aliases. Apply the detector skill after Step 0 log discovery to interpret
detector-specific logs, config paths, firmware state, and known failure modes.
Do not let detector-specific guidance override production safety rules.

## Priority Troubleshooting Order

Use this order unless the user explicitly asks for a narrower check.

- Step 0 - Locate the detector logs first. Given a hutch three-letter code, use the `<hutch>opr` account and search the hutch operator home for the detector's unique name. Logs may be under date-based paths such as `$HOME/YYYY/MM/DD*<unique_det_name>*` or under `$HOME/daq/logs`. Group logs by the newest common timestamp before interpreting errors. Inspect the detector/DRP log, `control.log`, and `teb*` logs from the same launch; establish whether the TEB is happy or reports related missing source, timeout, phase, IPC, or write failures before moving on.
- Step 1 - Check the detector node health. Identify the node connected to the detector from the logs or config. Verify read-only that Slurm does not show the node in `DRAIN`, `DOWN`, or another bad state; the host is reachable; the node is alive enough to answer basic read-only commands; and the expected filesystem is mounted (`/cds` or `/sdf`, depending on the hutch).
- Step 2 - Check timing only after log and node evidence. Use the TPR/XPM timing guidance below when the logs point to missing triggers, event counter jumps, stale timestamps, partition/readout-group mismatch, timing link trouble, or detector trigger routing questions.
- Step 3 - Summarize the errors. Separate observations from inferences, include exact log paths and line numbers, call out TEB status, detector node health, timing findings, and the smallest proposed next check or fix.

## TPR / XPM Timing Trigger Checks

Use `references/tpr-xpm-timing.md` when a hutch camera or detector depends on
TPR/EVR-style external triggers, when comparing TPR to XPM timing, or when
debugging whether a camera should be connected through a TPR trigger output.

Read-only checks first. Do not change TPR trigger PVs, XPM settings, or camera
trigger modes on a production hutch unless Mona explicitly grants permission in
the current turn.

Quick model:

- XPM is upstream timing/readout-group control.
- TPR is an endpoint/adapter that receives LCLS timing frames and emits local
  hardware trigger pulses.
- Cameras such as Andor, CCD, and controls cameras often need TPR because they
  only accept an external trigger pulse, not the LCLS timing protocol.
- ePixQuad, Jungfrau, and some Piranha deployments appear "direct" because
  their SLAC/KCU/CameraLink gateway electronics already contain a timing
  receiver and trigger-event manager.

## EPICS CA/PVA Camera PV Checks

Use `references/epics-ca-pva-camera.md` when debugging `drp_pva` camera/PV
recording, CA versus PVA provider selection, `EPICS_CA_ADDR_LIST` or
`EPICS_PVA_ADDR_LIST` values, gateway bypass, multi-IOC host discovery issues,
or `/cds/group/pcds/dist/pds/boot/epics-ca-unicast-fix.sh`.

Read-only checks first. Do not change IOC startup scripts, iptables rules,
EPICS gateway routing, or live DAQ configs on production hosts unless Mona
explicitly grants permission in the current turn.

## Log Inspection Workflow

1. Start from the detector alias or unique detector name. Search the hutch operator home under date-based paths such as `$HOME/YYYY/MM/DD*<unique_det_name>*` and under `$HOME/daq/logs`.
2. For multi-process DAQ launches, group logs by the newest common timestamp and inspect `control`, `teb*`, `drp`/detector, and `meb*` logs from the same launch.
3. Check `teb*` and detector logs first for missing sources, timeouts, phase errors, event counter jumps, IPC failures, or write failures. Use `control.log` to identify which participant failed when state changes fail.
4. Search logs for high-signal markers before reading large sections:

```bash
grep -n -E '=====|SLURM_CPU_BIND|SLURM_JOB_ID|SLURM_STEP_ID|CPU binding|Unable to satisfy|srun:|error:|<E>|Phase [0-9] error|Failed to configure|Permission denied' <log>
```

5. For daqmgr/daqstat restart failures, compare these phases:

- Batch shell before `srun`: should not contain stale `SLURM_CPU_BIND*` from a parent job.
- Step shell after `srun`: may contain Slurm-assigned `SLURM_CPU_BIND*`, `SLURM_STEP_ID=0`, and the new job ID.
- `daqlog_header`: confirms the command, platform, host, and selected DAQ env subset.

6. If the failure is `CPU binding outside of job step allocation`, look for inherited `SLURM_CPU_BIND`, `SLURM_CPU_BIND_LIST`, `SLURM_CPU_BIND_TYPE`, or `SLURM_CPU_BIND_VERBOSE` in the batch shell before `srun`.

7. For state-change failures, start with `control.log` to identify the participant that failed, then inspect that participant's log. `control.log` may only say `teb0: Phase 1 error`; the actionable error is often earlier in `teb0.log`.

8. Confirm config edits through `daqlog_header` in the latest process log. The `# CMDLINE:` lines show the actual command Slurm launched, including `-o`, `-k`, `-p`, and `-u` options.

## TEB Configure / IPC Failures

For CONFIGURED failures involving `teb0` and Python triggers:

- `TebPyTrig` uses the trigger config's `pythonScript` plus the TEB `script_path` kwarg. If `-k script_path=...` is missing from the `teb` command, it defaults to `.` and may try to run `./tebIntegrateTest.py`.
- Compare against a working config such as `~tmoopr/scripts/tmo_sc.py`: define `trig_dir`, `scripts = f'script_path={trig_dir}'`, and include `-k {scripts}` in the TEB command.
- If Python starts but fails with `Error connecting to 'Results' message queue - Error: Permission denied`, check stale POSIX IPC files on the TEB host:

```bash
ssh <control-host> 'ssh <teb-host> "ls -l /dev/mqueue/mqteb*p<platform>_teb<teb-id> /dev/shm/shmteb*p<platform>_teb<teb-id> 2>/dev/null"'
```

- DAQ queue names such as `/dev/mqueue/mqtebres_p0_teb0` are local to the node and keyed by partition/platform and TEB id, not by hutch or user. Different hutches on different hosts can have the same queue name safely; different users on the same host and same `-p`/`-u` collide.
- Before removing stale IPC state, verify no process is using it: check Slurm jobs on that node, `ps -u <owner>`, and `/proc/*/fd` symlinks for the queue name. Stop the failed DAQ instance before removing queues or shared memory.

## DRP Output Path Checks

- Verify DRP output paths on the Slurm execution host, not only on the control host.
- For `drp -P <hutch> -o <data_dir>`, the effective directory checked by the DRP is typically `<data_dir>/<hutch>`.
- If the DRP logs `stat(<path>) error: No such file or directory`, confirm each parent directory and permissions from the DRP host.
- `Inadequate RTPRIO limit` can appear as `<C>` while the process continues to transitions; do not assume it is the blocking error unless the log stops there.

## PVA Detector Damage

For `drp_pva` detectors with high damage rates:

- Identify the exact launch group first. A detector alias can reuse the same Prometheus instance across quick restarts, so group `control`, `teb*`, and detector logs by the common timestamp before attributing metrics to a run.
- Use `control.log` and `teb*.log` to confirm whether the detector was actually selected in the relevant configuration. TEB contributor counts can change across repeated configure attempts in one log group, and a detector may appear only in a later configuration.
- Check Prometheus target availability before interpreting gaps:

```promql
up{instance="<host>:<prometheus-port>"}
```

- Get the numeric damage code from the damage-type histogram. `DRP_DamageType_count` is the number of damage-code observations, and `DRP_DamageType_sum` is the sum of the numeric damage codes. For a window where one code dominates:

```promql
increase(DRP_DamageType_sum{alias="<alias>"}[40s])
/
increase(DRP_DamageType_count{alias="<alias>"}[40s])
```

- Cross-check the code mapping in `xtcdata/xtcdata/xtc/Damage.hh`; common PVA cases include `MissingData = 5` and `TimedOut = 6`.
- Correlate with PVA-specific counters:

```promql
DRP_Damage{alias="<alias>"}
drp_event_rate{alias="<alias>"}
drp_update_rate{alias="<alias>"}
drp_empty_count{alias="<alias>"}
drp_tooOld_count{alias="<alias>"}
drp_timeout_count{alias="<alias>"}
```

- If `drp_event_rate` is near 120 Hz, `drp_update_rate` is near 60 Hz, `DRP_Damage` rises near 60 Hz, `drp_empty_count` rises, and `drp_timeout_count` stays flat, report this as `MissingData` from unmatched PVA updates rather than a TEB timeout.
- If `drp_timeout_count` rises with `DRP_Damage`, report a `TimedOut` component and separate it from any earlier `MissingData` burst.

## daqmgr Env Debug Gate

DAQ environment dumps are off by default. To generate the batch-shell and step-shell env dumps in new daqmgr jobs, launch daqmgr with:

```bash
DAQMGR_DEBUG_ENV=1 daqmgr start <config.py>
```

`DAQMGR_DEBUG_ENV` is read by the daqmgr Python process while it builds the sbatch script. It is intentionally not passed through the clean `sbatch` submission environment. In generated logs, compare:

- `===== BATCH ENV BEFORE SRUN (...) =====`: should not contain inherited `SLURM_CPU_BIND*`.
- `===== STEP ENV AFTER SRUN (...) =====`: may contain Slurm-assigned `SLURM_CPU_BIND*` for the new allocation.
- `CONFIGDB_AUTH` is redacted as `CONFIGDB_AUTH=*****` in debug env dumps.

## Slurm Read-Only Commands

Use read-only Slurm commands for evidence:

```bash
sacct -j <jobid> -o JobID,JobName,State,ExitCode,NodeList,Submit,Start,End
scontrol show job <jobid>
squeue -u <hutch>opr
```

Do not run `scancel`, `sbatch`, or live `daqmgr` mutations without explicit permission.

## Slurm Configless / PMIx Package Drift

Use this when `restartdaq`, `daqmgr`, `daqstat`, `squeue`, `scontrol`, `sbatch`,
or `srun` behave as if Slurm is up but pointed at the wrong controller, or when
some DAQ jobs launch on other nodes while jobs on the hutch DAQ host fail.

Known failure pattern:

- IT kernel or OS maintenance can pull in an incompatible Slurm RPM for a hutch
  DAQ node.
- The wrong package can install a stale static `/etc/slurm/slurm.conf` on a
  node that should be using configless Slurm from `psslurm-drp`.
- Plain Slurm clients then read `/etc/slurm/slurm.conf` instead of the runtime
  configless cache under `/run/slurm/conf/slurm.conf`, so `squeue`/`scontrol`
  can fail or report the wrong controller even while `slurmd` is running.
- The same wrong Slurm package may omit `mpi/pmix`. Jobs on other DRP nodes can
  still run, but jobs scheduled on the affected hutch DAQ host fail before the
  DAQ process starts with errors like:

```text
srun: error: Couldn't find the specified plugin name for mpi/pmix
srun: error: cannot find mpi plugin for mpi/pmix
srun: error: invalid MPI type 'pmix'
```

Read-only checks:

```bash
ssh <hutch>-daq -l <hutch>opr 'hostname; srun --version; srun --mpi=list'
ssh <hutch>-daq -l <hutch>opr 'rpm -qa | grep -E "^slurm|^pmix" | sort'
ssh <hutch>-daq -l <hutch>opr 'ls -l /etc/slurm/slurm.conf /run/slurm/conf/slurm.conf /var/spool/slurmd/conf-cache/slurm.conf 2>/dev/null'
ssh <hutch>-daq -l <hutch>opr 'scontrol ping'
ssh <hutch>-daq -l <hutch>opr 'SLURM_CONF=/run/slurm/conf/slurm.conf scontrol ping'
ssh <hutch>-daq -l <hutch>opr 'ls -l /usr/lib64/slurm/mpi_pmix* 2>/dev/null'
```

Compare against a known-good hutch DAQ node such as `tmo-daq` or `mfx-daq`.
A healthy configless RHEL7 hutch node may have no `/etc/slurm/slurm.conf`, a
working `/run/slurm/conf/slurm.conf`, and `srun --mpi=list` should include
`pmix`/`pmix_v3` when DAQ commands use PMIx.

Interpretation:

- If `scontrol ping` fails but `SLURM_CONF=/run/slurm/conf/slurm.conf scontrol
  ping` works, suspect a stale static `/etc/slurm/slurm.conf`.
- If `srun --mpi=list` lacks `pmix`/`pmix_v3`, and logs for jobs on the DAQ host
  show `invalid MPI type 'pmix'`, suspect an incompatible Slurm package build.
- `rpm -qi slurm` and `stat /etc/slurm/slurm.conf` can show when the package and
  static config appeared. Matching times shortly before a reboot suggest package
  installation/config management, not `slurmd` configless startup, created the
  stale file.

Correct fix:

- Do not treat setting `SLURM_CONF=/run/slurm/conf/slurm.conf` in DAQ commands
  as the permanent fix; it is a diagnostic or temporary workaround.
- Ask IT/root to remove or fix stale `/etc/slurm/slurm.conf` on configless nodes.
- Ask IT/root to install the site-compatible Slurm package set for the hutch
  nodes, including PMIx plugin support. As of the RIX 2026-07 incident, working
  peers used `slurm-20.11.3-1.el7_9` with `mpi_pmix.so`/`mpi_pmix_v3.so`; in the
  future, compare with a currently working DAQ node rather than hard-coding that
  version.
- After package/config repair, verify `squeue`, `scontrol ping`, `srun
  --mpi=list`, and `daqutils --cnf <config.py> wheredaq` before restarting DAQ.

## Reporting

When summarizing, include:

- Host and OS.
- Log path and relevant line numbers.
- Whether `SLURM_CPU_BIND*` appears before `srun`, after `srun`, or both.
- The job ID, step ID, node, and exact error text.
- A clear distinction between observation, inference, and proposed fix.
