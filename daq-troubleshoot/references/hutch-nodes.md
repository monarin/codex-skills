# Hutch DAQ Node Reference

## Host And User Pattern

| Hutch | DAQ Host | Operator User |
| --- | --- | --- |
| tmo | `tmo-daq` | `tmoopr` |
| fix | `fix-daq` | `fixopr` |
| txi | `txi-daq` | `txiopr` |
| ued | `ued-daq` | `uedopr` |
| mfx | `mfx-daq` | `mfxopr` |
| xpp | `xpp-daq` | `xppopr` |

Use:

```bash
ssh <hutch>-daq -l <hutch>opr '<read-only command>'
```

## Filesystems

- Rocky 9 hutch accounts use `/sdf` for home and log files, for example `/sdf/home/x/xppopr`.
- RHEL7 hutch accounts use `/cds` for home and log files.
- Software and environment variables may still reference `/cds/sw` or `/reg/g` even on Rocky 9. Do not infer the user home from software paths.

Confirm on every hutch:

```bash
hostname
cat /etc/os-release
echo "$HOME"
```

## Common DAQ Paths

Typical log root:

```bash
$HOME/daq/logs/YYYY/MM
```

Typical scripts and test release locations:

```bash
$HOME/daq/scripts
$HOME/daq/git/<lcls2-checkout>/install
```

Do not modify anything in these directories without explicit permission.

## Slurm Environment Debugging

For daqmgr nested `srun` issues, distinguish:

- Parent submit environment: what `daqmgr`/`daqstat` passes to `sbatch`.
- Batch shell environment: what the generated sbatch script sees before `srun`.
- Step environment: what the `bash -c` payload sees after `srun` launches the job step.

`SLURM_CPU_BIND*` in the batch shell before `srun` can cause `srun` to treat it as a manual binding request. `SLURM_CPU_BIND*` in the step environment after `srun` can be normal Slurm-assigned step state.
