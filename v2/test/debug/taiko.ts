import { createProvider, } from '../providers.js';
import { ethers } from 'ethers';

const provider = createProvider(1);

const SlotA = `tuple(
  uint64 genesisHeight,
  uint64 genesisTimestamp,
  uint64 lastSyncedBlockId,
  uint64 lastSynecdAt
)`;
const SlotB = `tuple(
  uint64 numBlocks,
  uint64 lastVerifiedBlockId,
  bool provingPaused,
  uint8 __reservedB1,
  uint16 __reservedB2,
  uint32 __reservedB3,
  uint64 lastUnpausedAt
)`;
const TaikoL1 = new ethers.Contract('0x06a9Ab27c7e2255df1815E6CC0168d7755Feb19a', [
  `event StateVariablesUpdated(${SlotB} slotB)`,
  `function state() external view returns (tuple(bytes32 __reserved, ${SlotA} slotA, ${SlotB} slotB))`,
  'function getLastSyncedBlock() view returns (uint64 blockId, bytes32 blockHash, bytes32 stateRoot)',
  'function getLastVerifiedBlock() view returns (uint64 blockId, bytes32 blockHash, bytes32 stateRoot)',
  `function getConfig() view returns (tuple(
    uint64 chainId,
    uint64 blockMaxProposals,
    uint64 blockRingBufferSize,
    uint64 maxBlocksToVerify,
    uint32 blockMaxGasLimit,
    uint96 livenessBond,
    uint8 stateRootSyncInternal,
    bool checkEOAForCalldataDA
  ))`,
], provider);

async function fetchLatestCommitIndexFromLogs() {
  const event = TaikoL1.interface.getEvent('StateVariablesUpdated')!; // safe
  const filter = {
    //address: this.TaikoL1.target,
    topics: [event.topicHash],
  };
  while (true) {
    const logs = await provider.getLogs(filter);
    if (!logs.length) {
      // 20240714: infura bug? randomly returns no results
      console.log(`[BUG] empty getLogs()`, filter);
      await new Promise(f => setTimeout(f, 1000));
      continue;
    }
    const log = TaikoL1.interface.parseLog(logs[0])!; // safe
    return Number(log.args.slotB.numBlocks); // args[0][0]
  }
}

if (true) {
  console.log(await TaikoL1.state().then(r => r.toObject()));
  // {
  // 	__reserved: "0x0000000000000000000000000000000000000000000000000000000000000000",
  // 	slotA: [ 19923613n, 1716358991n, 165311n, 1720978607n ],
  // 	slotB: [ 168919n, 165318n, false, 0n, 0n, 0n, 1716571955n ],
  // }
}

if (true) {
  console.log(await TaikoL1.getConfig().then(r => r.toObject()));
  // {
  // 	chainId: 167000n,
  // 	blockMaxProposals: 324000n,
  // 	blockRingBufferSize: 360000n,
  // 	maxBlocksToVerify: 16n,
  // 	blockMaxGasLimit: 240000000n,
  // 	livenessBond: 125000000000000000000n,
  // 	stateRootSyncInternal: 16n,
  // 	checkEOAForCalldataDA: true,
  // }
}

// console.log(await fetchLatestCommitIndexFromLogs());
