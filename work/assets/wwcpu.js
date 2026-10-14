// wwcpu.js — the SAP-1+ CPU, ported from the verified Python netlist.
// Same two primitives (NAND + DFF); AND/OR/XOR/MUX derived from NAND; one flat
// synchronous netlist. Runs live in the browser. (Node-testable: see bottom.)

class Circuit {
  constructor() {
    this.vals = []; this.nands = []; this.dffs = []; this._n = 0;
    this.GND = this.net(0); this.VCC = this.net(1);
  }
  net(init = 0) { const i = this._n++; this.vals[i] = init; return i; }
  bus(w, init = 0) { const b = []; for (let k = 0; k < w; k++) b.push(this.net((init >> k) & 1)); return b; }
  nand(a, b) { const o = this.net(); this.nands.push([o, a, b]); return o; }
  dff(d, en = null, clr = null, init = 0) { const q = this.net(init); this.dffs.push({ q, d, en, clr, init }); return q; }
  not_(a) { return this.nand(a, a); }
  and_(a, b) { return this.not_(this.nand(a, b)); }
  or_(a, b) { return this.nand(this.not_(a), this.not_(b)); }
  xor_(a, b) { const n = this.nand(a, b); return this.nand(this.nand(a, n), this.nand(n, b)); }
  andList(xs) { if (!xs.length) return this.VCC; let a = xs[0]; for (let i = 1; i < xs.length; i++) a = this.and_(a, xs[i]); return a; }
  orList(xs) { if (!xs.length) return this.GND; let a = xs[0]; for (let i = 1; i < xs.length; i++) a = this.or_(a, xs[i]); return a; }
  mux2(sel, a, b) { const ns = this.not_(sel); return this.or_(this.and_(ns, a), this.and_(sel, b)); }
  settle() {
    const v = this.vals; v[this.GND] = 0; v[this.VCC] = 1;
    const cap = this.nands.length + 5;
    for (let it = 0; it < cap; it++) {
      let changed = false;
      for (const [o, a, b] of this.nands) { const nv = (v[a] && v[b]) ? 0 : 1; if (v[o] !== nv) { v[o] = nv; changed = true; } }
      if (!changed) return;
    }
    throw new Error("combinational failed to settle");
  }
  tick() {
    this.settle(); const v = this.vals; const nxt = [];
    for (const ff of this.dffs) {
      let nv;
      if (ff.clr !== null && v[ff.clr]) nv = 0;
      else if (ff.en !== null && !v[ff.en]) nv = v[ff.q];
      else nv = v[ff.d];
      nxt.push([ff.q, nv]);
    }
    for (const [q, nv] of nxt) v[q] = nv;
    this.settle();
  }
  get(n) { return this.vals[n]; }
  getbus(b) { let s = 0; for (let k = 0; k < b.length; k++) s |= (this.vals[b[k]] & 1) << k; return s; }
  setbus(b, val) { for (let k = 0; k < b.length; k++) this.vals[b[k]] = (val >> k) & 1; }
  dffsByQ(q) { for (const ff of this.dffs) if (ff.q === q) return ff; throw new Error("no dff " + q); }
}

// ---- datapath helpers ----
function fullAdder(c, a, b, cin) {
  const s1 = c.xor_(a, b), s = c.xor_(s1, cin);
  const cout = c.or_(c.and_(a, b), c.and_(s1, cin));
  return [s, cout];
}
function addSub(c, A, B, sub) {
  const n = Math.max(A.length, B.length); let carry = sub; const S = [];
  for (let k = 0; k < n; k++) {
    const a = k < A.length ? A[k] : c.GND;
    let b = k < B.length ? B[k] : c.GND;
    b = c.xor_(b, sub);
    const [s, co] = fullAdder(c, a, b, carry); carry = co; S.push(s);
  }
  return [S, carry];
}
function decoder(c, sel) {
  const n = sel.length, inv = sel.map(s => c.not_(s)), lines = [];
  for (let i = 0; i < (1 << n); i++) {
    const terms = []; for (let k = 0; k < n; k++) terms.push(((i >> k) & 1) ? sel[k] : inv[k]);
    lines.push(c.andList(terms));
  }
  return lines;
}
function muxOnehot(c, selects, buses) {
  const width = buses[0].length, out = [];
  for (let bit = 0; bit < width; bit++) {
    const terms = []; for (let i = 0; i < buses.length; i++) terms.push(c.and_(selects[i], buses[i][bit]));
    out.push(c.orList(terms));
  }
  return out;
}

