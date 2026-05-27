# CuPy RawKernel

Use this reference when launching custom CUDA kernels from Python with CuPy.

## Basic Pattern

```python
kernel = cp.RawKernel(CUDA_SOURCE, "kernel_name")
kernel.compile()  # avoids first-use compile/load noise in profiles

block_size = 256
grid_size = (nitems + block_size - 1) // block_size

kernel(
    (grid_size,),
    (block_size,),
    (dev_in, dev_out, np.int64(nitems), np.float32(scale), np.int32(iters)),
)
```

Use explicit NumPy scalar types for RawKernel arguments when the C signature is
specific:

```text
long long -> np.int64(...)
int       -> np.int32(...)
float     -> np.float32(...)
```

## Grid And Block

If each CUDA thread handles one element:

```cpp
long long i = (long long)blockDim.x * blockIdx.x + threadIdx.x;
if (i < n) {
    ...
}
```

then:

```python
grid_size = (nitems + block_size - 1) // block_size
```

This rounds up so all `nitems` elements have a thread. The `if (i < n)` guard
prevents extra threads from touching out-of-range memory.

## Streams

Inside `with stream:`, kernel launches use the current stream:

```python
with stream:
    kernel((grid_size,), (block_size,), args)
```

For clarity, CuPy also accepts an explicit stream argument in many RawKernel
launch patterns:

```python
kernel((grid_size,), (block_size,), args, stream=stream)
```

Check the installed CuPy version/docstring if exact launch signature behavior
matters.
