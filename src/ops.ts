// program ops
// the following should be equivalent to GatewayProtocol.sol
// not sure what to call this thing OPCODE? OP?
export const GATEWAY_OP = {
  DEBUG: 255, // experimental

  TARGET: 1,
  SET_OUTPUT: 2,
  EVAL_LOOP: 3,
  EVAL_INLINE: 4,

  REQ_NONZERO: 10,
  REQ_CONTRACT: 11,

  READ_SLOT: 20,
  READ_BYTES: 21,
  READ_ARRAY: 22,
  READ_HASHED: 23,
  READ_SLOTS: 24,

  SLOT: 30,
  SLOT_ADD: 31,
  SLOT_FOLLOW: 32,

  PUSH_INPUT: 40,
  PUSH_OUTPUT: 41,
  PUSH_SLOT: 42,
  PUSH_TARGET: 43,
  PUSH_VALUE: 44,
  PUSH_BYTES: 45,

  DUP: 50,
  POP: 51,
  SWAP: 52,

  KECCAK: 60,
  CONCAT: 61,
  SLICE: 62,

  PLUS: 70,
  TIMES: 71,
  DIVIDE: 72,
  MOD: 73,

  AND: 80,
  OR: 81,
  XOR: 82,
  SHIFT_LEFT: 83,
  SHIFT_RIGHT: 84,
  NOT: 85,

  NONZERO: 90,
  EQ: 91,
  LT: 92,
  GT: 93,
} as const satisfies Record<string, number>;
