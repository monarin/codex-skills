# CuPy Streams And Events

Use this reference when reasoning about CUDA stream ordering, events, and CPU vs
GPU waits in CuPy code.

## Core Pattern

```python
stream = cp.cuda.Stream(non_blocking=True)
done = cp.cuda.Event()

with stream:
    # enqueue work on stream
    done.record()
```

`with stream:` changes CuPy's current stream inside the block. Many CuPy
operations use the current stream, but explicit `stream=` arguments are clearer
for memory copies.

## CPU Wait vs GPU Wait

CPU-side wait:

```python
done.synchronize()
```

This blocks Python until `done` completes. Use it before the CPU reads or
overwrites host memory that an async GPU operation may still be using.

GPU-side wait:

```python
other_stream.wait_event(done)
```

This enqueues a dependency into `other_stream` without blocking Python. Use it
to connect work submitted to different CUDA streams.

Equivalent low-level runtime form:

```python
cp.cuda.runtime.streamWaitEvent(other_stream.ptr, done.ptr, 0)
```

## Direct vs Stage Streams

Direct/per-workload:

```text
stream[slot]: H2D -> kernel -> D2H
```

Same-stream ordering already enforces H2D before kernel and kernel before D2H.
Extra `stream.wait_event(...)` calls for the same stream are usually redundant.

Stage/row-based:

```text
h2d_stream -> kernel_stream -> d2h_stream
```

Use event waits to connect the stages:

```python
with h2d_stream:
    # H2D
    h2d_done.record()

with kernel_stream:
    kernel_stream.wait_event(h2d_done)
    # kernel
    kernel_done.record()

with d2h_stream:
    d2h_stream.wait_event(kernel_done)
    # D2H
    d2h_done.record()
```

## Profiling Notes

If timeline gaps appear before the first kernel launch, call:

```python
kernel.compile()
```

or run one warmup launch before the profiled loop. CuPy can otherwise compile
and load a RawKernel on first use.