// opcodes
const OP = { NOP: 0, LDA: 1, ADD: 2, SUB: 3, STA: 4, LDI: 5, JMP: 6, JZ: 7, JC: 8, OUT: 0xE, HLT: 0xF };
const MNEM = { 0: "NOP", 1: "LDA", 2: "ADD", 3: "SUB", 4: "STA", 5: "LDI", 6: "JMP", 7: "JZ", 8: "JC", 0xE: "OUT", 0xF: "HLT" };

class SAP1 {
  constructor(program) {
    const c = this.c = new Circuit();
    const W = 8, AW = 4; this.W = W; this.AW = AW;
    const prog = (program || []).slice(); while (prog.length < 16) prog.push(0); this.prog = prog;
    const raw = (init = 0) => c.dff(c.GND, c.GND, null, init);
    this.PC = []; for (let k = 0; k < AW; k++) this.PC.push(raw());
    this.MAR = []; for (let k = 0; k < AW; k++) this.MAR.push(raw());
    this.IR = []; for (let k = 0; k < W; k++) this.IR.push(raw());
    this.A = []; for (let k = 0; k < W; k++) this.A.push(raw());
    this.B = []; for (let k = 0; k < W; k++) this.B.push(raw());
    this.O = []; for (let k = 0; k < W; k++) this.O.push(raw());
    this.carry = raw();
    this.RAM = []; for (let w = 0; w < 16; w++) { const row = []; for (let b = 0; b < W; b++) row.push(raw((prog[w] >> b) & 1)); this.RAM.push(row); }
    this.T = []; for (let i = 0; i < 6; i++) this.T.push(raw(i === 0 ? 1 : 0));

    const [t1, t2, t3, t4, t5, t6] = this.T;
    const op = decoder(c, this.IR.slice(4, 8));
    const Z = c.not_(c.orList(this.A));
    const Cf = this.carry;
    const anyof = (...ops) => c.orList(ops.map(o => op[o]));
    const usesAddr = anyof(OP.LDA, OP.ADD, OP.SUB, OP.STA);
    const addsub = anyof(OP.ADD, OP.SUB);
    const jz_taken = c.and_(op[OP.JZ], Z);
    const jc_taken = c.and_(op[OP.JC], Cf);
    const A_ = (a, b) => c.and_(a, b), O_ = xs => c.orList(xs);

    const Ep = t1, Cp = t2, Li = t3;
    const Lm = O_([t1, A_(t4, usesAddr)]);
    const CE = O_([t3, A_(t5, addsub), A_(t5, op[OP.LDA])]);
    const Ei = O_([A_(t4, usesAddr), A_(t4, op[OP.LDI]), A_(t4, op[OP.JMP]), A_(t4, jz_taken), A_(t4, jc_taken)]);
    const La = O_([A_(t5, op[OP.LDA]), A_(t6, addsub), A_(t4, op[OP.LDI])]);
    const Lb = A_(t5, addsub);
    const Eu = A_(t6, addsub);
    const Su = A_(t6, op[OP.SUB]);
    const Ea = O_([A_(t5, op[OP.STA]), A_(t4, op[OP.OUT])]);
    const Wr = A_(t5, op[OP.STA]);
    const Lo = A_(t4, op[OP.OUT]);
    const Jl = O_([A_(t4, op[OP.JMP]), A_(t4, jz_taken), A_(t4, jc_taken)]);
    const Hlt = A_(t4, op[OP.HLT]);
    this.Hlt = Hlt;
    this.sig = { Ep, Cp, Lm, CE, Li, Ei, La, Lb, Eu, Su, Ea, Wr, Lo, Jl, Hlt };

    const sel = decoder(c, this.MAR);
    const ram_rd = muxOnehot(c, sel, this.RAM);
    const [alu, alu_c] = addSub(c, this.A, this.B, Su);
    const pc_ext = this.PC.concat(Array(W - AW).fill(c.GND));
    const iraddr = this.IR.slice(0, AW).concat(Array(W - AW).fill(c.GND));
    const bus = muxOnehot(c, [Ep, CE, Ei, Ea, Eu], [pc_ext, ram_rd, iraddr, this.A, alu]);
    this.bus = bus;
    const [inc] = addSub(c, this.PC, [c.VCC].concat(Array(AW - 1).fill(c.GND)), c.GND);

    const wire = (q, d, en) => { const ff = c.dffsByQ(q); ff.d = d; ff.en = en; };
    for (let k = 0; k < AW; k++) {
      wire(this.MAR[k], bus[k], Lm);
      const nxt = c.mux2(Jl, inc[k], bus[k]);
      wire(this.PC[k], c.mux2(c.or_(Cp, Jl), this.PC[k], nxt), c.VCC);
    }
    for (let k = 0; k < W; k++) {
      wire(this.IR[k], bus[k], Li);
      wire(this.A[k], bus[k], La);
      wire(this.B[k], bus[k], Lb);
      wire(this.O[k], bus[k], Lo);
    }
    wire(this.carry, alu_c, Eu);
    for (let w = 0; w < 16; w++) { const wen = c.and_(Wr, sel[w]); for (let b = 0; b < W; b++) wire(this.RAM[w][b], bus[b], wen); }
    for (let i = 0; i < 6; i++) wire(this.T[i], this.T[(i + 5) % 6], c.VCC);
    c.settle();
  }
  tstate() { for (let i = 0; i < 6; i++) if (this.c.get(this.T[i])) return i + 1; return 0; }
  ramImage() { return this.RAM.map(r => this.c.getbus(r)); }
  activeSignals() { return Object.keys(this.sig).filter(k => this.c.get(this.sig[k])); }
  snapshot() {
    const g = this.c;
    return {
      T: this.tstate(), PC: g.getbus(this.PC), MAR: g.getbus(this.MAR),
      IR: g.getbus(this.IR), op: g.getbus(this.IR.slice(4, 8)),
      A: g.getbus(this.A), B: g.getbus(this.B), OUT: g.getbus(this.O),
      C: g.get(this.carry), bus: g.getbus(this.bus), halt: g.get(this.Hlt),
      sigs: this.activeSignals(), ram: this.ramImage()
    };
  }
  step() { this.c.tick(); }        // advance one clock (one micro-step)
}

