# fiber
1-dimensional coreworld, playground for Artificial Life.

It's also an esotric programming environment.

I created Fiber to achieve following objectives, unlike existing Artificial Life systems.

[Web Playground Link](https://xanxys.github.io/fiber/web/index.html)

### 1. Balance of inherent and emergent complexity
Very simple (e.g. Conways's Life) system requires too elaborate structure to achieve self replication and universal construction,
and it's inconceivable to observe emergence of "innovative" evolutuion in realistic compute resource.

On the other hand, some AL systems (e.g. Tierra) has hard-coded notion of self-replicating entities, which makes it easier to observe
some low-level evolutionary phenomena (e.g. parasitism, gene transfer), but makes it denies oppurtunity to observe emergence of
replicating system.

Fiber tries to be simple enough to leave room for emergence, yet complex enough to allow manual construction (programming)
of self replicating state.

### 2. Efficient, deterministic execution
Lots of AL systems uses 2D/3D chemistry/physics and/or floating points, which makes efficient execution almost impossible.
Non-determinism arising from floating point also makes it much harder to reproduce experimental results.

Cellular-automata / core-world based systems are much better in performance aspect.
(I'm disregarding HashLife algorithm, because I believe complex multi-level systems cannot be compressed efficiently without
introducing approximations.)


## Fundamental Questions

* Is Fiber Turing-complete?
--> most likely yes

* Is there a non-trivial self-replicator in Fiber? --> probably, trying to construct one
  * known smallest trivial replicator is 2-cell, `mov +3, +1; mov +1, -1;`

* Is Fiber capable of open-ended evolution?

## "Easy" Questions to Understand Fiber Programming
Assume Fiber-1M where most cells are 0-filled initially, and only first K (<1000 or so) cells are "programmable".

Q1. Create an initial state that eventually copies value (non-executable) of cell 0, to cell 500*1000.

Q2. Extennsion of Q1: Instead of cell 0, copy cell 0...cell A-1 to cell 500\*1000...500\*1000+A-1.

Q3. Prove Turing-completeness; Come up with a mapping function (input: brainfuck program, output: finite initial state) that interprets the program.

Q4. Is Q3 possible when input mapping is much more limited? (e.g. 0-delimited raw branfuck code ++ interpreter state)?

Q5. Come up with a self-repairing boundary system that allows "entities" like in Q1~Q4 can co-exist.


## Fiber Spec

Fiber is a model of Artificial Life (AL), consisting of finite number of cells, discrete timesteps, and deterministic update rule.
Update rule is based on RISC-like instructions, but with very limited memory access capability, to enforce locality.

Fiber-N consists of N cells in cyclic 1-dimensional topology, and each cell holds 2 bytes of information.

```
... | cell 0 | cell 1 | cell 2 | ... | cell N - 1 | cell 0 | cell 1 | ...
```

Within each timestep, all cells are sequentially scanned, starting from cell 0.

* Timestep 0
  * Execute cell 0's instruction (if it's executable)
  * Execute cell 1's instruction
  * ...
  * Execute cell N-1's instruction
* Timestep 1
  * ...

### Instruction Set
Each cell holds 16 bit, and it's either executable (`exec` bit is 1) or non-executable (`exec` bit is 0).
```
MSB                                     LSB
| exec (1) | inst (3) | op1 (6) | op2 (6) |
```
`inst` bits specifies one of 8 instructions, and 2 operands (`op1` and `op2`) are memory addresses relative to current cell.

| inst | mnemonic | definition |
----|----|----
| 0 | mov op1, op2 | `cell[op1] := cell[op2]` |
| 1 | add op1, op2 | `cell[op1] := (cell[op1] + cell[op2]) & 0xffff` |
| 2 | cshl op1, op2 (cyclic shift left)| `v := cell[op1] << (cell[op2] % 16); cell[op1] = (v & 0xffff) \| (v >> 16)` |
| 3 | or op1, op2 | `cell[op1] := cell[op1] \| cell[op2]` |
| 4 | and op1, op2 | `cell[op1] := cell[op1] & cell[op2]` |
| 5 | ssub op1, op2 (saturating sub) | `cell[op1] := max(0, cell[op1] - cell[op2])` |
| 6 | ld op1, op2 | `cell[op1] := cell[cell[op2] & 0x3f]` |
| 7 | st op1, op2 | `cell[cell[op2] & 0x3f] := cell[op1]`|

Address is 6-bit value, which is interpreted as relative address from -32 ~ +32 (excluding 0).
```
MSB                  LSB
| neg (1) | value (5) |
```

Relative address is negative iff `neg` is 1, and `value` is interpreted as 1-origin 5-bit unsigned integer.

Examples
* 0x00 (neg=0, value=0): (executing cell)+1
* 0x30 (neg=1, value=1): (executing cell)-1
* 0x1f (neg=0, value=31): (executing cell)+32 (maximum)
* 0x3f (neg=1, value=31): (executing cell)-32 (minimum)


### Data Locality and Parallel Implementation
It follows from the instruction set (especially the addressing system), that execution of `cell A...cell B` (both inclusive)
can only reference and affect state of `cell A-32...cell B+32`.

Implementations can exploit the data locality to parallelize execution.
This implies a single timestep of a Fiber-N world can be executed in a constant time regardless of N, given enough compute resource.

###
