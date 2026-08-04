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
	getAllEntries,
	getEntries,
	getEntriesBySource,
	getEntriesByType,
	getEntriesInNextDays,
	getEntriesInNextMonths,
	getEntriesInNextWeeks,
	getEntriesInNextYears,
	getEntriesInRange,
	getEntriesOnDate,
	getEntriesOnMonthDay,
	parseCSVLine,
	splitCSVFields
} from '../src/index';

/**
 * Formats a date as `YYYY-MM-DD` in local time, which is the timezone every
 * entry type works in.
 * @param date - The date to format
 * @returns The local calendar day
 */
const iso = (date: Date): string =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

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

describe('splitCSVFields', () => {
	test('splits plain fields', () => {
		expect(splitCSVFields('Pi Day,03/14')).toEqual(['Pi Day', '03/14']);
	});

	test('keeps commas inside quoted fields', () => {
		expect(splitCSVFields('"Nike, Inc\'s Birthday",01/25,1964')).toEqual([
			"Nike, Inc's Birthday",
			'01/25',
			'1964'
		]);
	});

	test('unescapes doubled quotes inside a quoted field', () => {
		expect(splitCSVFields('"The ""Big"" One",01/01')).toEqual(['The "Big" One', '01/01']);
	});

	test('preserves empty fields', () => {
		expect(splitCSVFields('a,,c')).toEqual(['a', '', 'c']);
	});

	test('leaves a bare quote mid-field alone', () => {
		expect(splitCSVFields("O'Brien Day,05/01")).toEqual(["O'Brien Day", '05/01']);
	});
});

describe('RelativeDateEntry last-in-month', () => {
	test('parses the L prefix', () => {
		const result = RelativeDateEntry.parseRelativeDate('LMondayMay');
		expect(result.occurrence).toBe(RelativeDateEntry.LAST);
		expect(result.dayOfWeek).toBe(1);
		expect(result.month).toBe(5);
	});

	test('resolves Memorial Day across years with four and five Mondays', () => {
		const memorialDay = parseCSVLine('Memorial Day,LMondayMay') as RelativeDateEntry;
		expect(iso(memorialDay.getNextOccurrence(new Date(2024, 0, 1)))).toBe('2024-05-27');
		expect(iso(memorialDay.getNextOccurrence(new Date(2025, 0, 1)))).toBe('2025-05-26');
		expect(iso(memorialDay.getNextOccurrence(new Date(2026, 0, 1)))).toBe('2026-05-25');
		// 2027 has five Mondays in May, so the last one is the 31st
		expect(iso(memorialDay.getNextOccurrence(new Date(2027, 0, 1)))).toBe('2027-05-31');
	});

	test('occursOn agrees with getNextOccurrence', () => {
		const entry = new RelativeDateEntry('Last Friday', RelativeDateEntry.LAST, 5, 8);
		const date = entry.getNextOccurrence(new Date(2026, 0, 1));
		expect(entry.occursOn(date)).toBe(true);
		const weekEarlier = new Date(date);
		weekEarlier.setDate(weekEarlier.getDate() - 7);
		expect(entry.occursOn(weekEarlier)).toBe(false);
	});

	test('a fifth-weekday entry skips years where it does not exist', () => {
		// February 2026 has only four Sundays; the next fifth Sunday is in 2032
		const entry = new RelativeDateEntry('Fifth Sunday of February', 5, 0, 2);
		const next = entry.getNextOccurrence(new Date(2026, 0, 1));
		expect(next.getMonth()).toBe(1);
		expect(next.getDay()).toBe(0);
		expect(next.getFullYear()).toBeGreaterThan(2026);
		expect(entry.occursOn(next)).toBe(true);
	});
});

describe('OneTimeEntry', () => {
	const eclipse = parseCSVLine('Total Solar Eclipse,2026-08-12') as OneTimeEntry;

	test('parses an ISO date', () => {
		expect(eclipse).toBeInstanceOf(OneTimeEntry);
		expect(eclipse.year).toBe(2026);
		expect(eclipse.month).toBe(8);
		expect(eclipse.day).toBe(12);
		expect(iso(eclipse.date)).toBe('2026-08-12');
	});

	test('occurs on exactly one day', () => {
		expect(eclipse.occursOn(new Date(2026, 7, 12))).toBe(true);
		expect(eclipse.occursOn(new Date(2026, 7, 13))).toBe(false);
		expect(eclipse.occursOn(new Date(2027, 7, 12))).toBe(false);
	});

	test('reports whether it has passed', () => {
		expect(eclipse.hasOccurred(new Date(2026, 0, 1))).toBe(false);
		expect(eclipse.hasOccurred(new Date(2027, 0, 1))).toBe(true);
	});

	test('appears in a range containing it and not otherwise', () => {
		expect(
			eclipse.getOccurrencesInRange(new Date(2026, 0, 1), new Date(2026, 11, 31))
		).toHaveLength(1);
		expect(eclipse.getOccurrencesInRange(new Date(2027, 0, 1), new Date(2027, 11, 31))).toEqual([]);
	});

	test('is dropped by the next-days query once it has passed', () => {
		const upcoming = getEntriesInNextDays([eclipse], 3650, new Date(2027, 0, 1));
		expect(upcoming).toEqual([]);
	});
});

