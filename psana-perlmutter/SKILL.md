---
name: psana-perlmutter
description: Build, activate, verify, and run Mona's lcls2/psana checkout on NERSC Perlmutter. Use for psana rebuilds, install-prefix or import-path problems, MPI/GPU launch setup, Perlmutter calibration/data access, and deciding whether source-tree GPU benchmark edits need rebuilding.
---

# psana on Perlmutter

Use this for `/global/homes/m/monarin/lcls2` and its linked worktrees on NERSC Perlmutter. Prefer the local helper scripts and verify the active import path after every install.

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

Use the checkout-local Meson builder. It configures the root Meson project with `build_daq=false`, hides `nvcc` by default, and installs into the same checkout-local prefix used at runtime:

```bash
cd ~/lcls2
source ~/goodstuffs/bashrc
source ~/psana-nersc/activate_psana_build_env.sh ~/.conda-envs/psana-build
./build_psana.sh -j 8
```

Default paths:

```text
<checkout>/builddir_psana
<checkout>/install_psana
```

The Meson configuration includes the active conda environment's headers for dependencies such as RapidJSON. Inspect `./build_psana.sh --help` before using optional flags.

Useful options:

- `--clean`: remove the selected `install_psana` and `builddir_psana`, then configure and rebuild. Use this after moving a worktree, changing the prefix/build directory, or making incompatible native/build-metadata changes.
- `--python-only`: skip Meson configure/compile/install and refresh only the installed Python package. It requires an existing build directory and install tree; do not combine it with `--clean`.
- `--build-dir DIR`: select a different Meson build directory.
- `--with-cuda`: allow `nvcc` detection and CUDA subprojects. The default deliberately removes `nvcc` from the build `PATH` to avoid unrelated CUDA builds.
- `--build-type TYPE`: select `debug`, `debugoptimized`, `release`, `minsize`, or `plain`.

The legacy `--build-list` and `--with-psalg` options are accepted only for compatibility and are ignored by the Meson flow.

## Multiple Worktrees

Build from inside each checkout so its build and install prefixes remain isolated:

```bash
cd ~/lcls2
./build_psana.sh -j 8

cd ~/lcls2_worktree/features/psana2-gpu-eb-topology-bench
./build_psana.sh -j 8
```

Do not share `builddir_psana` or `install_psana` between worktrees. Meson records absolute source, build, and install paths.

For the current GPU worktree workflow, use the checkout-aware activation helper:

```bash
# ~/lcls2
source ~/activate_psana_gpu.sh

# ~/lcls2_worktree/features/psana2-gpu-eb-topology-bench
source ~/activate_psana_gpu.sh features/psana2-gpu-eb-topology-bench
```

The `activate_psana` function in `~/goodstuffs/bashrc` is appropriate only for the default `~/lcls2` checkout because it hardcodes `~/lcls2/install_psana`.

## Avoid Full-Tree Prefix Mismatches

Do not use root `./build_all.sh` as the default Perlmutter psana installer:

- Without `TESTRELDIR`, it installs into `~/lcls2/install`, while the psana activation helpers load `install_psana`.
- An existing Meson build directory retains the prefix from its original configuration; changing an environment variable alone does not redirect `meson install`.
- A force-clean full-tree CUDA build has been observed to fail in the unrelated `cusz` subproject because it configured `sm_52` and compiled double `atomicAdd`.

Use `build_all.sh` only when a task explicitly needs the full lcls2/psdaq/CUDA tree. The checkout-local `build_psana.sh` is also Meson-based, but it sets `build_daq=false` and suppresses CUDA discovery unless `--with-cuda` is explicitly requested.

## Verify the Active Runtime

After building the default checkout:

```bash
source ~/activate_psana_gpu.sh

python - <<'PY'
import psana
import psana.datasource

print("psana:", psana.__file__)
print("datasource:", psana.datasource.__file__)
PY
```

For a named worktree, pass its full branch name to `activate_psana_gpu.sh` first. Accept only the intended checkout's `install_psana`. Reject `~/lcls2/install`, another checkout, or an unexpected environment. When validating a change, also exercise the changed behavior; timestamps and build success alone are insufficient.

## GPU Runtime Environment

`activate_psana_gpu.sh` activates both the selected psana install and the CuPy CUDA shim. Before a benchmark, verify the environment on a GPU compute node:

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

Rebuild when compiled extensions, Meson files, packaging metadata, the checkout, build directory, or install prefix changes.

- For compatible pure-Python/package changes with an existing native build, use `./build_psana.sh --python-only -j 8`.
- For native-source changes, run `./build_psana.sh -j 8`.
- For incompatible native/build-metadata changes or a relocated worktree, use `./build_psana.sh --clean -j 8`.

Always inspect `psana.__file__`, the wrapper target, and the active prefix after rebuilding.

A source-tree script executed directly does not require a rebuild when all of its imports resolve to the intended runtime. For example, `psana/psana/gpu/multiowner/run_nsys_gpu_context_overlap.sh` runs:

```bash
target_script="${repo_root}/psana/psana/gpu/multiowner/run_gpu_context_overlap.py"
```

Edits to that target script do not require rebuilding when the wrapper runs from the same checkout. Confirm the wrapper log's `target_script=...` line.