// ---- assembler (mirrors asm.py) ----
const NO_OPERAND = new Set([OP.NOP, OP.OUT, OP.HLT]);
function assemble(src) {
  const labels = {}; const lines = []; let addr = 0;
  for (let raw of src.replace(/\r/g, "").split("\n")) {
    let line = raw.split(";")[0].trim(); if (!line) continue;
    if (line.endsWith(":")) { labels[line.slice(0, -1).trim()] = addr; continue; }
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (m) { labels[m[1]] = addr; line = m[2].trim(); if (!line) continue; }
    lines.push([addr, line]); addr++;
  }
  const image = Array(16).fill(0);
  for (const [a, line] of lines) {
    const parts = line.split(/\s+/); const mn = parts[0].toUpperCase();
    if (mn === "DB") { image[a] = (parseInt(parts[1], parts[1].startsWith("0x") ? 16 : 10)) & 0xFF; continue; }
    if (!(mn in OP)) throw new Error("unknown mnemonic " + mn);
    const op = OP[mn]; let operand = 0;
    if (!NO_OPERAND.has(op)) { const tok = parts[1]; operand = (tok in labels) ? labels[tok] : parseInt(tok, tok && tok.startsWith("0x") ? 16 : 10); }
    image[a] = ((op & 0xF) << 4) | (operand & 0xF);
  }
  return { image, labels };
}

if (typeof module !== "undefined" && module.exports) module.exports = { Circuit, SAP1, assemble, OP, MNEM };
