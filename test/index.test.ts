import { describe, expect, test } from '@jest/globals';
import {
	ExactDateEntry,
	ExactDateWithYearEntry,
	RelativeDateEntry,
	getAllEntries,
	getEntries,
	getEntriesByType,
	getEntriesInNextDays,
	getEntriesInNextMonths,
	getEntriesInNextWeeks,
	getEntriesInNextYears,
	getEntriesOnDate,
	getEntriesOnMonthDay,
	parseCSVLine
} from '../src/index';

describe('Entry Classes', () => {
	describe('ExactDateEntry', () => {
		test('should create an exact date entry', () => {
			const entry = new ExactDateEntry('New Year', 1, 1);
			expect(entry.name).toBe('New Year');
			expect(entry.month).toBe(1);
			expect(entry.day).toBe(1);
		});

		test('should get next occurrence correctly', () => {
			const entry = new ExactDateEntry("New Year's Day", 1, 1);
			const fromDate = new Date(2026, 0, 15); // Jan 15, 2026
			const next = entry.getNextOccurrence(fromDate);
			expect(next.getFullYear()).toBe(2027);
			expect(next.getMonth()).toBe(0);
			expect(next.getDate()).toBe(1);
		});

		test('should detect occurrence on specific date', () => {
			const entry = new ExactDateEntry('Pi Day', 3, 14);
			expect(entry.occursOn(new Date(2026, 2, 14))).toBe(true);
			expect(entry.occursOn(new Date(2026, 2, 15))).toBe(false);
		});

		test('should get occurrences in range', () => {
			const entry = new ExactDateEntry('Pi Day', 3, 14);
			const startDate = new Date(2024, 0, 1);
			const endDate = new Date(2026, 11, 31);
			const occurrences = entry.getOccurrencesInRange(startDate, endDate);
			expect(occurrences).toHaveLength(3); // 2024, 2025, 2026
		});
	});

	describe('ExactDateWithYearEntry', () => {
		test('should create an exact date with year entry', () => {
			const entry = new ExactDateWithYearEntry('Afghanistan', 8, 19, 1919);
			expect(entry.name).toBe('Afghanistan');
			expect(entry.month).toBe(8);
			expect(entry.day).toBe(19);
			expect(entry.year).toBe(1919);
		});

		test('should detect occurrence on specific date', () => {
			const entry = new ExactDateWithYearEntry('Test Event', 8, 19, 1919);
			expect(entry.occursOn(new Date(1919, 7, 19))).toBe(true);
			expect(entry.occursOn(new Date(2019, 7, 19))).toBe(false);
		});

		test('should get anniversary', () => {
			const entry = new ExactDateWithYearEntry('Afghanistan', 8, 19, 1919);
			const anniversary = entry.getAnniversary(2026);
			expect(anniversary.getFullYear()).toBe(2026);
			expect(anniversary.getMonth()).toBe(7);
			expect(anniversary.getDate()).toBe(19);
		});

		test('should calculate years since event', () => {
			const entry = new ExactDateWithYearEntry('Test Event', 8, 19, 1919);
			const years = entry.getYearsSince(new Date(2026, 7, 19));
			expect(years).toBe(107);
		});

		test('should get occurrences in range (past event)', () => {
			const entry = new ExactDateWithYearEntry('Test Event', 8, 19, 1919);
			const startDate = new Date(1918, 0, 1);
			const endDate = new Date(1920, 11, 31);
			const occurrences = entry.getOccurrencesInRange(startDate, endDate);
			expect(occurrences).toHaveLength(1);
			expect(occurrences[0]?.getFullYear()).toBe(1919);
		});
	});

	describe('RelativeDateEntry', () => {
		test('should create a relative date entry', () => {
			const entry = new RelativeDateEntry('MLK Day', 3, 1, 1); // 3rd Monday in January
			expect(entry.name).toBe('MLK Day');
			expect(entry.occurrence).toBe(3);
			expect(entry.dayOfWeek).toBe(1);
			expect(entry.month).toBe(1);
		});

		test('should parse relative date string', () => {
			const result = RelativeDateEntry.parseRelativeDate('3MondayJan');
			expect(result.occurrence).toBe(3);
			expect(result.dayOfWeek).toBe(1); // Monday
			expect(result.month).toBe(1); // January
		});

		test('should get next occurrence correctly', () => {
			const entry = new RelativeDateEntry('MLK Day', 3, 1, 1); // 3rd Monday in January
			const fromDate = new Date(2026, 0, 1); // Jan 1, 2026
			const next = entry.getNextOccurrence(fromDate);
			expect(next.getFullYear()).toBe(2026);
			expect(next.getMonth()).toBe(0); // January
			expect(next.getDay()).toBe(1); // Monday
		});

		test('should detect occurrence on specific date', () => {
			const entry = new RelativeDateEntry('Test', 1, 1, 9); // 1st Monday in September
			// In 2026, Sept 1st is a Tuesday, so 1st Monday is Sept 7
			const date = new Date(2026, 8, 7);
			expect(date.getDay()).toBe(1); // Verify it's Monday
			expect(entry.occursOn(date)).toBe(true);
			expect(entry.occursOn(new Date(2026, 8, 14))).toBe(false);
		});

		test('should get occurrences in range', () => {
			const entry = new RelativeDateEntry('Labor Day', 1, 1, 9); // 1st Monday in September
			const startDate = new Date(2024, 0, 1);
			const endDate = new Date(2026, 11, 31);
			const occurrences = entry.getOccurrencesInRange(startDate, endDate);
			expect(occurrences.length).toBeGreaterThanOrEqual(2);
		});
	});
});

