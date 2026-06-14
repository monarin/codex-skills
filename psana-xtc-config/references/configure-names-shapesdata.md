# Configure, Names, ShapesData, and Event Interpretation

## Event-to-Configure Join

In xtc2, Configure dgrams describe the schema and identity of event data.
Event dgrams carry data blocks that point back to that schema.

```text
Configure:
  Names(namesId) -> detName, detType, detId, alg, segment, fields

Event:
  ShapesData.src / ShapesData.namesId -> Shapes + Data bytes

Join:
  ShapesData.namesId -> NamesLookup -> Names
```

`ShapesData` does not carry detector name or segment as independent fields.
The event parser gets those from the matching Configure `Names`.

## dgram.cc Path

Configure construction:

```text
dgram_init()
  -> assignDict(self, configDgram)
  -> if Configure:
       NamesIter(&(configDgram->dgram->xtc), configEnd)
       namesIter->iterate()
       dictAssignConfig(configDgram, namesLookup)
```

Event construction:

```text
PyConvertIter::process()
  -> ShapesData& shapesdata = *(ShapesData*)xtc
  -> NamesId namesId = shapesdata.namesId()
  -> DescData descdata(shapesdata, _namesLookup[namesId])
  -> dictAssign(pyDgram, descdata, xtc)
```

`dictAssign()` gets `Names& names = descdata.nameindex().names()` and uses
`names.segment()` when adding Python objects to the event hierarchy.

## Important Types

`NamesId` is encoded from two pieces:

```text
names_id_value = (node_id << 8) | names_id
```

For example:

```text
node_id=6, names_id=10 -> names_id_value=1546
```

`NameIndex` stores:

```text
nameMap:  field name -> field index
shapeMap: array field name -> shape index
```

`DescData` combines:

```text
Configure Names + event ShapesData
```

to compute:

```text
field offset relative to Data.payload()
array shape from event Shapes
```

## Jungfrau Example

`psdaq/drp/Jungfrau.cc` defines `raw` as:

```text
name = raw
type = UINT16
rank = 3
field_index = 0
shape_index = 0
shape = (1, 512, 1024)
```

Configure creates one `Names` per Jungfrau module/segment, with `detName`,
`detType`, `detId`, `rawNamesId`, and `segment`.

Event writing creates `ShapesData` using the same `rawNamesId` and allocates
the `raw` array.

## GPU Metadata Implication

For a GPU reader, stream id can route whole streams to the GPU, but stream id
alone is not enough to recover Jungfrau segment identity within a dgram.

The GPU-side metadata table should be Configure-derived:

```text
(stream_id, names_id_value) -> segment, raw_field_index, raw_shape_index,
                               dtype, rank, fixed/prototype shape
```

Then a GPU event parser can walk each bigdata dgram:

```text
find ShapesData
read ShapesData.src / names_id_value
lookup segment and raw metadata
locate Data.payload() + raw_data_offset
assemble/process segment data
```

