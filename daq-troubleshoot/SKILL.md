---
name: daq-troubleshoot
description: Use when troubleshooting LCLS DAQ hutch operations on production hutch DAQ nodes, including daqmgr/daqstat restart issues, Slurm job launch failures, CPU binding/environment leaks, DAQ process logs, and hutch operator account context for tmo, fix, txi, ued, mfx, or xpp.
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

## Log Inspection Workflow

1. Confirm host, OS, and `$HOME`.
2. Inspect only the requested log file or recent log names.
3. Search logs for high-signal markers before reading large sections:

```bash
grep -n -E '=====|SLURM_CPU_BIND|SLURM_JOB_ID|SLURM_STEP_ID|CPU binding|Unable to satisfy|srun:|error:' <log>
```

4. For daqmgr/daqstat restart failures, compare these phases:

- Batch shell before `srun`: should not contain stale `SLURM_CPU_BIND*` from a parent job.
- Step shell after `srun`: may contain Slurm-assigned `SLURM_CPU_BIND*`, `SLURM_STEP_ID=0`, and the new job ID.
- `daqlog_header`: confirms the command, platform, host, and selected DAQ env subset.

5. If the failure is `CPU binding outside of job step allocation`, look for inherited `SLURM_CPU_BIND`, `SLURM_CPU_BIND_LIST`, `SLURM_CPU_BIND_TYPE`, or `SLURM_CPU_BIND_VERBOSE` in the batch shell before `srun`.

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
