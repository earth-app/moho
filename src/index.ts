import fs from 'fs';
import path from 'path';

/**
 * Represents a calendar entry with a name and date.
 * Base class for all entry types.
 */
export abstract class Entry {
	constructor(
		public name: string,
		public source?: string
	) {}

	/**
	 * Gets the next occurrence of this entry from the given date.
	 * @param fromDate - The date to calculate from (default: today)
	 * @returns The next occurrence as a Date object
	 */
	abstract getNextOccurrence(fromDate?: Date): Date;

	/**
	 * Checks if this entry occurs on the given date.
	 * @param date - The date to check
	 * @returns true if the entry occurs on this date
	 */
	abstract occursOn(date: Date): boolean;

	/**
	 * Gets all occurrences within a date range.
	 * @param startDate - Start of the range
	 * @param endDate - End of the range
	 * @returns Array of dates when this entry occurs
	 */
	abstract getOccurrencesInRange(startDate: Date, endDate: Date): Date[];
}

/**
 * Entry with a specific month and day (recurring annually).
 * Example: "New Year's Day,01/01"
 */
export class ExactDateEntry extends Entry {
	constructor(
		name: string,
		public month: number,
		public day: number,
		public override source?: string
	) {
		super(name, source);
	}

	getNextOccurrence(fromDate: Date = new Date()): Date {
		const year = fromDate.getFullYear();
		let nextDate = new Date(year, this.month - 1, this.day);

		if (nextDate <= fromDate) {
			nextDate = new Date(year + 1, this.month - 1, this.day);
		}

		return nextDate;
	}

	occursOn(date: Date): boolean {
		return date.getMonth() === this.month - 1 && date.getDate() === this.day;
	}

	getOccurrencesInRange(startDate: Date, endDate: Date): Date[] {
		const occurrences: Date[] = [];
		const startYear = startDate.getFullYear();
		const endYear = endDate.getFullYear();

		for (let year = startYear; year <= endYear; year++) {
			const occurrence = new Date(year, this.month - 1, this.day);
			if (occurrence >= startDate && occurrence <= endDate) {
				occurrences.push(occurrence);
			}
		}

		return occurrences;
	}
}

/**
 * Entry with a specific year, month, and day (one-time event).
 * Example: "Afghanistan,08/19,1919"
 */
export class ExactDateWithYearEntry extends Entry {
	constructor(
		name: string,
		public month: number,
		public day: number,
		public year: number,
		public override source?: string
	) {
		super(name, source);
	}

	getNextOccurrence(fromDate: Date = new Date()): Date {
		// For historical events, return the next anniversary
		const currentYear = fromDate.getFullYear();
		let anniversaryDate = new Date(currentYear, this.month - 1, this.day);

		if (anniversaryDate <= fromDate) {
			anniversaryDate = new Date(currentYear + 1, this.month - 1, this.day);
		}

		return anniversaryDate;
	}

	occursOn(date: Date): boolean {
		return (
			date.getFullYear() === this.year &&
			date.getMonth() === this.month - 1 &&
			date.getDate() === this.day
		);
	}

	getOccurrencesInRange(startDate: Date, endDate: Date): Date[] {
		const eventDate = new Date(this.year, this.month - 1, this.day);
		if (eventDate >= startDate && eventDate <= endDate) {
			return [eventDate];
		}
		return [];
	}

	/**
	 * Gets the anniversary of this event on a specific year.
	 * @param year - The year to calculate the anniversary for
	 * @returns The anniversary date
	 */
	getAnniversary(year: number): Date {
		return new Date(year, this.month - 1, this.day);
	}

	/**
	 * Gets the number of years since this event for a given date.
	 * @param date - The date to calculate from (default: today)
	 * @returns The number of years
	 */
	getYearsSince(date: Date = new Date()): number {
		return date.getFullYear() - this.year;
	}
}

/**
 * Entry for a relative date (e.g., "3rd Monday in January").
 * Example: "Martin Luther King Jr. Day,3MondayJan"
 */
