// Tiny stack VM for make.fun tiny-stack-vm-01-run-20261122, written from
// scratch from the ISA (v1): 32-bit wrapping ints, 256-value data stack,
// 64-deep call stack, 256 words of memory, byte I/O, ten traps with their
// own exit codes, 1,000,000-step and 65,536-byte limits. One run answers
// all 40 instances: /input/<id>/program.bin + input.bin in,
// /output/<id>/stdout.bin + exit.txt out.
//
// Per step, in the ISA's order: step limit, pc in bounds, known opcode,
// immediate fits, stack underflow, stack overflow, then the instruction's
// own traps and effect. MUL is the low 32 bits of the exact product
// (Math.imul, never a rounded float); DIV truncates toward zero with
// INT_MIN / -1 staying INT_MIN; MOD takes the sign of its first operand,
// x % -1 is 0; DIVU/MODU/LTU read operands unsigned; shifts use only the
// low 5 bits of the count, SHR copies the sign bit, SHRU shifts zeros in
// and is read back signed. PUSH8 sign-extends, EXIT exits with the low
// byte, a trap keeps the output written before it and writes nothing
// itself, a PRINT that would pass the output limit writes none of its
// bytes, falling off the end or jumping outside the program traps 9,
// and IN past the end of the input keeps returning -1.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Per-opcode [immediate bytes, pops, pushes]; immediate 255 = no such opcode.
const IMM = new Uint8Array(256).fill(255), POPS = new Uint8Array(256), PUSH = new Uint8Array(256);
const set = (o, i, p, q) => { IMM[o] = i; POPS[o] = p; PUSH[o] = q; };
for (let o = 0x10; o <= 0x22; o++) if (o !== 0x17 && o !== 0x1b) set(o, 0, 2, 1); // binary ops
set(0x00, 0, 0, 0); set(0x01, 1, 0, 1); set(0x02, 4, 0, 1); set(0x03, 0, 1, 0);
set(0x04, 0, 1, 2); set(0x05, 0, 2, 2); set(0x06, 0, 2, 3); set(0x07, 0, 3, 3);
set(0x17, 0, 1, 1); set(0x1b, 0, 1, 1); set(0x30, 2, 0, 0); set(0x31, 2, 1, 0);
set(0x32, 2, 1, 0); set(0x33, 2, 0, 0); set(0x34, 0, 0, 0); set(0x40, 0, 1, 1);
set(0x41, 0, 2, 0); set(0x50, 0, 1, 0); set(0x51, 0, 1, 0); set(0x52, 0, 0, 1);
set(0x53, 0, 1, 0);

function run(p, inp) {
  const n = p.length, D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, cp = 0, ol = 0, ip = 0, pc = 0, steps = 0;
  const end = (code) => ({ out: out.slice(0, ol), code });
  for (;;) {
    if (steps === 1e6) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = p[pc], imm = IMM[op];
    if (imm === 255) return end(5);
    if (pc + imm >= n) return end(9);
    steps++;
    const nx = pc + 1 + imm;
    if (sp < POPS[op]) return end(2);
    if (sp - POPS[op] + PUSH[op] > 256) return end(3);
    pc = nx;
    switch (op) {
      case 0x00: return end(0);
      case 0x01: D[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 0x02: D[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = D[sp - 1], a = D[sp - 2];
        let r;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (b === 0) return end(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (op === 0x14) { if (b === 0) return end(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (op === 0x15) { if (b === 0) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (b === 0) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) { const v = D[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cp === 64) return end(7);
        C[cp++] = nx; pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return end(8);
        pc = C[--cp];
        break;
      case 0x40: {
        const a = D[sp - 1];
        if (a < 0 || a >= 256) return end(6);
        D[sp - 1] = M[a];
        break;
      }
      case 0x41: {
        const a = D[sp - 1], v = D[sp - 2];
        if (a < 0 || a >= 256) return end(6);
        sp -= 2; M[a] = v;
        break;
      }
      case 0x50: {
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return end(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return end(11);
        out[ol++] = D[--sp] & 255;
        break;
      case 0x52: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: return end(D[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(readFileSync(join(I, id, 'program.bin')), readFileSync(join(I, id, 'input.bin')));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), r.code + '\n');
}
