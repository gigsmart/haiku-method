---
name: schematic
location: (project design tree / EDA files)
scope: repo
format: artifact
required: true
---

# Schematic

The complete electrical schematic with component values, part numbers, and rationale for non-obvious choices. This is the authoritative source for electrical design.

## Content Guide

- **All nets named** where naming aids readability
- **All components** have part numbers in the BOM and rationale for critical choices
- **Power tree** documented showing regulation and decoupling strategy
- **Signal integrity** considered for any high-speed paths

## Completion

Complete when ERC is clean, the BOM is sourced with confirmed availability, and design review has signed off.
