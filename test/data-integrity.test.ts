import { describe, expect, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
	DATA_DIR,
	DateRangeEntry,
	EasterEntry,
	ExactDateEntry,
	ExactDateWithYearEntry,
	IntervalEntry,
	OneTimeEntry,
	RelativeDateEntry,
	getEntries,
	parseCSVLine
} from '../src/index';

/**
 * Every CSV under the data directory, as a data-relative forward-slash path.
 * @param dir - Directory to walk
 * @returns Sorted relative paths
 */
function listCsvFiles(dir: string = DATA_DIR): string[] {
	const found: string[] = [];
	for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, item.name);
		if (item.isDirectory()) found.push(...listCsvFiles(full));
		else if (item.name.endsWith('.csv')) {
			found.push(path.relative(DATA_DIR, full).split(path.sep).join('/'));
		}
	}
	return found.sort();
}

const CSV_FILES = listCsvFiles();

/**
 * Reads the non-comment, non-blank lines of a data file.
 * @param relative - Data-relative path
 * @returns The data lines, with their 1-based line numbers
 */
function dataLines(relative: string): Array<{ line: string; number: number }> {
	return fs
		.readFileSync(path.join(DATA_DIR, relative), 'utf-8')
		.split('\n')
		.map((line, index) => ({ line, number: index + 1 }))
		.filter(({ line }) => line.trim() !== '' && !line.startsWith('#'));
}

describe('Data Integrity', () => {
	test('the data directory is discoverable and non-trivial', () => {
		expect(fs.existsSync(DATA_DIR)).toBe(true);
		expect(CSV_FILES.length).toBeGreaterThan(30);
	});

	describe.each(CSV_FILES)('%s', (relative) => {
		const lines = dataLines(relative);

		test('every line parses into an entry', () => {
			const failures = lines
				.filter(({ line }) => parseCSVLine(line) === null)
				.map(({ line, number }) => `${relative}:${number} ${line}`);
			expect(failures).toEqual([]);
		});

		test('has no blank or whitespace-only lines in the body', () => {
			const raw = fs.readFileSync(path.join(DATA_DIR, relative), 'utf-8');
			const body = raw.replace(/\n$/, '');
			const blanks = body
				.split('\n')
				.map((line, index) => ({ line, number: index + 1 }))
				.filter(({ line }) => line.trim() === '')
				.map(({ number }) => `${relative}:${number}`);
			expect(blanks).toEqual([]);
		});

		test('ends with exactly one trailing newline', () => {
			const raw = fs.readFileSync(path.join(DATA_DIR, relative), 'utf-8');
			expect(raw.endsWith('\n')).toBe(true);
			expect(raw.endsWith('\n\n')).toBe(false);
		});

		test('has no carriage returns or byte order marks', () => {
			const raw = fs.readFileSync(path.join(DATA_DIR, relative), 'utf-8');
			expect(raw).not.toContain('\r');
			expect(raw).not.toContain('\uFEFF');
		});

		test('has no duplicate entry names', () => {
			const names = lines.map(({ line }) => parseCSVLine(line)?.name).filter(Boolean);
			const seen = new Set<string>();
			const duplicates = new Set<string>();
			for (const name of names) {
				if (seen.has(name as string)) duplicates.add(name as string);
				seen.add(name as string);
			}
			expect([...duplicates]).toEqual([]);
		});

		test('has no untrimmed entry names', () => {
			const untrimmed = lines
				.map(({ line, number }) => ({ name: parseCSVLine(line)?.name, number }))
				.filter(({ name }) => name !== undefined && name !== name.trim())
				.map(({ number }) => `${relative}:${number}`);
			expect(untrimmed).toEqual([]);
		});

		test('records its source path on every entry', () => {
			const entries = getEntries(path.join(DATA_DIR, relative));
			expect(entries.length).toBe(lines.length);
			expect(entries.every((entry) => entry.source === relative)).toBe(true);
		});
	});
});

