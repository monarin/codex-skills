---
name: gpu-cuda-python
description: Use when working on Python GPU code involving CuPy, CUDA streams/events, pinned memory, asynchronous H2D/D2H copies, RawKernel launches, Nsight Systems profiling, or Perlmutter GPU overlap experiments.
metadata:
  short-description: CuPy/CUDA stream and profiling workflow
---

# GPU CUDA Python

Use this skill for Python GPU tasks where correctness or performance depends on
CUDA stream ordering, async memory copies, pinned memory, kernel launch shape, or
Nsight Systems timelines.

## Workflow

1. Confirm the active Python/CuPy environment when exact behavior matters:

```bash
python - <<'PY'
import cupy as cp
print(cp.__version__)
print(cp.cuda.runtime.runtimeGetVersion())
PY
```

2. Prefer this reference order:

```text
1. Inspect installed CuPy docstrings/source in the active environment.
2. Check official docs at https://docs.cupy.dev for the relevant version.
3. Check https://github.com/cupy/cupy only when docs/docstrings are unclear.
```

3. For overlap investigations, verify these common footguns:

- `cupy.ndarray.get()` defaults to `blocking=True`; use `blocking=False` for async D2H.
- Async H2D/D2H needs pinned host memory for useful overlap.
- Use `stream.wait_event(event)` for GPU-side ordering without blocking Python.
- Use `event.synchronize()` only when the CPU must touch data or reuse host memory.
- Use `kernel.compile()` or a warmup launch before profiling to remove first-use CuPy compile/module-load noise.
- CUDA event timing sums can exceed wall time when work overlaps.

## References

Read only the reference file needed for the task:

- `references/cupy_streams_events.md`: streams, events, current stream, `wait_event`, `synchronize`.
- `references/cupy_memory_transfers.md`: pinned memory, `set`, `get`, async H2D/D2H.
- `references/cupy_rawkernel.md`: RawKernel launch patterns, scalar typing, grid/block sizing.
- `references/nsys_perlmutter.md`: Nsight Systems profiling commands and Perlmutter environment notes.

## Official Docs

Useful starting points:

```text
https://docs.cupy.dev/en/stable/user_guide/cuda_api.html
https://docs.cupy.dev/en/stable/user_guide/memory.html
https://docs.cupy.dev/en/stable/reference/generated/cupy.ndarray.html
https://github.com/cupy/cupy
```
