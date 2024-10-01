// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

uint8 constant STOP_ON_SUCCESS = 1;
uint8 constant STOP_ON_FAILURE = 2;
uint8 constant ACQUIRE_STATE = 4;

uint8 constant OP_DEBUG = 255;
uint8 constant OP_TARGET = 1;
uint8 constant OP_SET_OUTPUT = 2;
uint8 constant OP_EVAL_LOOP = 3;
uint8 constant OP_EVAL_INLINE = 4;

uint8 constant OP_REQ_NONZERO = 10;
uint8 constant OP_REQ_CONTRACT = 11;

uint8 constant OP_READ_SLOT = 20;
uint8 constant OP_READ_BYTES = 21;
uint8 constant OP_READ_ARRAY = 22;
uint8 constant OP_READ_HASHED = 23;
uint8 constant OP_READ_SLOTS = 24;

uint8 constant OP_SLOT = 30;
uint8 constant OP_SLOT_ADD = 31;
uint8 constant OP_SLOT_FOLLOW = 32;

uint8 constant OP_PUSH_INPUT = 40;
uint8 constant OP_PUSH_OUTPUT = 41;
uint8 constant OP_PUSH_VALUE = 44;
uint8 constant OP_PUSH_BYTES = 45;
uint8 constant OP_PUSH_0 = 46;

uint8 constant OP_PUSH_SLOT = 42;
uint8 constant OP_PUSH_TARGET = 43;
uint8 constant OP_PUSH_STACK_SIZE = 47;

uint8 constant OP_DUP = 50;
uint8 constant OP_POP = 51;
uint8 constant OP_SWAP = 52;

uint8 constant OP_KECCAK = 60;
uint8 constant OP_CONCAT = 61;
uint8 constant OP_SLICE	= 62;
uint8 constant OP_LENGTH = 63;

uint8 constant OP_PLUS = 70;
uint8 constant OP_TIMES = 71;
uint8 constant OP_DIVIDE = 72;
uint8 constant OP_MOD = 73;

uint8 constant OP_AND = 80;
uint8 constant OP_OR = 81;
uint8 constant OP_XOR = 82;
uint8 constant OP_SHIFT_LEFT = 83;
uint8 constant OP_SHIFT_RIGHT = 84;
uint8 constant OP_NOT = 85;

uint8 constant OP_NONZERO = 90;
uint8 constant OP_EQ = 91;
uint8 constant OP_LT = 92;
uint8 constant OP_GT = 93;
// uint8 constant OP_MIN = 94;
// uint8 constant OP_MAX = 95;

uint8 constant EXIT_NOT_A_CONTRACT = 254;
uint8 constant EXIT_NOT_NONZERO = 253;

struct GatewayRequest {
	bytes ops;
	bytes[] inputs;
}
