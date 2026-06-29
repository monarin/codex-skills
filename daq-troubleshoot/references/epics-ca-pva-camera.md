# EPICS CA/PVA Camera PVs In DAQ

Use this reference for `drp_pva` camera/PV recording, EPICS CA/PVA provider
choice, discovery address lists, gateway bypass, and multi-IOC host issues.

## Pipeline Model

For a DAQ-recorded EPICS camera or PV:

```text
camera/device
  -> IOC process on controls/camera host
  -> EPICS CA or PVA discovery and monitor connection
  -> drp_pva process on DRP host
  -> PvMonitor callback queue
  -> timestamp match against L1Accept timing
  -> XTC payload
  -> TEB/MEB/event builder
  -> recorded data
```

Main components:

- IOC process: EPICS server that owns PVs such as
  `IM5K2:PPM:CAM:DATA1:Pva:Image`.
- `drp_pva`: DAQ process that monitors one or more EPICS PVs and inserts values
  into L1Accept XTC.
- EPICS client provider: library component inside `drp_pva` that handles
  provider-specific search, connection, monitor callbacks, and reconnects.
- `PvMonitor`: DAQ wrapper that extracts EPICS fields, queues PV updates, and
  matches them to L1Accept timestamps.

There is usually not a separate DAQ process called a "CA manager" in this path.
The manager-like behavior is in the EPICS client provider used by the DAQ
process.

## CA Versus PVA

CA is Channel Access, the older EPICS protocol. It is PV-oriented and commonly
used for scalar or array PVs with value, timestamp, alarm/status metadata.
Discovery uses UDP search packets; normal CA monitor data flows over the CA
connection after discovery.

PVA is PVAccess, the newer EPICS protocol. It supports structured data natively,
which is why area detector image PVs often look like `...:Pva:Image`. PVA image
structures can include value arrays, timestamps, dimensions, and other metadata.

In `psdaq/drp/PvaDetector.cc`, PV specs default to provider `pva`. Prefix a PV
with `ca/` to use the CA provider:

```text
MY:IMAGE:Pva:Image
ca/MY:OLD:CA:PV
```

The DAQ monitor request differs by provider:

```text
PVA: field(value,timeStamp,dimension)
CA:  field(value,timeStamp)
```

PVA can expose image dimensions through the monitored structure. CA may need
shape or type hints in the DAQ PV spec if the client cannot infer enough.

## Discovery Address Lists

`EPICS_CA_ADDR_LIST` and `EPICS_PVA_ADDR_LIST` control where the EPICS client
sends discovery/search traffic. `EPICS_CA_AUTO_ADDR_LIST=NO` or
`EPICS_PVA_AUTO_ADDR_LIST=NO` means use only the explicit list. `YES` allows
EPICS to also add local interface broadcast addresses.

Address-list examples:

```text
EPICS_PVA_ADDR_LIST=ctl-rix-cam-03
EPICS_PVA_ADDR_LIST=172.21.140.33
EPICS_PVA_ADDR_LIST=172.21.152.255
EPICS_CA_ADDR_LIST=172.27.131.255:5068
```

A host name or non-`.255` IP is usually unicast: search one specific host or
gateway. A `.255` address is usually a subnet broadcast: search everyone on
that subnet.

Do not call the broadcast address the EPICS gateway. They are different:

- Broadcast address: IP/network destination for UDP discovery on a subnet.
- EPICS gateway: proxy service that can answer searches and forward/proxy PV
  access between network areas.

Config comments such as "bypass gateway" usually mean the DAQ client is pointed
directly at an IOC host or controls subnet broadcast instead of an EPICS gateway
proxy.

## Multi-IOC Host And CA Unicast Fix

If multiple soft IOCs run on the same Linux host and a CA client sends a unicast
UDP search to that host's IP on CA search port `5064`, Linux may deliver the
packet to only one IOC process bound to that UDP port. If that IOC does not own
the requested PV, no process answers even though another IOC on the same host
does own the PV.

Broadcast delivery avoids this because every IOC listening on the host can see
the search packet and the owning IOC can answer.

`/cds/group/pcds/dist/pds/boot/epics-ca-unicast-fix.sh` installs an iptables
DNAT rule on the IOC host:

```bash
/sbin/iptables -t nat -A PREROUTING -d $ADDR -p udp --dport $PORT -j DNAT --to-destination $BCAST
```

The script:

1. Uses `${HOSTNAME}.pcdsn` to find the host's CDS/PCDSN IP.
2. Finds the interface broadcast address for that IP.
3. Adds a NAT PREROUTING rule that rewrites CA UDP searches to the host unicast
   IP into searches to the subnet broadcast address.

Run it on the IOC host, not the DRP host. If it is required, it should be
called from the IOC host startup path so it survives reboot. The script defaults
to CA port `5064`; pass a different port only when the IOC/gateway setup
requires it.

Important caveat: this script is explicitly for CA search behavior and
`EPICS_CA_ADDR_LIST`. Do not assume it fixes PVA discovery without checking the
relevant PVA protocol, port, and host setup.

## Debug Checklist

Use this checklist for camera/PV recording failures:

1. Identify the exact launched `drp_pva` process from the DAQ log group. Use the
   `daqlog_header` command line and environment, not only the config file.
2. Confirm the PV spec provider. No prefix means PVA; `ca/` means CA.
3. Inspect `EPICS_CA_ADDR_LIST`, `EPICS_PVA_ADDR_LIST`, and corresponding
   `AUTO_ADDR_LIST` values in the process environment.
4. Classify each address as host/unicast, subnet broadcast, or gateway/proxy.
5. Test discovery with the same provider and effective address-list environment
   when possible.
6. For CA PVs on a multi-IOC host, check whether unicast discovery is being used
   and whether the CA unicast fix is present and persistent.
7. For `drp_pva` damage, correlate `drp_event_rate`, `drp_update_rate`,
   `drp_empty_count`, `drp_tooOld_count`, and `drp_timeout_count` before
   deciding whether the issue is missing updates, timestamp mismatch, or
   timeout.

Production safety: do not add iptables rules, edit IOC startup scripts, restart
IOCs, change gateways, or mutate live DAQ configs without explicit permission.
