---
name: psana2-gpu
description: Use when designing, implementing, reviewing, testing, or benchmarking GPU acceleration in LCLS2 psana2, including CPU-push and GPU-pull models, EventBuilder GPU SMD batches and ABI, KvikIO/cuFile/GDS bigdata reads, GPU detector processing, CUDA slot and result lifetimes, memory backpressure, asynchronous D2H joins, MPI GPU sharing, and psana2 GPU performance.
---

# psana2 GPU

Use this skill for the psana2 GPU project. Treat the active `lcls2` source as
authoritative because this branch changes quickly; use the references here for
durable contracts, design context, and validation discipline.

## First Checks

1. Locate the active `lcls2` checkout and inspect its branch, status, and recent
   commits. Do not assume `~/lcls2` is the checkout used by the task.
2. Use `git ls-files` or `rg` over tracked source. Ignore stale `__pycache__`
   files left by removed prototypes.
3. Read the current repository notes when they exist:
   - `psana/psana/gpu/notes/cpu_push_prototype.md`
   - `psana/psana/gpu/notes/gpu_memory_backpressure_and_async_join.md`
   - `psana/psana/gpu/notes/d2h_interval_bandwidth_results.md`
4. Verify claims against current code before editing. Notes and this skill may
   describe a design that is not implemented yet.
5. Keep unrelated dirty worktree changes untouched.

## Select The Work Area

- For shared invariants, terminology, and the GPU batch contract, read
  `references/architecture-contracts.md`.
- For the implemented CPU-push path and source map, read
  `references/cpu-push-current.md`.
- For a future GPU-pull worker or service model, read
  `references/gpu-pull-options.md`.
- For quotas, slot leases, subbatches, async D2H, joins, and OOM/deadlock
  analysis, read `references/memory-backpressure.md`.
- For benchmark interpretation and the current baseline, read
  `references/performance-baseline.md`.
- For tests, task separation, and cross-server handoffs, read
  `references/validation-and-handoffs.md`.

Use related personal skills when needed:

- Use `psana` for generic DataSource, SmdReader, EventBuilder, EventManager,
  transition, and MPI-role internals.
- Use `psana-xtc-config` for Configure Names, ShapesData, NamesId, segment order,
  and payload-offset reasoning.
- Use `gpu-cuda-python` for CUDA streams/events, CuPy allocation, pinned memory,
  asynchronous copies, RawKernel, and profiling details.

## Durable Contracts

Preserve these unless the task explicitly changes the architecture:

- Smd0 remains unchanged and sends normal SMD chunks to EventBuilder ranks.
- EventBuilder creates coherent CPU and GPU SMD batches for the same event
  range, plus transition/step data.
- The GPU SMD batch is a versioned, byte-oriented ABI with event identity and
  bigdata descriptors. Do not require pickle on the MPI hot path.
- A CPU process still submits KvikIO/cuFile reads. With GDS, the destination is
  GPU VRAM without a CPU payload bounce; CUDA kernels do not open files.
- CPU and GPU results remain correlated by timestamp and batch event identity.
- BeginStep does not replace calibration constants until dependent GPU work has
  drained. EndRun drains exactly once.
- Physical detector segment ordering follows L1Accept child-XTC order after
  validation against Configure membership.
- A reusable GPU slot cannot be overwritten until every consumer completion
  token has finished.
- Backpressure is byte-budgeted. Slot count, `batch_size`, and `join_size` alone
  are not a memory policy.
- `join_size` is a logical delivery target; physical D2H chunks may be smaller.
- Multiple CPU BD processes may share one GPU. One BD controlling multiple GPUs
  is not a current requirement.
- Jungfrau is the current implementation. Keep framework contracts detector
  independent and reject unsupported detectors explicitly.

## Current Source Map

Start with these tracked files, then follow current imports and callers:

```text
psana/psana/gpu/gpu_events.py
psana/psana/gpu/gpu_batch.py
psana/psana/gpu/gpu_kvikio_read.py
psana/psana/gpu/gpu_stream.py
psana/psana/gpu/gpu_calib.py
psana/psana/gpu/context.py
psana/psana/gpu/detector_router.py
psana/psana/gpu/gpu_mpi.py
psana/psana/eventbuilder.pyx
psana/psana/psexp/eventbuilder_manager.py
psana/psana/psexp/event_manager.py
psana/psana/psexp/node.py
psana/psana/psexp/run.py
```

Do not reintroduce deleted standalone pipeline modules, `StreamPool`, or
`GPUKernelRegistry` merely because old notes, logs, or bytecode mention them.

## Engineering Workflow

1. State whether behavior is implemented, proposed, or measured.
2. Trace ownership end to end: descriptor owner, input-buffer owner,
   calibration-output owner, downstream consumer, and release event.
3. Separate communication size, GPU execution size, result-retention size, and
   logical join size.
4. For memory changes, account for raw input, gather/scratch, calibrated output,
   constants/caches, geometry, CuPy pool behavior, pinned host buffers, and
   multiple BDs sharing the same device.
5. For performance changes, record dataset, topology, GPU assignment,
   `batch_size`, pool depth, join/D2H policy, GDS status, event count, warmup,
   and memory/NIC measurements.
6. Preserve CPU-only tests and pixel-exact GPU acceptance before comparing
   throughput.
7. Keep performance assertions out of pytest; use scripts and saved reports.

## Review Guardrails

Challenge designs that:

- Infer GPU-buffer release from advancing a Python generator.
- Retain `join_size` full images in VRAM without a byte-budget proof.
- Launch asynchronous D2H without connecting its completion event to slot
  reuse.
- Call `free_all_blocks()` or drop one buffer owner and describe that as full
  backpressure.
- Assume GDS is active without checking KvikIO/cuFile runtime state.
- Treat `gpu_d2h_interval=N` as copying all N events; it samples one event every
  N events in the existing benchmark driver.
- Infer segment order by sorting Configure IDs rather than checking L1Accept.
- Hide unsupported detector layouts behind Jungfrau-specific constants.
