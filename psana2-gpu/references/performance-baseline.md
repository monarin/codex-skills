# psana2 GPU Performance Baseline

## Contents

- Baseline context
- D2H results
- Interpretation
- Benchmark requirements
- Bottleneck isolation

## Baseline Context

The dated baseline below was collected on 2026-07-06 using:

```text
experiment: mfx101210926
run: 387
topology: 1 Smd0, 1 EB, 1 BD, 1 A100
GPU batch_size: 1
GPU pool depth: 2
events: 16000
KvikIO path: CPU fallback, not true GDS
```

The exact dataset may no longer be retained. Treat these numbers as historical
evidence and rerun on a documented available dataset before making capacity
claims.

## D2H Results

| Run | Loop time | Rate | D2H calls | D2H time |
| --- | ---: | ---: | ---: | ---: |
| CPU raw path | 419.61 s | 38.1 Hz | 0 | 0 |
| GPU read + calib, no D2H | 159.47 s | 100.3 Hz | 0 | 0 |
| GPU D2H interval 100 | 162.10 s | 98.7 Hz | 160 | 2.63 s |
| GPU D2H interval 10 | 185.39 s | 86.3 Hz | 1600 | 25.90 s |
| GPU D2H every event | 404.16 s | 39.6 Hz | 16000 | 246.37 s |

For a full 32-segment Jungfrau float32 calibration result:

```text
32 * 512 * 1024 * 4 bytes = 64 MiB/event
```

Measured synchronous D2H cost was approximately 15-16 ms per copied event.

Active NIC receive measurements were approximately:

| Run | Average | Maximum |
| --- | ---: | ---: |
| CPU | 1.27 GB/s | 1.51 GB/s |
| GPU, no D2H | 2.31 GB/s | 3.60 GB/s |
| GPU, D2H every event | 1.30 GB/s | 1.58 GB/s |

## Interpretation

The baseline supports these claims:

- The GPU read/calibration path can exceed the one-BD CPU raw path even when
  KvikIO uses CPU fallback.
- Synchronous per-event D2H is additive and removes most of that advantage.
- D2H should be asynchronous and overlap later useful work when possible.

It does not establish:

- True-GDS performance.
- Performance for other detectors or compressed data.
- That retaining 100 images in VRAM is efficient.
- That one 100-event D2H is better than bounded smaller D2H chunks.
- Multi-node scalability.

`gpu_d2h_interval=100` copied one sampled event every 100 events. It was not a
100-event batched transfer.

## Benchmark Requirements

Every report should record:

```text
git commit and dirty state
dataset path, experiment, and run
event count and warmup
MPI ranks and roles per node
BDs per GPU and rank-to-GPU mapping
GPU model and memory size
batch_size and n_gpu_streams/pool depth
GPU subbatch and queue policy, if present
join size, D2H chunk size, and inflight count
requested detector operation
GDS availability and KvikIO compatibility mode
loop time separately from load time
per-rank event distribution
GPU/pinned memory current and high-water bytes
NIC receive/transmit counters
```

Use CUDA/Nsight timing only after warming RawKernel compilation and module load.
Do not sum overlapping stage times and compare that sum directly to wall time.

## Bottleneck Isolation

Use controlled comparisons:

1. EB-only or bigdata-bypass behavior to bound event-building throughput.
2. CPU read with no detector access.
3. CPU detector raw/calib path.
4. GPU read only.
5. GPU read plus calibration, no D2H.
6. Synchronous D2H every event.
7. Bounded asynchronous D2H of all requested results.
8. Compact downstream result plus asynchronous D2H.
9. One BD/GPU scaling before multiple BDs/GPU.

Monitor node traffic with `psana/psana/debugtools/net_bandwidth.py`. On S3DF,
interface counters may be more representative than InfiniBand port counters,
depending on the storage network route.

Canonical repository evidence:

```text
psana/psana/gpu/notes/d2h_interval_bandwidth_results.md
psana/psana/gpu/notes/performance_report_gpu.md
```
