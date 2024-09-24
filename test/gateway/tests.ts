import { Contract } from 'ethers';
import { expect, test } from 'bun:test';

const opts = { enableCcipRead: true };

// imo better to expect(await) than expect().resolves
export function runSlotDataTests(reader: Contract, pointer = false) {
  test('latest = 49', async () => {
    expect(await reader.readLatest(opts)).toEqual(49n);
  });
  test.skipIf(!pointer)('pointer => latest = 49', async () => {
    expect(await reader.readLatestViaPointer(opts)).toEqual(49n);
  });
  test('name = "Satoshi"', async () => {
    expect(await reader.readName(opts)).toEqual('Satoshi');
  });
  test('highscores[0] = 1', async () => {
    expect(await reader.readHighscore(0, opts)).toEqual(1n);
  });
  test('highscores[latest] = 12345', async () => {
    expect(await reader.readLatestHighscore(opts)).toEqual(12345n);
  });
  test('highscorers[latest] = name', async () => {
    expect(await reader.readLatestHighscorer(opts)).toEqual('Satoshi');
  });
  test('realnames["Money Skeleton"] = "Vitalik Buterin"', async () => {
    expect(await reader.readRealName('Money Skeleton', opts)).toEqual(
      'Vitalik Buterin'
    );
  });
  test('realnames[highscorers[latest]] = "Hal Finney"', async () => {
    expect(await reader.readLatestHighscorerRealName(opts)).toEqual(
      'Hal Finney'
    );
  });
  test.skipIf(!!process.env.IS_CI)('zero = 0', async () => {
    expect(await reader.readZero(opts)).toEqual(0n);
  });
  test('root.str = "raffy"', async () => {
    expect(await reader.readRootStr([], opts)).toEqual('raffy');
  });
  test('root.map["a"].str = "chonk"', async () => {
    expect(await reader.readRootStr(['a'], opts)).toEqual('chonk');
  });
  test('root.map["a"].map["b"].str = "eth"', async () => {
    expect(await reader.readRootStr(['a', 'b'], opts)).toEqual('eth');
  });
  test('highscorers[keccak(...)] = "chonk"', async () => {
    expect(await reader.readSlicedKeccak(opts)).toEqual('chonk');
  });
}