export class RelativeDateEntry extends Entry {
	private static readonly DAYS_OF_WEEK = [
		'Sunday',
		'Monday',
		'Tuesday',
		'Wednesday',
		'Thursday',
		'Friday',
		'Saturday'
	];
	private static readonly MONTHS = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];

	constructor(
		name: string,
		public occurrence: number, // 1-5 (1st, 2nd, 3rd, 4th, 5th)
		public dayOfWeek: number, // 0-6 (Sunday-Saturday)
		public month: number, // 1-12
		public override source?: string
	) {
		super(name, source);
	}

	/**
	 * Parses a relative date string (e.g., "3MondayJan") into components.
	 * @param dateStr - The date string to parse
	 * @returns Object with occurrence, dayOfWeek, and month
	 */
	static parseRelativeDate(dateStr: string): {
		occurrence: number;
		dayOfWeek: number;
		month: number;
	} {
		const occurrenceMatch = dateStr.match(/^(\d)/);
		if (!occurrenceMatch || !occurrenceMatch[1]) throw new Error('Invalid relative date format');

		const occurrence = parseInt(occurrenceMatch[1], 10);

		let dayOfWeek = -1;
		for (let i = 0; i < this.DAYS_OF_WEEK.length; i++) {
			const dayName = this.DAYS_OF_WEEK[i];
			if (dayName && dateStr.includes(dayName)) {
				dayOfWeek = i;
				break;
			}
		}
		if (dayOfWeek === -1) throw new Error('Invalid day of week');

		let month = -1;
		for (let i = 0; i < this.MONTHS.length; i++) {
			const monthName = this.MONTHS[i];
			if (monthName && dateStr.endsWith(monthName)) {
				month = i + 1;
				break;
			}
		}
		if (month === -1) throw new Error('Invalid month');

		return { occurrence, dayOfWeek, month };
	}

	/**
	 * Calculates the Nth occurrence of a weekday in a given month/year.
	 * @param year - The year
	 * @param month - The month (1-12)
	 * @param dayOfWeek - Day of week (0-6, Sunday-Saturday)
	 * @param occurrence - Which occurrence (1-5)
	 * @returns The calculated date or null if it doesn't exist
	 */
	private static getNthWeekdayOfMonth(
		year: number,
		month: number,
		dayOfWeek: number,
		occurrence: number
	): Date | null {
		const firstDay = new Date(year, month - 1, 1);
		const firstDayOfWeek = firstDay.getDay();

		let daysToAdd = (dayOfWeek - firstDayOfWeek + 7) % 7;
		daysToAdd += (occurrence - 1) * 7;

		const targetDate = new Date(year, month - 1, 1 + daysToAdd);

		// Check if the date is still in the same month
		if (targetDate.getMonth() !== month - 1) {
			return null;
		}

		return targetDate;
	}

	getNextOccurrence(fromDate: Date = new Date()): Date {
		let year = fromDate.getFullYear();
		let date = RelativeDateEntry.getNthWeekdayOfMonth(
			year,
			this.month,
			this.dayOfWeek,
			this.occurrence
		);

		if (!date || date <= fromDate) {
			year++;
			date = RelativeDateEntry.getNthWeekdayOfMonth(
				year,
				this.month,
				this.dayOfWeek,
				this.occurrence
			);
		}

		return date || new Date(9999, 11, 31);
	}

	occursOn(date: Date): boolean {
		if (date.getMonth() !== this.month - 1) return false;
		if (date.getDay() !== this.dayOfWeek) return false;

		const firstDay = new Date(date.getFullYear(), this.month - 1, 1);
		const firstDayOfWeek = firstDay.getDay();
		const daysToAdd = (this.dayOfWeek - firstDayOfWeek + 7) % 7;
		const expectedDay = 1 + daysToAdd + (this.occurrence - 1) * 7;

		return date.getDate() === expectedDay;
	}

	getOccurrencesInRange(startDate: Date, endDate: Date): Date[] {
		const occurrences: Date[] = [];
		const startYear = startDate.getFullYear();
		const endYear = endDate.getFullYear();

		for (let year = startYear; year <= endYear; year++) {
			const occurrence = RelativeDateEntry.getNthWeekdayOfMonth(
				year,
				this.month,
				this.dayOfWeek,
				this.occurrence
			);
			if (occurrence && occurrence >= startDate && occurrence <= endDate) {
				occurrences.push(occurrence);
			}
		}

		return occurrences;
	}
}

/**
 * Parses a CSV file and returns an array of Entry objects.
 * Automatically detects the format of each line.
 * @param filePath - The path to the CSV file
 * @returns Array of Entry objects
 */
export function getEntries(filePath: string, dataDir: string = './src/data'): Entry[] {
	const relative = path.relative(dataDir, filePath).split(path.sep).join('/');
	const data = fs.readFileSync(filePath, 'utf-8');
	const lines = data.split('\n').filter((line) => line.trim() !== '');
	const entries: Entry[] = [];

	for (const line of lines) {
		const parsed = parseCSVLine(line, relative);
		if (parsed) {
			entries.push(parsed);
		}
	}

	return entries;
}

/**
 * Parses a single CSV line into an Entry object.
 * Supports three formats:
 * 1. "Name,MM/DD" - Exact date (recurring)
 * 2. "Name,MM/DD,YYYY" - Exact date with year (one-time)
 * 3. "Name,NWeekdayMonth" - Relative date (e.g., "3MondayJan")
 * @param line - The CSV line to parse
 * @returns An Entry object or null if invalid
 */
export function parseCSVLine(line: string, source?: string): Entry | null {
	const parts = line.split(',');
	if (parts.length < 2) return null;

	const name = parts[0]?.trim();
	const dateStr = parts[1]?.trim();

	if (!name || !dateStr) return null;

	// Format 1 & 2: MM/DD or MM/DD,YYYY
	if (dateStr.includes('/')) {
		const [monthStr, dayStr] = dateStr.split('/');
		if (!monthStr || !dayStr) return null;

		const month = parseInt(monthStr, 10);
		const day = parseInt(dayStr, 10);

		if (isNaN(month) || isNaN(day)) return null;

		// Check if there's a year
		if (parts.length >= 3) {
			const yearStr = parts[2]?.trim();
			if (yearStr) {
				const year = parseInt(yearStr, 10);
				if (!isNaN(year)) {
					return new ExactDateWithYearEntry(name, month, day, year, source);
				}
			}
		}

		return new ExactDateEntry(name, month, day, source);
	}

	// Format 3: NWeekdayMonth (e.g., "3MondayJan")
	try {
		const { occurrence, dayOfWeek, month } = RelativeDateEntry.parseRelativeDate(dateStr);
		return new RelativeDateEntry(name, occurrence, dayOfWeek, month, source);
	} catch (error) {
		return null;
	}
}

