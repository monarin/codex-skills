---
name: psana-perlmutter
description: Build, activate, verify, and run Mona's lcls2/psana checkout on NERSC Perlmutter. Use for psana rebuilds, install-prefix or import-path problems, MPI/GPU launch setup, Perlmutter calibration/data access, and deciding whether source-tree GPU benchmark edits need rebuilding.
---

# psana on Perlmutter

Use this for `/global/homes/m/monarin/lcls2` on NERSC Perlmutter. Prefer the local helper scripts and verify the active import path after every install.

## Build Environment

Build and install packages on a login node, not a compute node. Compute nodes generally lack package-index access.

```bash
cd ~/lcls2
source ~/goodstuffs/bashrc
source ~/psana-nersc/activate_psana_build_env.sh ~/.conda-envs/psana-build
```

The activation script loads the Perlmutter conda and GCC modules, activates the build environment, sets `CC`/`CXX`, sets `MPICH_GPU_SUPPORT_ENABLED=0`, and exports the working SLAC calibration URL.

Do not activate an older psana install before building unless the build explicitly requires it; an old `PYTHONPATH` can hide which package is being refreshed.

## Preferred Build

Use the Perlmutter-specific minimal builder. It installs into the same prefix used by `activate_psana`:

```bash
cd ~/lcls2
source ~/goodstuffs/bashrc
source ~/psana-nersc/activate_psana_build_env.sh ~/.conda-envs/psana-build
./build_psana.sh -j 8
```

Default install prefix:

```text
~/lcls2/install_psana
```

`build_psana.sh` builds the required xtcdata/psana components without pulling in unrelated full-tree CUDA subprojects. Inspect `./build_psana.sh --help` before using optional flags.

Use `./build_psana.sh --clean -j 8` only when stale or incompatible native build products require it. `--clean` removes the active `install_psana`, `xtcdata/build_psana`, and `psalg/build_psana` before rebuilding, so confirm the command and preserve a working runtime when build success is uncertain.

The current script does not implement `--python-only`, even though an older NERSC README mentions it. Do not use that option unless `./build_psana.sh --help` lists it.

## Avoid Full-Tree Prefix Mismatches

Do not use root `./build_all.sh` as the default Perlmutter psana installer:

- Without `TESTRELDIR`, it installs into `~/lcls2/install`, while `activate_psana` loads `~/lcls2/install_psana`.
- An existing Meson `builddir` retains the prefix from its original configuration; changing `TESTRELDIR` alone does not redirect `meson install`.
- A force-clean full-tree build has been observed to fail in the unrelated `cusz` CUDA subproject because it configured `sm_52` and compiled double `atomicAdd`.

Use `build_all.sh` only when a task explicitly needs the full lcls2 Meson tree. Before doing so, inspect its install prefix, the configured Meson prefix, and the current CUDA subproject configuration. Never treat a successful build as proof that the runtime prefix was updated.

## Verify the Active Runtime

After building, activate and inspect the runtime:

```bash
source ~/goodstuffs/bashrc
source ~/psana-nersc/activate_psana_build_env.sh ~/.conda-envs/psana-build
activate_psana

python - <<'PY'
import psana
import psana.datasource

print("psana:", psana.__file__)
print("datasource:", psana.datasource.__file__)
PY
```

Accept the intended checkout's editable source path or `~/lcls2/install_psana`. Reject `~/lcls2/install`, another checkout, or an unexpected environment. When validating a change, also exercise the changed behavior; timestamps and build success alone are insufficient.

## GPU Runtime Environment

For GPU jobs, activate the CuPy CUDA shim after psana:

```bash
source ~/goodstuffs/bashrc
source ~/psana-nersc/activate_psana_build_env.sh ~/.conda-envs/psana-build
activate_psana
activate_psana2_gpu_cupy
```

Before a benchmark, verify the environment on a GPU compute node:

```bash
python - <<'PY'
from mpi4py import MPI
import cupy as cp

print("MPI:", MPI.Get_library_version())
print("CuPy:", cp.__version__)
print("CUDA runtime:", cp.cuda.runtime.runtimeGetVersion())
print("GPUs visible:", cp.cuda.runtime.getDeviceCount())
PY
```

## Slurm and MPI Launches

Request GPU resources explicitly. For Cray MPICH, prefer `srun --mpi=cray_shasta` after confirming it with `srun --mpi=list`.

Use `--gpu-bind=none` when benchmark ranks must initially see every GPU and psana assigns devices from `SLURM_LOCALID`. Also set explicit task counts, tasks per node, CPU binding, and GPU counts so rank placement is reproducible.

Example allocation shape:

```bash
salloc -A <account> -C gpu -q regular -N 1 -t 01:00:00 --gpus-per-node=4
```

Run benchmarks inside the allocation or from a batch script, not on a login node.

## Data and Calibration

Staged experiment data are typically under:

```text
/pscratch/sd/p/psdatmgr/psdm/<instr>/<exp>/xtc
```

Prefer explicit `dir=`/`--dir` paths for staged XTC data. Verify run configuration, detector configuration, and calibration constants before a large allocation.

Do not set `SIT_PSDM_OFFSITE=1` for the current Perlmutter setup. Keep it unset and use:

```bash
unset SIT_PSDM_OFFSITE
export LCLS_CALIB_HTTP=https://pswww.slac.stanford.edu/calib_ws/
```

`activate_psana_build_env.sh` already exports that calibration URL.

## Rebuild Decision

Rebuild when changed code is imported from an installed copy, compiled extensions changed, build metadata changed, or the run uses another checkout. First inspect `psana.__file__`, the wrapper target, and the active prefix.

A source-tree script executed directly does not require a rebuild when all of its imports resolve to the intended runtime. For example, `psana/psana/gpu/multiowner/run_nsys_gpu_context_overlap.sh` runs:

```bash
target_script="${repo_root}/psana/psana/gpu/multiowner/run_gpu_context_overlap.py"
```

Edits to that target script do not require rebuilding when the wrapper runs from the same checkout. Confirm the wrapper log's `target_script=...` line.
