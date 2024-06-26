import {ethers} from 'ethers';
import {expect, test} from 'bun:test';

export function runSlotDataTests(reader: ethers.Contract) {
	test('latest = 49', async () => {
		expect(await reader.readLatest({enableCcipRead: true})).toBe(49n);
	});
	test('name = "Satoshi"', async () => {
		expect(await reader.readName({enableCcipRead: true})).toBe('Satoshi');
	});
	test('highscores[0] = 1', async () => {
		expect(await reader.readHighscore(0, {enableCcipRead: true})).toBe(1n);
	});
	test('highscores[latest] = 12345', async () => {
		expect(await reader.readLatestHighscore({enableCcipRead: true})).toBe(12345n);
	});
	test('highscorers[latest] = name', async () => {
		expect(await reader.readLatestHighscorer({enableCcipRead: true})).toBe('Satoshi');
	});
	test('realnames["Money Skeleton"] = "Vitalik Buterin"', async () => {
		expect(await reader.readRealName('Money Skeleton', {enableCcipRead: true})).toBe('Vitalik Buterin');
	});
	test('realnames[highscorers[latest]] = "Hal Finney"', async () => {
		expect(await reader.readLatestHighscorerRealName({enableCcipRead: true})).toBe('Hal Finney');
	});
}