describe('Data Plausibility', () => {
	const allEntries = CSV_FILES.flatMap((relative) => getEntries(path.join(DATA_DIR, relative)));

	test('no dated historical entry claims a future year', () => {
		// birthdays and anniversaries are things that already happened
		const currentYear = new Date().getFullYear();
		const future = allEntries
			.filter((entry): entry is ExactDateWithYearEntry => entry instanceof ExactDateWithYearEntry)
			.filter((entry) => entry.year > currentYear)
			.map((entry) => `${entry.source} ${entry.name} (${entry.year})`);
		expect(future).toEqual([]);
	});

	test('no dated historical entry predates recorded antiquity', () => {
		// negative years are legitimate: Japan's National Foundation Day is dated
		// to 660 BC by tradition and is an official public holiday
		const ancient = allEntries
			.filter((entry): entry is ExactDateWithYearEntry => entry instanceof ExactDateWithYearEntry)
			.filter((entry) => entry.year < -3000)
			.map((entry) => `${entry.source} ${entry.name} (${entry.year})`);
		expect(ancient).toEqual([]);
	});

	test('every month/day pair is a real calendar date', () => {
		const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
		const invalid = allEntries
			.filter(
				(entry): entry is ExactDateEntry | ExactDateWithYearEntry | OneTimeEntry =>
					entry instanceof ExactDateEntry ||
					entry instanceof ExactDateWithYearEntry ||
					entry instanceof OneTimeEntry
			)
			.filter((entry) => entry.day > (maxDay[entry.month - 1] as number))
			.map((entry) => `${entry.source} ${entry.name}`);
		expect(invalid).toEqual([]);
	});

	test('every relative entry resolves to a real date within ten years', () => {
		const unresolvable = allEntries
			.filter((entry): entry is RelativeDateEntry => entry instanceof RelativeDateEntry)
			.filter((entry) => entry.getNextOccurrence(new Date(2026, 0, 1)).getFullYear() > 2036)
			.map((entry) => `${entry.source} ${entry.name}`);
		expect(unresolvable).toEqual([]);
	});

	test('every interval entry has a positive, finite period', () => {
		const bad = allEntries
			.filter((entry): entry is IntervalEntry => entry instanceof IntervalEntry)
			.filter((entry) => !Number.isFinite(entry.intervalDays) || entry.intervalDays <= 0)
			.map((entry) => `${entry.source} ${entry.name}`);
		expect(bad).toEqual([]);
	});

	test('every range entry spans less than a full year', () => {
		const bad = allEntries
			.filter((entry): entry is DateRangeEntry => entry instanceof DateRangeEntry)
			.filter((entry) => {
				const { start, end } = entry.getRangeFor(2026);
				const days = (end.getTime() - start.getTime()) / 86_400_000;
				return days < 0 || days > 364;
			})
			.map((entry) => `${entry.source} ${entry.name}`);
		expect(bad).toEqual([]);
	});

	test('every Easter offset stays inside a plausible liturgical window', () => {
		const bad = allEntries
			.filter((entry): entry is EasterEntry => entry instanceof EasterEntry)
			.filter((entry) => entry.offsetDays < -80 || entry.offsetDays > 80)
			.map((entry) => `${entry.source} ${entry.name} (${entry.offsetDays})`);
		expect(bad).toEqual([]);
	});
});

describe('Data Conventions', () => {
	test('birthday files name every entry as a birthday', () => {
		const offenders = CSV_FILES.filter((file) => file.startsWith('birthdays/'))
			.flatMap((file) => getEntries(path.join(DATA_DIR, file)))
			.filter((entry) => !/(?:'s|') Birthday$/.test(entry.name))
			.map((entry) => `${entry.source} ${entry.name}`);
		expect(offenders).toEqual([]);
	});

	test('birthday entries all carry a year', () => {
		const offenders = CSV_FILES.filter((file) => file.startsWith('birthdays/'))
			.flatMap((file) => getEntries(path.join(DATA_DIR, file)))
			.filter((entry) => !(entry instanceof ExactDateWithYearEntry))
			.map((entry) => `${entry.source} ${entry.name}`);
		expect(offenders).toEqual([]);
	});

	test('cosmic season entries are one-time dated events', () => {
		const entries = getEntries(path.join(DATA_DIR, 'cosmic/seasons.csv'));
		expect(entries.length).toBeGreaterThan(50);
		expect(entries.every((entry) => entry instanceof OneTimeEntry)).toBe(true);
	});

	test('cosmic eclipse entries are one-time dated events in the future range', () => {
		const entries = getEntries(path.join(DATA_DIR, 'cosmic/eclipses.csv'));
		expect(entries.length).toBeGreaterThan(50);
		expect(
			entries.every(
				(entry) => entry instanceof OneTimeEntry && entry.year >= 2026 && entry.year <= 2040
			)
		).toBe(true);
	});

	test('the zodiac covers all twelve signs and every day of the year', () => {
		const signs = getEntries(path.join(DATA_DIR, 'cosmic/zodiac.csv'));
		expect(signs).toHaveLength(12);
		expect(signs.every((entry) => entry instanceof DateRangeEntry)).toBe(true);

		// walk a full non-leap year; exactly one sign must own each day
		const cursor = new Date(2026, 0, 1);
		while (cursor.getFullYear() === 2026) {
			const matching = signs.filter((sign) => sign.occursOn(cursor));
			expect({
				date: cursor.toDateString(),
				count: matching.length
			}).toEqual({ date: cursor.toDateString(), count: 1 });
			cursor.setDate(cursor.getDate() + 1);
		}
	});
});
