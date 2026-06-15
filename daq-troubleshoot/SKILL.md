---
name: daq-troubleshoot
description: Use when troubleshooting LCLS DAQ hutch operations on production hutch DAQ nodes, including daqmgr/daqstat restart issues, Slurm job launch failures, CPU binding/environment leaks, DAQ process logs, TPR/XPM timing trigger routing for hutch cameras, and hutch operator account context for tmo, fix, txi, ued, mfx, or xpp.
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

## Log Inspection Workflow

1. Confirm host, OS, and `$HOME`.
2. Inspect only the requested log file or recent log names. For multi-process DAQ launches, group logs by the newest common timestamp and inspect `control`, `teb*`, `drp`/detector, and `meb*` logs from the same launch.
3. Search logs for high-signal markers before reading large sections:

```bash
grep -n -E '=====|SLURM_CPU_BIND|SLURM_JOB_ID|SLURM_STEP_ID|CPU binding|Unable to satisfy|srun:|error:|<E>|Phase [0-9] error|Failed to configure|Permission denied' <log>
```

4. For daqmgr/daqstat restart failures, compare these phases:

- Batch shell before `srun`: should not contain stale `SLURM_CPU_BIND*` from a parent job.
- Step shell after `srun`: may contain Slurm-assigned `SLURM_CPU_BIND*`, `SLURM_STEP_ID=0`, and the new job ID.
- `daqlog_header`: confirms the command, platform, host, and selected DAQ env subset.

5. If the failure is `CPU binding outside of job step allocation`, look for inherited `SLURM_CPU_BIND`, `SLURM_CPU_BIND_LIST`, `SLURM_CPU_BIND_TYPE`, or `SLURM_CPU_BIND_VERBOSE` in the batch shell before `srun`.

6. For state-change failures, start with `control.log` to identify the participant that failed, then inspect that participant's log. `control.log` may only say `teb0: Phase 1 error`; the actionable error is often earlier in `teb0.log`.

7. Confirm config edits through `daqlog_header` in the latest process log. The `# CMDLINE:` lines show the actual command Slurm launched, including `-o`, `-k`, `-p`, and `-u` options.

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

## Reporting

When summarizing, include:

- Host and OS.
- Log path and relevant line numbers.
- Whether `SLURM_CPU_BIND*` appears before `srun`, after `srun`, or both.
- The job ID, step ID, node, and exact error text.
- A clear distinction between observation, inference, and proposed fix.
