# CuPy Memory Transfers

Use this reference for pinned host memory and async H2D/D2H copies in CuPy.

## Pinned Host Memory

Use `cupyx.empty_pinned` for NumPy host arrays backed by pinned memory:

```python
import cupyx

host_in = cupyx.empty_pinned(nitems, dtype=cp.float32)
host_out = cupyx.empty_pinned(nitems, dtype=cp.float32)
```

Pinned memory is important for useful asynchronous host-device copies.

Official docs:

```text
https://docs.cupy.dev/en/stable/user_guide/memory.html
```

## H2D

High-level H2D:

```python
dev_in.set(host_in, stream=stream)
```

Low-level H2D:

```python
cp.cuda.runtime.memcpyAsync(
    dev_in.data.ptr,
    int(host_in.ctypes.data),
    nbytes,
    cp.cuda.runtime.memcpyHostToDevice,
    stream.ptr,
)
```

## D2H

`cupy.ndarray.get()` defaults to `blocking=True`, so this blocks Python:

```python
dev_out.get(out=host_out, stream=stream)
```

Use `blocking=False` for async D2H:

```python
dev_out.get(out=host_out, stream=stream, blocking=False)
```

Record an event after the async D2H and synchronize only when CPU needs to read
or reuse `host_out`:

```python
with stream:
    dev_out.get(out=host_out, stream=stream, blocking=False)
    d2h_done.record()

# later, before CPU touches host_out
d2h_done.synchronize()
```

Official ndarray docs:

```text
https://docs.cupy.dev/en/stable/reference/generated/cupy.ndarray.html
```

## Buffer Reuse Rules

For a slot containing `host_in`, `dev_in`, `dev_out`, `host_out`:

```text
host_in reusable after H2D finishes
dev_in reusable after kernel finishes
dev_out reusable after D2H finishes
host_out valid/reusable after D2H finishes
```

Prefer CPU `event.synchronize()` for host memory safety and stream
`wait_event()` for GPU-side ordering.
