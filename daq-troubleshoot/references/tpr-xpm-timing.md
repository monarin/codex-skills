# TPR / XPM Timing Trigger Reference

Use this reference for LCLS hutch troubleshooting involving TPR trigger screens,
XPM timing, and externally triggered cameras.

## Core Model

TPR means Timing Pattern Receiver. In the PCIe hutch-camera use case, it is a
PCIe card in an IOC/readout host that receives the LCLS timing stream and
generates local trigger outputs.

Conceptually:

```text
XPM / timing fanout
        |
        | optical LCLS timing stream
        v
PCIe TPR card in IOC/readout host
        |
        | local electrical trigger pulse(s)
        v
Andor / CCD / controls camera external trigger input
```

The PCIe bus is how the IOC reads and writes TPR registers. The timing input is
separate from PCIe. The downstream output is not another XPM protocol link; it
is normally a plain external trigger pulse cabled through local timing/trigger
distribution, patch panels, or level-conversion hardware.

## XPM Versus TPR

XPM is upstream timing and DAQ coordination. It handles L0/readout-group
behavior, enable/disable state, timing messages, deadtime/inhibits, and
sequence-related timing.

TPR is an endpoint/adapter. It listens to the timing stream, filters timing
events into local logical channels, then drives programmed trigger outputs with
specific delay, width, source, polarity, and rate.

So a TPR screen is not a replacement for the XPM screen. It is showing the local
translation from LCLS timing events into pulse outputs for devices that cannot
decode the timing stream themselves.

## Devices That Need TPR

Use TPR when the device is not itself an LCLS-II timing endpoint and only accepts
a conventional external trigger input such as TTL, NIM, LVDS, CameraLink CC, or
a vendor-specific trigger line.

Common examples:

- Andor cameras.
- CCD cameras.
- Controls/diagnostic cameras.
- Other auxiliary devices that need a deterministic exposure or acquisition
  strobe but do not participate in DAQ timing protocol directly.

At RIX, TPR standalone IOC configs include prefixes such as:

- `RIX:CAM:TPR:01`
- `RIX:ANDOR:TPR:01`
- `RIX:CCD:TPR:01`

These names are evidence that the TPR is serving camera trigger use cases, not
that the vendor camera has become an XPM endpoint.

## Why Some Detectors Connect "Directly"

Direct timing requires readout electronics that can receive and decode the LCLS
timing stream and integrate with DAQ readout groups.

For example:

- ePixQuad readout uses SLAC PGP/PCIe timing infrastructure with a timing
  receiver, trigger-event manager, trigger-event buffers, and XPM message
  alignment.
- Jungfrau KCU readout similarly has timing receiver and trigger-event handling
  in the front-end electronics.
- Piranha is subtle: the vendor camera itself does not decode XPM timing. The
  CameraLink gateway/readout electronics are the timing endpoint and then drive
  the camera over CameraLink.

So "connected to XPM directly" usually means direct timing into SLAC/KCU/DAQ
front-end electronics, not direct timing into the raw sensor or vendor camera.

## Reading A TPR Trigger Screen

A typical TPR trigger screen has two related tables:

- `CHxx` rows define event-selection channels. They choose a rate mode, rate
  attributes, optional destination/readout-group filtering, and report counts or
  rates.
- `TRxx` rows define physical or logical trigger outputs. They choose an
  enabled source channel, polarity, delay, width, complementary trigger behavior,
  and user description.

A pulse requires both:

- an enabled channel that matches timing events, and
- an enabled trigger output sourced from that channel.

Useful status fields:

- `Link Up`: the TPR is receiving timing.
- no version error: received frame format matches the firmware/software
  expectation.
- LCLS2 timing mode / XPM mode: expected for LCLS-II operations.
- fiducial rate near `928680 Hz`: raw LCLS-II timing/fiducial frame rate, not
  the camera trigger rate.
- LCLS2 app clock near `185.714286 MHz`: `1300/7 MHz`; one tick is about
  `5.385 ns`.

Example interpretation:

- `CH00` enabled in `AC` mode with attributes `3F` means all six AC time slots.
  At 60 Hz this is nominally 360 Hz before other filtering or operational
  effects.
- `TR00` enabled, source `CH00`, width `100000 ns`, delay `5.0000e+06 ns` means
  the trigger output emits a 100 us pulse about 5 ms after matching `CH00`
  events.

## Rate Modes

Common TPR channel modes:

- `Fixed`: use a fixed-rate timing marker.
- `AC`: use AC-line timing markers plus the six-bit time-slot mask.
- `Seq`: use a sequence bit/code from the timing/XPM sequence engine.
- `Group` or older `Partition`: select events by XPM/DAQ readout group.
- LCLS1 event-code mode exists for compatibility and older deployments.

Destination filtering:

- `Don't care`: ignore destination mask.
- `Inclusive`: require overlap with the configured destination mask.
- `Exclusive`: reject overlap with the configured destination mask.

## Delay And Width

The EPICS driver converts nanoseconds to firmware ticks roughly as:

```text
ticks = ns * 1e-3 * clock_MHz + 0.5
```

For the LCLS2 app clock of about `185.714286 MHz`, one tick is about `5.385 ns`.
A 5 ms delay is therefore about `928571` ticks.

In true LCLS2 operation, the trigger delay is the trigger's LCLS2 delay setting.
Some master/XPM delay fields are LCLS1 or compatibility paths and may not affect
the pulse in the expected way.

## Troubleshooting Checklist

Start with observations and avoid changing live PVs without permission.

1. Confirm this is a TPR-triggered device rather than a detector with a direct
   DAQ timing receiver.
2. Confirm the TPR IOC/PV prefix and host, for example `RIX:CAM:TPR:01`.
3. Check link state, timing mode, XPM mode, received frame version, and error
   counters.
4. Check the channel row: enabled state, rate mode, rate attributes,
   destination mask, and measured rate.
5. Check the trigger row: enabled state, source channel, delay, width, polarity,
   complementary settings, and description.
6. Verify that the camera is in external-trigger mode and that its exposure,
   readout, and deadtime can support the requested trigger rate.
7. Verify local cabling and signal level assumptions. The TPR output is a pulse
   routed through local hardware; it is not an XPM protocol cable into the
   camera.
8. Separate trigger generation from data acquisition. A camera can receive
   pulses while the DAQ, frame grabber, or vendor control path is still failing.

## Local Source Map

Useful local primary sources:

- TPR EPICS module:
  `/cds/group/pcds/epics/R7.0.3.1-2.0/modules/tprTrigger/R3.0.0`
- TPR standalone IOC template:
  `/cds/group/pcds/epics/ioc/common/tprStandalone/R2.1.0/iocBoot/templates/st.cmd`
- RIX TPR standalone IOC configs:
  `/cds/group/pcds/epics/ioc/rix/tprStandalone/R2.1.0`
- hpsTpr API:
  `/cds/group/pcds/package/timing/hpsTpr/R2.5.3/src/tprTriggerYaml.cc`
- DAQ timing examples:
  `psdaq/psdaq/configdb/epixquad1kfps_config.py`,
  `psdaq/psdaq/configdb/jungfrau_config.py`,
  `psdaq/psdaq/configdb/piranha4_config.py`
