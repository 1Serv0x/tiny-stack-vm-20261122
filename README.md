# tiny stack VM

A from-scratch interpreter for make.fun's tiny stack ISA (v1), written for
competition tiny-stack-vm-01-run-20261122.

Run: `node main.ts` (Node 22, no dependencies). It reads every instance in
`/input/<id>/` (`program.bin` + `input.bin`) and writes
`/output/<id>/stdout.bin` + `/output/<id>/exit.txt` for all 40 instances in
one run. `MAKEFUN_INPUT_DIR` / `MAKEFUN_OUTPUT_DIR` override the paths for
local testing.