/**
 * Reads all .csv files in the data directory and its subdirectories.
 * @param dataDir - The root data directory (default: './src/data')
 * @returns Array of all Entry objects
 */
export function getAllEntries(dataDir: string = './src/data'): Entry[] {
	const allEntries: Entry[] = [];

	function readDirRecursively(dirPath: string) {
		const items = fs.readdirSync(dirPath, { withFileTypes: true });
		for (const item of items) {
			const fullPath = path.join(dirPath, item.name);
			if (item.isDirectory()) {
				readDirRecursively(fullPath);
			} else if (item.isFile() && item.name.endsWith('.csv')) {
				const entries = getEntries(fullPath, dataDir);
				allEntries.push(...entries);
			}
		}
	}

	readDirRecursively(dataDir);
	return allEntries;
}

/**
 * Gets entries that occur within the next N days.
 * @param entries - Array of entries to filter
 * @param days - Number of days to look ahead
 * @param fromDate - Starting date (default: today)
 * @returns Array of entries with their next occurrence dates
 */
export function getEntriesInNextDays(
	entries: Entry[],
	days: number,
	fromDate: Date = new Date()
): Array<{ entry: Entry; date: Date }> {
	const endDate = new Date(fromDate);
	endDate.setDate(endDate.getDate() + days);

	return entries
		.map((entry) => ({
			entry,
			date: entry.getNextOccurrence(fromDate)
		}))
		.filter(({ date }) => date >= fromDate && date <= endDate)
		.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Gets entries that occur within the next N weeks.
 * @param entries - Array of entries to filter
 * @param weeks - Number of weeks to look ahead
 * @param fromDate - Starting date (default: today)
 * @returns Array of entries with their next occurrence dates
 */
export function getEntriesInNextWeeks(
	entries: Entry[],
	weeks: number,
	fromDate: Date = new Date()
): Array<{ entry: Entry; date: Date }> {
	return getEntriesInNextDays(entries, weeks * 7, fromDate);
}

/**
 * Gets entries that occur within the next N months.
 * @param entries - Array of entries to filter
 * @param months - Number of months to look ahead
 * @param fromDate - Starting date (default: today)
 * @returns Array of entries with their next occurrence dates
 */
export function getEntriesInNextMonths(
	entries: Entry[],
	months: number,
	fromDate: Date = new Date()
): Array<{ entry: Entry; date: Date }> {
	const endDate = new Date(fromDate);
	endDate.setMonth(endDate.getMonth() + months);

	return entries
		.map((entry) => ({
			entry,
			date: entry.getNextOccurrence(fromDate)
		}))
		.filter(({ date }) => date >= fromDate && date <= endDate)
		.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Gets entries that occur within the next N years.
 * @param entries - Array of entries to filter
 * @param years - Number of years to look ahead
 * @param fromDate - Starting date (default: today)
 * @returns Array of entries with their next occurrence dates
 */
export function getEntriesInNextYears(
	entries: Entry[],
	years: number,
	fromDate: Date = new Date()
): Array<{ entry: Entry; date: Date }> {
	const endDate = new Date(fromDate);
	endDate.setFullYear(endDate.getFullYear() + years);

	return entries
		.map((entry) => ({
			entry,
			date: entry.getNextOccurrence(fromDate)
		}))
		.filter(({ date }) => date >= fromDate && date <= endDate)
		.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Gets entries that occur on a specific date.
 * @param entries - Array of entries to filter
 * @param date - The date to check
 * @returns Array of entries that occur on this date
 */
export function getEntriesOnDate(entries: Entry[], date: Date): Entry[] {
	return entries.filter((entry) => entry.occursOn(date));
}

/**
 * Gets entries that occur on a specific month and day (any year).
 * @param entries - Array of entries to filter
 * @param month - Month (1-12)
 * @param day - Day of month
 * @returns Array of entries that occur on this month/day
 */
export function getEntriesOnMonthDay(entries: Entry[], month: number, day: number): Entry[] {
	return entries.filter((entry) => {
		if (entry instanceof ExactDateEntry) {
			return entry.month === month && entry.day === day;
		}
		if (entry instanceof ExactDateWithYearEntry) {
			return entry.month === month && entry.day === day;
		}
		return false;
	});
}

/**
 * Gets entries by type.
 * @param entries - Array of entries to filter
 * @param type - The entry type to filter by
 * @returns Array of entries of the specified type
 */
export function getEntriesByType<T extends Entry>(
	entries: Entry[],
	type: new (...args: any[]) => T
): T[] {
	return entries.filter((entry) => entry instanceof type) as T[];
}