describe('IntervalEntry', () => {
	const halley = parseCSVLine('Halley Perihelion,every:27758:1986-02-09') as IntervalEntry;

	test('parses an epoch and period', () => {
		expect(halley).toBeInstanceOf(IntervalEntry);
		expect(halley.intervalDays).toBe(27758);
		expect(iso(halley.epoch)).toBe('1986-02-09');
	});

	test('walks whole cycles from the epoch', () => {
		expect(iso(halley.getOccurrence(0))).toBe('1986-02-09');
		expect(halley.getCycleAt(halley.getOccurrence(3))).toBeCloseTo(3, 6);
	});

	test('handles a fractional period without drifting', () => {
		const mars = parseCSVLine('Mars Orbit,every:686.98:2026-01-01') as IntervalEntry;
		expect(iso(mars.getOccurrence(1))).toBe('2027-11-19');
		expect(mars.occursOn(mars.getOccurrence(1))).toBe(true);
		expect(mars.occursOn(new Date(2027, 10, 20))).toBe(false);
	});

	test('is immune to daylight saving shifts', () => {
		// a one-day period stepped across the US spring-forward boundary
		const daily = new IntervalEntry('Daily', new Date(2026, 2, 1), 1);
		for (let n = 0; n <= 30; n++) {
			const occurrence = daily.getOccurrence(n);
			expect(occurrence.getHours()).toBe(0);
			expect(daily.occursOn(occurrence)).toBe(true);
		}
		expect(iso(daily.getOccurrence(30))).toBe('2026-03-31');
	});

	test('next occurrence is always strictly in the future', () => {
		const daily = new IntervalEntry('Daily', new Date(2026, 0, 1), 1);
		const from = new Date(2026, 5, 10);
		expect(daily.getNextOccurrence(from) > from).toBe(true);
		expect(iso(daily.getNextOccurrence(from))).toBe('2026-06-11');
	});

	test('enumerates a range', () => {
		const weekly = new IntervalEntry('Weekly', new Date(2026, 0, 1), 7);
		const occurrences = weekly.getOccurrencesInRange(new Date(2026, 0, 1), new Date(2026, 1, 1));
		expect(occurrences).toHaveLength(5);
		expect(iso(occurrences[0] as Date)).toBe('2026-01-01');
	});

	test('rejects a non-positive period', () => {
		expect(() => new IntervalEntry('Bad', new Date(2026, 0, 1), 0)).toThrow();
		expect(parseCSVLine('Bad,every:0:2026-01-01')).toBeNull();
	});
});

describe('DateRangeEntry', () => {
	const nfl = parseCSVLine('NFL Regular Season,range:09/04-01/05') as DateRangeEntry;
	const mlb = parseCSVLine('MLB Regular Season,range:03/26-09/28') as DateRangeEntry;

	test('parses both endpoints', () => {
		expect(nfl).toBeInstanceOf(DateRangeEntry);
		expect(nfl.startMonth).toBe(9);
		expect(nfl.startDay).toBe(4);
		expect(nfl.endMonth).toBe(1);
		expect(nfl.endDay).toBe(5);
	});

	test('detects a span that wraps the year', () => {
		expect(nfl.wrapsYear).toBe(true);
		expect(mlb.wrapsYear).toBe(false);
	});

	test('covers days on both sides of a year boundary', () => {
		expect(nfl.occursOn(new Date(2026, 11, 25))).toBe(true);
		expect(nfl.occursOn(new Date(2027, 0, 2))).toBe(true);
		expect(nfl.occursOn(new Date(2026, 5, 1))).toBe(false);
	});

	test('includes both endpoints', () => {
		expect(mlb.occursOn(new Date(2026, 2, 26))).toBe(true);
		expect(mlb.occursOn(new Date(2026, 8, 28))).toBe(true);
		expect(mlb.occursOn(new Date(2026, 2, 25))).toBe(false);
		expect(mlb.occursOn(new Date(2026, 8, 29))).toBe(false);
	});

	test('resolves a concrete span for a year', () => {
		const { start, end } = nfl.getRangeFor(2026);
		expect(iso(start)).toBe('2026-09-04');
		expect(iso(end)).toBe('2027-01-05');
	});

	test('next occurrence is the next opening date', () => {
		expect(iso(nfl.getNextOccurrence(new Date(2026, 0, 1)))).toBe('2026-09-04');
		expect(iso(nfl.getNextOccurrence(new Date(2026, 9, 1)))).toBe('2027-09-04');
	});

	test('enumerates one opening per year in a range', () => {
		const occurrences = mlb.getOccurrencesInRange(new Date(2026, 0, 1), new Date(2028, 11, 31));
		expect(occurrences).toHaveLength(3);
	});

	test('rejects an impossible endpoint', () => {
		expect(parseCSVLine('Bad,range:02/30-03/01')).toBeNull();
		expect(parseCSVLine('Bad,range:13/01-03/01')).toBeNull();
	});
});

