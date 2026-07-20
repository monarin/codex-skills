# GPU-Pull Options

## Contents

- Definition
- Shared contracts
- Candidate topology
- CPU-push comparison
- Queue and ownership requirements
- Incremental exploration
- Open questions

## Definition

GPU-pull is a future possibility, not an implemented psana2 path. It means a
GPU-owning worker pulls descriptor work from a bounded queue rather than a CPU
BD synchronously driving every GPU batch as part of its event iterator.

It does not mean a CUDA kernel calls the filesystem. A CPU thread/process still
submits KvikIO/cuFile requests and CUDA work. With GDS, payload DMA can land in
GPU VRAM without a CPU payload bounce.

## Shared Contracts

GPU-pull should reuse, where practical:

- Unchanged Smd0 behavior.
- EventBuilder CPU/GPU split.
- Versioned GPU batch ABI.
- Configure-derived detector routing.
- Event identity and transition semantics.
- Detector processing interfaces.
- Byte-budget and completion-token ownership.

A GPU-pull experiment should not require a second incompatible descriptor
format merely to change which process owns the work queue.

## Candidate Topology

```text
Smd0 -> EventBuilder
             |
             +-> CPU SMD batches -> CPU BD workers
             |
             +-> GPU descriptor queue
                       |
                       v
                 GPU-owning worker
                   -> KvikIO/cuFile submit
                   -> detector kernels
                   -> bounded completion/result queue
                       |
                       v
                 CPU/GPU timestamp join
```

The GPU worker may be a dedicated process per GPU or a controlled service used
by several CPU BDs. Either form introduces routing, fairness, queue ownership,
and failure handling beyond the current CPU-push model.

## CPU-Push Comparison

| Concern | CPU-push | GPU-pull possibility |
| --- | --- | --- |
| GPU scheduling | Each BD schedules its batches | GPU owner schedules pulled work |
| BDs per GPU | Several independent GPU contexts | One coordinated queue is possible |
| Backpressure | Per-BD plus future shared quota | Central queue can enforce credits |
| Result routing | Naturally returns to owning BD | Route completion to origin event/BD |
| Failure scope | Mostly local to one BD | GPU worker failure affects producers |
| MPI complexity | Follows BD event loop | Adds request/completion protocol |
| Fairness | Static pinning/quota | Scheduler can arbitrate explicitly |

GPU-pull may simplify aggregate memory control and improve GPU utilization, but
it increases distributed-state and lifecycle complexity.

## Queue And Ownership Requirements

Every queue must be bounded by bytes as well as item count. A descriptor is
small, but accepting it commits future input, scratch, output, and result
storage.

The worker needs:

```text
admission reservation
originating BD/event identity
GPU slot lease
read/kernel completion events
result consumer or D2H completion token
credit return
error and cancellation routing
```

Transition barriers require coordination across queued work. BeginStep cannot
update calibration state until every earlier event depending on old constants
has completed. EndRun stops admission, drains accepted work, returns results,
and terminates once.

## Incremental Exploration

Do not start by changing Smd0 or detector kernels. A controlled experiment can:

1. Keep the existing GPU batch ABI.
2. Insert an in-process bounded work queue between `GpuEvents` and EventPool.
3. Move scheduling to a dedicated CPU thread while retaining one process/GPU.
4. Measure queueing, overlap, and transition behavior.
5. Only then evaluate a dedicated MPI/shared-memory GPU worker.

This separates the scheduling question from network protocol and detector
correctness.

## Open Questions

- Is one GPU worker process preferable to multiple CUDA contexts per GPU?
- How are CPU events retained and routed while GPU results complete out of
  order?
- What MPI thread level is required if a background thread receives work?
- Should EventBuilder send GPU work directly to GPU workers or continue through
  CPU BDs?
- How are step transitions and calibration updates broadcast and acknowledged?
- How are failures isolated when several BDs share one GPU worker?
- Is added queue latency justified by measured CPU-push bottlenecks?

Treat GPU-pull as a measured alternative, not an assumed CPU-push replacement.
