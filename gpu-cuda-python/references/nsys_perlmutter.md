# Nsight Systems On Perlmutter

Use this reference for profiling Python CuPy GPU overlap experiments on
Perlmutter.

## Environment

From the lcls2 checkout:

```bash
cd ~/lcls2
source ~/goodstuffs/bashrc
source ~/psana-nersc/activate_psana_build_env.sh
activate_psana
```

If the psana GPU CuPy helper is needed:

```bash
activate_psana2_gpu_cupy
```

## Basic Nsight Command

```bash
mkdir -p /pscratch/sd/m/monarin/psana2-gpu/practice

nsys profile \
  --trace=cuda,nvtx,osrt \
  --cuda-memory-usage=true \
  --force-overwrite=true \
  -o /pscratch/sd/m/monarin/psana2-gpu/practice/name_here \
  python path/to/script.py
```

This creates:

```text
/pscratch/sd/m/monarin/psana2-gpu/practice/name_here.nsys-rep
```

## Common Interpretation Checks

- Look at both CUDA API rows and CUDA HW rows.
- A `cudaEventSynchronize` blocks CPU; it serializes work only if it happens
  before later work is enqueued.
- A `cudaStreamWaitEvent`/`stream.wait_event` is GPU-side ordering and should
  not block Python.
- If first kernel launch appears much later than first H2D, suspect CuPy
  RawKernel compile/load overhead; use `kernel.compile()` or warmup.
- If H2D/D2H copies are too short to see, increase copy size or reduce zoom.
- If kernels do not overlap, the kernel may be large enough to occupy all SMs.