describe('EasterEntry', () => {
	test('computes Gregorian Easter against published dates', () => {
		const known: Array<[number, string]> = [
			[2024, '2024-03-31'],
			[2025, '2025-04-20'],
			[2026, '2026-04-05'],
			[2027, '2027-03-28'],
			[2030, '2030-04-21'],
			[2038, '2038-04-25']
		];
		for (const [year, expected] of known) {
			expect(iso(EasterEntry.computeEaster(year))).toBe(expected);
		}
	});

	test('computes Orthodox Easter against published dates', () => {
		const known: Array<[number, string]> = [
			[2024, '2024-05-05'],
			[2025, '2025-04-20'],
			[2026, '2026-04-12'],
			[2027, '2027-05-02'],
			[2028, '2028-04-16']
		];
		for (const [year, expected] of known) {
			expect(iso(EasterEntry.computeEaster(year, 'julian'))).toBe(expected);
		}
	});

	test('parses a positive and a negative offset', () => {
		const goodFriday = parseCSVLine('Good Friday,easter-2') as EasterEntry;
		expect(goodFriday).toBeInstanceOf(EasterEntry);
		expect(goodFriday.offsetDays).toBe(-2);
		expect(goodFriday.calendar).toBe('gregorian');

		const pentecost = parseCSVLine('Pentecost,easter+49') as EasterEntry;
		expect(pentecost.offsetDays).toBe(49);
	});

	test('parses the Orthodox variant', () => {
		const entry = parseCSVLine('Orthodox Easter,orthodox-easter+0') as EasterEntry;
		expect(entry.calendar).toBe('julian');
		expect(entry.offsetDays).toBe(0);
		expect(iso(entry.getDateFor(2026))).toBe('2026-04-12');
	});

	test('places the moveable feasts of 2026 correctly', () => {
		const feasts: Array<[string, string]> = [
			['Mardi Gras,easter-47', '2026-02-17'],
			['Ash Wednesday,easter-46', '2026-02-18'],
			['Palm Sunday,easter-7', '2026-03-29'],
			['Good Friday,easter-2', '2026-04-03'],
			['Easter Sunday,easter+0', '2026-04-05'],
			['Ascension Day,easter+39', '2026-05-14'],
			['Pentecost,easter+49', '2026-05-24']
		];
		for (const [line, expected] of feasts) {
			const entry = parseCSVLine(line) as EasterEntry;
			expect(`${entry.name}:${iso(entry.getDateFor(2026))}`).toBe(`${entry.name}:${expected}`);
		}
	});

	test('occursOn and getNextOccurrence agree', () => {
		const entry = parseCSVLine('Easter Sunday,easter+0') as EasterEntry;
		const next = entry.getNextOccurrence(new Date(2026, 0, 1));
		expect(iso(next)).toBe('2026-04-05');
		expect(entry.occursOn(next)).toBe(true);
		expect(entry.occursOn(new Date(2026, 3, 6))).toBe(false);
	});

	test('enumerates one occurrence per year in a range', () => {
		const entry = parseCSVLine('Easter Sunday,easter+0') as EasterEntry;
		const occurrences = entry.getOccurrencesInRange(new Date(2026, 0, 1), new Date(2029, 11, 31));
		expect(occurrences).toHaveLength(4);
	});

	test('handles an offset that crosses into an adjacent year', () => {
		// Septuagesima can land in January, two months before Easter
		const entry = parseCSVLine('Septuagesima,easter-63') as EasterEntry;
		const occurrences = entry.getOccurrencesInRange(new Date(2026, 0, 1), new Date(2026, 11, 31));
		expect(occurrences).toHaveLength(1);
		expect(iso(occurrences[0] as Date)).toBe('2026-02-01');
	});
});

