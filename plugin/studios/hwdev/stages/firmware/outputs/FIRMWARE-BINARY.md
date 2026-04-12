---
name: firmware-binary
location: (project build output)
scope: repo
format: artifact
required: true
---

# Firmware Binary

The compiled firmware artifact ready to flash onto the target hardware.

## Content Guide

- **Compiled binary** — signed where the platform supports it
- **Version metadata** — embedded version string accessible at runtime
- **Update mechanism** — documented process for field updates (OTA, physical, bootloader)
- **Flashing instructions** — for manufacturing and field service

## Completion

Complete when firmware implements all functional requirements, passes HIL tests, and fits within memory/flash budgets with update headroom.