describe('CSV Parsing', () => {
	test('should parse exact date format (MM/DD)', () => {
		const entry = parseCSVLine("New Year's Day,01/01");
		expect(entry).toBeInstanceOf(ExactDateEntry);
		expect(entry?.name).toBe("New Year's Day");
		if (entry instanceof ExactDateEntry) {
			expect(entry.month).toBe(1);
			expect(entry.day).toBe(1);
		}
	});

	test('should parse exact date with year format (MM/DD,YYYY)', () => {
		const entry = parseCSVLine('Afghanistan,08/19,1919');
		expect(entry).toBeInstanceOf(ExactDateWithYearEntry);
		expect(entry?.name).toBe('Afghanistan');
		if (entry instanceof ExactDateWithYearEntry) {
			expect(entry.month).toBe(8);
			expect(entry.day).toBe(19);
			expect(entry.year).toBe(1919);
		}
	});

	test('should parse relative date format (NWeekdayMonth)', () => {
		const entry = parseCSVLine('Martin Luther King Jr. Day,3MondayJan');
		expect(entry).toBeInstanceOf(RelativeDateEntry);
		expect(entry?.name).toBe('Martin Luther King Jr. Day');
		if (entry instanceof RelativeDateEntry) {
			expect(entry.occurrence).toBe(3);
			expect(entry.dayOfWeek).toBe(1); // Monday
			expect(entry.month).toBe(1); // January
		}
	});

	test('should return null for invalid lines', () => {
		expect(parseCSVLine('')).toBeNull();
		expect(parseCSVLine('Invalid')).toBeNull();
		expect(parseCSVLine('Name,InvalidDate')).toBeNull();
	});
});

describe('File Reading', () => {
	test('should read entries from events.csv', () => {
		const entries = getEntries('./src/data/events.csv');
		expect(entries.length).toBeGreaterThan(0);
		expect(entries.every((e) => e instanceof ExactDateEntry)).toBe(true);
	});

	test('should read entries from events_d.csv', () => {
		const entries = getEntries('./src/data/events_d.csv');
		expect(entries.length).toBeGreaterThan(0);
		expect(entries.every((e) => e instanceof RelativeDateEntry)).toBe(true);
	});

	test('should read entries from countries.csv', () => {
		const entries = getEntries('./src/data/birthdays/countries.csv');
		expect(entries.length).toBeGreaterThan(0);
		expect(entries.every((e) => e instanceof ExactDateWithYearEntry)).toBe(true);
	});

	test('should read all entries recursively', () => {
		const entries = getAllEntries('./src/data');
		expect(entries.length).toBeGreaterThan(100); // Should have many entries

		const exactDate = entries.filter((e) => e instanceof ExactDateEntry);
		const exactDateWithYear = entries.filter((e) => e instanceof ExactDateWithYearEntry);
		const relativeDate = entries.filter((e) => e instanceof RelativeDateEntry);

		expect(exactDate.length).toBeGreaterThan(0);
		expect(exactDateWithYear.length).toBeGreaterThan(0);
		expect(relativeDate.length).toBeGreaterThan(0);
	});
});

