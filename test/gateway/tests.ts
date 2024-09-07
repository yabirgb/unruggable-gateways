import { Contract } from 'ethers';
import { expect, test } from 'bun:test';

export function runSlotDataTests(reader: Contract) {
  test('latest = 49', async () => {
    expect(await reader.readLatest({ enableCcipRead: true })).toStrictEqual(
      49n
    );
  });
  test('name = "Satoshi"', async () => {
    expect(await reader.readName({ enableCcipRead: true })).toStrictEqual(
      'Satoshi'
    );
  });
  test('highscores[0] = 1', async () => {
    expect(
      await reader.readHighscore(0, { enableCcipRead: true })
    ).toStrictEqual(1n);
  });
  test('highscores[latest] = 12345', async () => {
    expect(
      await reader.readLatestHighscore({ enableCcipRead: true })
    ).toStrictEqual(12345n);
  });
  test('highscorers[latest] = name', async () => {
    expect(
      await reader.readLatestHighscorer({ enableCcipRead: true })
    ).toStrictEqual('Satoshi');
  });
  test('realnames["Money Skeleton"] = "Vitalik Buterin"', async () => {
    expect(
      await reader.readRealName('Money Skeleton', { enableCcipRead: true })
    ).toStrictEqual('Vitalik Buterin');
  });
  test('realnames[highscorers[latest]] = "Hal Finney"', async () => {
    expect(
      await reader.readLatestHighscorerRealName({ enableCcipRead: true })
    ).toStrictEqual('Hal Finney');
  });
  test.skipIf(!!process.env.IS_CI)('zero = 0', async () => {
    expect(await reader.readZero({ enableCcipRead: true })).toStrictEqual(0n);
  });
  test('root.str = "raffy"', async () => {
    expect(
      await reader.readRootStr([], { enableCcipRead: true })
    ).toStrictEqual('raffy');
  });
  test('root.map["a"].str = "chonk"', async () => {
    expect(
      await reader.readRootStr(['a'], { enableCcipRead: true })
    ).toStrictEqual('chonk');
  });
  test('root.map["a"].map["b"].str = "eth"', async () => {
    expect(
      await reader.readRootStr(['a', 'b'], { enableCcipRead: true })
    ).toStrictEqual('eth');
  });
  test('highscorers[keccak(...)] = "chonk"', async () => {
    expect(
      await reader.readSlicedKeccak({ enableCcipRead: true })
    ).toStrictEqual('chonk');
  });
}