describe('Parser rejections', () => {
	test('rejects MM/DD/YYYY packed into one field', () => {
		// this silently dropped the year before, producing a recurring entry
		expect(parseCSVLine('A.T. Still University,10/24/2002')).toBeNull();
	});

	test('rejects impossible month/day pairs', () => {
		expect(parseCSVLine('Nope,02/30')).toBeNull();
		expect(parseCSVLine('Nope,13/01')).toBeNull();
		expect(parseCSVLine('Nope,00/10')).toBeNull();
		expect(parseCSVLine('Nope,11/31')).toBeNull();
	});

	test('accepts February 29 as a recurring date', () => {
		expect(parseCSVLine('Leap Day,02/29')).toBeInstanceOf(ExactDateEntry);
	});

	test('rejects a malformed ISO date', () => {
		expect(parseCSVLine('Nope,2026-13-01')).toBeNull();
		expect(parseCSVLine('Nope,2026-02-30')).toBeNull();
	});

	test('round-trips a quoted name through the parser', () => {
		const entry = parseCSVLine('"Nike, Inc\'s Birthday",01/25,1964');
		expect(entry).toBeInstanceOf(ExactDateWithYearEntry);
		expect(entry?.name).toBe("Nike, Inc's Birthday");
	});
});

describe('Data directory resolution', () => {
	test('DATA_DIR points at a real directory containing the data', () => {
		expect(DATA_DIR).toContain('data');
		expect(getEntries(`${DATA_DIR}/events.csv`).length).toBeGreaterThan(0);
	});

	test('DATA_DIR is an absolute path where a filesystem exists', () => {
		// a runtime with no filesystem falls back to the relative './src/data';
		// under Node it must have resolved against the module location
		expect(path.isAbsolute(DATA_DIR)).toBe(true);
		expect(fs.existsSync(DATA_DIR)).toBe(true);
	});

	test('an explicit directory is used verbatim, ignoring DATA_DIR', () => {
		// this is the path Cloudflare Workers takes: the CSVs are bundled as text
		// modules at the bundle root, nowhere near the module itself
		const entries = getEntries('./src/data/events.csv', './src/data');
		expect(entries.length).toBeGreaterThan(0);
		expect(entries[0]?.source).toBe('events.csv');
	});

	test('getAllEntries works with no arguments, from any working directory', () => {
		const entries = getAllEntries();
		expect(entries.length).toBeGreaterThan(1000);
	});

	test('comment lines are skipped', () => {
		const entries = getEntries(`${DATA_DIR}/cosmic/zodiac.csv`);
		expect(entries).toHaveLength(12);
		expect(entries.every((entry) => !entry.name.startsWith('#'))).toBe(true);
	});
});

describe('getEntriesInRange', () => {
	test('expands a recurring entry once per year', () => {
		const piDay = new ExactDateEntry('Pi Day', 3, 14);
		const result = getEntriesInRange([piDay], new Date(2026, 0, 1), new Date(2028, 11, 31));
		expect(result).toHaveLength(3);
	});

	test('sorts mixed entry types by date', () => {
		const entries = [
			new ExactDateEntry('June', 6, 1),
			new ExactDateEntry('March', 3, 1),
			new OneTimeEntry('One Off', 4, 15, 2026)
		];
		const result = getEntriesInRange(entries, new Date(2026, 0, 1), new Date(2026, 11, 31));
		expect(result.map(({ entry }) => entry.name)).toEqual(['March', 'One Off', 'June']);
	});
});

describe('getEntriesBySource', () => {
	const entries = getAllEntries();

	test('filters by directory prefix', () => {
		const cosmic = getEntriesBySource(entries, 'cosmic/');
		expect(cosmic.length).toBeGreaterThan(100);
		expect(cosmic.every((entry) => entry.source?.startsWith('cosmic/'))).toBe(true);
	});

	test('filters by an exact file', () => {
		const zodiac = getEntriesBySource(entries, 'cosmic/zodiac.csv');
		expect(zodiac).toHaveLength(12);
	});

	test('returns nothing for an unknown source', () => {
		expect(getEntriesBySource(entries, 'nope/')).toEqual([]);
	});
});

describe('getEntriesOnMonthDay with new types', () => {
	test('matches a one-time entry by its month and day', () => {
		const entries = [new OneTimeEntry('Eclipse', 8, 12, 2026)];
		expect(getEntriesOnMonthDay(entries, 8, 12)).toHaveLength(1);
		expect(getEntriesOnMonthDay(entries, 8, 13)).toHaveLength(0);
	});

	test('ignores computed and spanning types', () => {
		const entries = [
			new DateRangeEntry('Season', 3, 1, 9, 1),
			new EasterEntry('Easter', 0),
			new IntervalEntry('Cycle', new Date(2026, 2, 1), 30)
		];
		expect(getEntriesOnMonthDay(entries, 3, 1)).toEqual([]);
	});
});