describe('Query Functions', () => {
	const entries = [
		new ExactDateEntry('Today', 1, 19),
		new ExactDateEntry('Tomorrow', 1, 20),
		new ExactDateEntry('Next Week', 1, 26),
		new ExactDateEntry('Next Month', 2, 19),
		new ExactDateEntry('Next Year', 1, 19),
		new ExactDateWithYearEntry('Past Event', 1, 1, 2000)
	];

	describe('getEntriesInNextDays', () => {
		test('should get entries in next 7 days', () => {
			const fromDate = new Date(2026, 0, 19); // Jan 19, 2026
			const result = getEntriesInNextDays(entries, 7, fromDate);
			expect(result.length).toBeGreaterThan(0);
			expect(result.every(({ date }) => date <= new Date(2026, 0, 26))).toBe(true);
		});

		test('should be sorted by date', () => {
			const fromDate = new Date(2026, 0, 19);
			const result = getEntriesInNextDays(entries, 30, fromDate);
			for (let i = 1; i < result.length; i++) {
				expect(result[i]?.date.getTime()).toBeGreaterThanOrEqual(
					result[i - 1]?.date.getTime() ?? 0
				);
			}
		});
	});

	describe('getEntriesInNextWeeks', () => {
		test('should get entries in next 2 weeks', () => {
			const fromDate = new Date(2026, 0, 19);
			const result = getEntriesInNextWeeks(entries, 2, fromDate);
			expect(result.length).toBeGreaterThan(0);
			const endDate = new Date(fromDate);
			endDate.setDate(endDate.getDate() + 14);
			expect(result.every(({ date }) => date <= endDate)).toBe(true);
		});
	});

	describe('getEntriesInNextMonths', () => {
		test('should get entries in next month', () => {
			const fromDate = new Date(2026, 0, 19);
			const result = getEntriesInNextMonths(entries, 1, fromDate);
			expect(result.length).toBeGreaterThan(0);
			const endDate = new Date(2026, 1, 19); // Feb 19
			expect(result.every(({ date }) => date <= endDate)).toBe(true);
		});
	});

	describe('getEntriesInNextYears', () => {
		test('should get entries in next year', () => {
			const fromDate = new Date(2026, 0, 19);
			const result = getEntriesInNextYears(entries, 1, fromDate);
			expect(result.length).toBeGreaterThan(0);
			const endDate = new Date(2027, 0, 19);
			expect(result.every(({ date }) => date <= endDate)).toBe(true);
		});
	});

	describe('getEntriesOnDate', () => {
		test('should get entries on specific date', () => {
			const date = new Date(2026, 0, 19); // Jan 19, 2026
			const result = getEntriesOnDate(entries, date);
			expect(result.length).toBe(2); // "Today" and "Next Year" both occur on 1/19
			expect(result.map((e) => e.name)).toContain('Today');
		});
	});

	describe('getEntriesOnMonthDay', () => {
		test('should get entries on specific month and day', () => {
			const result = getEntriesOnMonthDay(entries, 1, 19);
			expect(result.length).toBe(2); // "Today" and "Next Year" (both have month=1, day=19)
			expect(result.map((e) => e.name)).toContain('Today');
		});
	});

	describe('getEntriesByType', () => {
		test('should filter by ExactDateEntry type', () => {
			const result = getEntriesByType(entries, ExactDateEntry);
			expect(result.every((e) => e instanceof ExactDateEntry)).toBe(true);
			expect(result.length).toBe(5);
		});

		test('should filter by ExactDateWithYearEntry type', () => {
			const result = getEntriesByType(entries, ExactDateWithYearEntry);
			expect(result.every((e) => e instanceof ExactDateWithYearEntry)).toBe(true);
			expect(result.length).toBe(1);
		});
	});
});

describe('Real Data Tests', () => {
	test('should correctly parse real events', () => {
		const entries = getEntries('./src/data/events.csv');
		const newYears = entries.find((e) => e.name === "New Year's Day");
		expect(newYears).toBeDefined();
		expect(newYears).toBeInstanceOf(ExactDateEntry);
		if (newYears instanceof ExactDateEntry) {
			expect(newYears.month).toBe(1);
			expect(newYears.day).toBe(1);
		}
	});

	test('should correctly parse real relative dates', () => {
		const entries = getEntries('./src/data/events_d.csv');
		const mlk = entries.find((e) => e.name.includes('Martin Luther King Jr.'));
		expect(mlk).toBeDefined();
		expect(mlk).toBeInstanceOf(RelativeDateEntry);
		if (mlk instanceof RelativeDateEntry) {
			expect(mlk.occurrence).toBe(3);
			expect(mlk.dayOfWeek).toBe(1); // Monday
			expect(mlk.month).toBe(1); // January
		}
	});

	test('should find upcoming events', () => {
		const allEntries = getAllEntries('./src/data');
		const fromDate = new Date(2026, 0, 19);
		const upcoming = getEntriesInNextDays(allEntries, 30, fromDate);
		expect(upcoming.length).toBeGreaterThan(0);
	});
});
