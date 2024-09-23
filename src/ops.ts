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

  READ_SLOTS: 20,
  READ_BYTES: 21,
  READ_ARRAY: 22,
  READ_HASHED: 23,

  SLOT_ZERO: 30, // deprecated
  SLOT_ADD: 31,
  SLOT_FOLLOW: 32,
  SLOT: 33,

  PUSH_INPUT: 40,
  PUSH_OUTPUT: 41,
  PUSH_SLOT: 42,
  PUSH_TARGET: 43,
  PUSH_BYTE: 44,

  DUP: 50,
  POP: 51,
  SWAP: 52,

  KECCAK: 60,
  CONCAT: 61,
  SLICE: 62,
  PLUS: 63,
  TIMES: 64,
  DIVIDE: 65,
  AND: 66,
  OR: 67,
  NOT: 68,
  SHIFT_LEFT: 69,
  SHIFT_RIGHT: 70,
} as const satisfies Record<string, number>;
