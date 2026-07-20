# GPU Memory Backpressure And Join Lifetime

## Contents

- Current problem
- Budget model
- Subbatch admission
- Slot lifecycle
- Async D2H and join semantics
- Deadlock prevention
- Multiple BDs
- Failure policy

## Current Problem

The current ring bounds batches by `n_gpu_streams`, but batches vary in bytes.
Reusable KvikIO input, raw gather, calibrated output, constants, caches,
geometry, CuPy allocator state, and host D2H buffers all contribute to memory
pressure.

Calibrated event arrays are views into reusable slot buffers. A source slot is
unsafe to overwrite while any downstream kernel or asynchronous D2H still reads
it. Synchronizing only the calibration stream is insufficient when work escapes
to another stream.

## Budget Model

For each BD, define a hard GPU quota with explicit safety margin:

```text
M_gpu =
    M_fixed_constants_caches_geometry
  + sum(M_raw_input_slot_capacity)
  + sum(M_gather_scratch_slot_capacity)
  + sum(M_output_slot_capacity)
  + M_retained_gpu_results
  + M_allocator_margin

M_gpu <= per_bd_gpu_budget
```

Track both:

```text
committed capacity  Physical reusable allocations owned by the BD
active leases       Committed buffers that cannot currently be overwritten
```

Completing work makes capacity reusable; it does not necessarily return memory
to CUDA. Before growing a high-water buffer, reserve the additional bytes.

Pinned host memory has a separate quota:

```text
sum(inflight_pinned_chunk_capacity) <= pinned_host_budget
```

For several BDs sharing a 40 GiB GPU, static per-BD quotas are a reasonable
prototype. Leave headroom for CUDA contexts, fixed state, allocator behavior,
and non-psana use.

## Subbatch Admission

Do not make EB `batch_size` the allocation unit. Estimate each event's:

```text
bigdata input bytes
raw gather/scratch bytes
calibrated output bytes
detector workspace
requested retained result bytes
```

Partition one coherent EB batch into byte-bounded GPU subbatches. Fill up to
`pool_depth` slots from that communication, while excess subbatches wait in a
bounded local queue.

When credits are unavailable:

1. Stop admitting subbatches.
2. Stop receiving/requesting EB work after the bounded queue fills.
3. Complete or wait for existing consumers.
4. Release leases and resume.

If one event cannot fit with exclusive use of the BD quota, fail explicitly or
use a documented fallback.

## Slot Lifecycle

Use an explicit state machine:

```text
FREE
  -> READING
  -> COMPUTING
  -> RESULT_READY
  -> GPU_CONSUMER or D2H_IN_FLIGHT
  -> FREE
```

Completion points may include:

```text
read_done
calib_done
downstream_done
d2h_done
```

On a separate D2H stream:

```text
producer stream:  record calib_done
copy stream:      wait calib_done -> D2H -> record d2h_done
EventPool:        do not reuse source slot before d2h_done
```

Generator advancement is not a completion event. A GPU result exposed to user
code needs explicit lease/release semantics, such as releasing after a CUDA
event. If the user retains a lease, the scheduler stalls safely instead of
overwriting the array.

## Async D2H And Join Semantics

Keep these controls separate:

```text
join_size          Logical CPU delivery target
d2h_chunk_size     Physical events/bytes in one D2H
d2h_max_inflight   Number of bounded pinned chunks in flight
```

For `join_size=100` and `d2h_chunk_size=10`, transfer ten results at a time,
release their GPU slots after `d2h_done`, and accumulate completed host chunks
until 100 logical results are available.

For full images, prefer direct async D2H from execution-slot output to a
bounded pinned buffer. Do not duplicate all images in a full-size GPU join
buffer.

For compact outputs such as angular-integration bins, process:

```text
calibration -> GPU reduction -> compact result -> async D2H
```

Release full-image storage after reduction. A compact GPU join accumulator may
be reasonable when its budget is negligible.

## Deadlock Prevention

Avoid this circular dependency:

```text
all slots hold results waiting for join_size=100
only 20 events fit
no slot can process events 21..100
join threshold can never be reached
```

Bounded D2H chunks normally break this cycle without changing the logical join.

Return fewer than `join_size` events when required by:

- BeginStep.
- EndRun or end-of-input.
- `max_events`.
- Explicit flush.
- Host-memory or delivery-queue pressure.

GPU pressure should generally trigger an earlier physical D2H chunk, not an
early logical result. If host storage cannot retain the configured join, emit a
documented partial join rather than deadlock. Include `n_events`, partial
status, and flush reason in the result.

When admission stalls, distinguish:

- In-flight read/kernel/D2H: wait for its completion event.
- Completed GPU result: start bounded D2H or downstream processing.
- Full host accumulator: emit a full or partial logical join.
- User-held GPU lease: wait, diagnose, or apply an explicit timeout policy.
- Oversized event: fail or fallback.

## Multiple BDs

Independent processes cannot infer aggregate safety from their own CuPy pool.
The first implementation can assign static quotas per BD/GPU mapping. A later
GPU-wide coordinator should provide aggregate accounting, fairness, and credit
return while avoiding double-counting physically shared constants.

## Failure Policy

Never handle pressure by silently overwriting, unbounded allocation, or changing
event semantics. Prefer:

```text
wait for a finite completion
split work
transfer/reduce earlier
emit a documented partial join
use an explicit fallback
raise a specific memory-pressure error
```

The canonical repository design is
`psana/psana/gpu/notes/gpu_memory_backpressure_and_async_join.md`.
