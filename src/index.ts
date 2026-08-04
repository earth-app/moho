import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MS_PER_DAY = 86_400_000;

/**
 * Converts a `Date` to a whole-day number, ignoring the time-of-day and the
 * local timezone offset. Two dates on the same local calendar day always
 * produce the same number, which makes day arithmetic immune to DST shifts.
 * @param date - The date to convert
 * @returns The number of days since the Unix epoch
 */
function toDayNumber(date: Date): number {
	return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

/**
 * Inverse of {@link toDayNumber}; returns local midnight on that calendar day.
 * @param dayNumber - The number of days since the Unix epoch
 * @returns A `Date` at local midnight
 */
function fromDayNumber(dayNumber: number): Date {
	const utc = new Date(dayNumber * MS_PER_DAY);
	return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

/**
 * Splits a CSV line into fields, honouring RFC 4180 double-quoted fields so
 * that names containing commas (`"Nike, Inc's Birthday",01/25,1964`) survive.
 * A doubled quote inside a quoted field is an escaped quote.
 * @param line - The raw CSV line
 * @returns The individual field values, unquoted and unescaped
 */
export function splitCSVFields(line: string): string[] {
	const fields: string[] = [];
	let current = '';
	let quoted = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (quoted) {
			if (char === '"') {
				if (line[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					quoted = false;
				}
			} else {
				current += char;
			}
		} else if (char === '"' && current.trim() === '') {
			quoted = true;
			current = '';
		} else if (char === ',') {
			fields.push(current);
			current = '';
		} else {
			current += char;
		}
	}

	fields.push(current);
	return fields;
}

/**
 * Path to the CSV data bundled with this package.
 *
 * Resolved from the module's own location so it works from any working
 * directory, both from source (`src/data`) and from the built output
 * (`dist/../src/data`).
 *
 * On runtimes with no real filesystem - Cloudflare Workers being the one that
 * matters here - nothing resolves and this falls back to `./src/data`, the
 * relative default this package used before the constant existed. Workers
 * consumers should pass an explicit directory instead: the CSVs are bundled as
 * text modules, so the data lives at the bundle root (`/bundle/data`) rather
 * than anywhere near the module.
 */
export const DATA_DIR: string = (() => {
	// the historical default, kept as the fallback so a filesystem-less runtime
	// behaves exactly as it did before rather than pointing somewhere invented
	const fallback = './src/data';
	try {
		const here = path.dirname(fileURLToPath(import.meta.url));
		for (const candidate of [path.join(here, 'data'), path.join(here, '..', 'src', 'data')]) {
			if (fs.existsSync(candidate)) return candidate;
		}
	} catch {
		// no file: URL, or no fs; fall through
	}
	return fallback;
})();

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

	/** Sentinel {@link occurrence} value meaning "the last one in the month". */
	static readonly LAST = -1;

	constructor(
		name: string,
		public occurrence: number, // 1-5, or RelativeDateEntry.LAST (-1) for the last in the month
		public dayOfWeek: number, // 0-6 (Sunday-Saturday)
		public month: number, // 1-12
		public override source?: string
	) {
		super(name, source);
	}

	/**
	 * Parses a relative date string (e.g., "3MondayJan") into components.
	 * A leading `L` means the last occurrence in the month ("LMondayMay"),
	 * which is how holidays such as Memorial Day are actually defined.
	 * @param dateStr - The date string to parse
	 * @returns Object with occurrence, dayOfWeek, and month
	 */
	static parseRelativeDate(dateStr: string): {
		occurrence: number;
		dayOfWeek: number;
		month: number;
	} {
		const occurrenceMatch = dateStr.match(/^([1-5]|[Ll])/);
		if (!occurrenceMatch || !occurrenceMatch[1]) throw new Error('Invalid relative date format');

		const token = occurrenceMatch[1];
		const occurrence = token.toUpperCase() === 'L' ? RelativeDateEntry.LAST : parseInt(token, 10);

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
	 * @param occurrence - Which occurrence (1-5), or {@link RelativeDateEntry.LAST}
	 * @returns The calculated date or null if it doesn't exist
	 */
	private static getNthWeekdayOfMonth(
		year: number,
		month: number,
		dayOfWeek: number,
		occurrence: number
	): Date | null {
		if (occurrence === RelativeDateEntry.LAST) {
			const lastDay = new Date(year, month, 0);
			const daysToSubtract = (lastDay.getDay() - dayOfWeek + 7) % 7;
			return new Date(year, month - 1, lastDay.getDate() - daysToSubtract);
		}

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
		// a 5th weekday does not exist every year, so scan forward instead of
		// giving up after a single retry
		for (let offset = 0; offset <= 10; offset++) {
			const date = RelativeDateEntry.getNthWeekdayOfMonth(
				fromDate.getFullYear() + offset,
				this.month,
				this.dayOfWeek,
				this.occurrence
			);
			if (date && date > fromDate) return date;
		}

		return new Date(9999, 11, 31);
	}

	occursOn(date: Date): boolean {
		if (date.getMonth() !== this.month - 1) return false;
		if (date.getDay() !== this.dayOfWeek) return false;

		const expected = RelativeDateEntry.getNthWeekdayOfMonth(
			date.getFullYear(),
			this.month,
			this.dayOfWeek,
			this.occurrence
		);

		return expected !== null && expected.getDate() === date.getDate();
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
 * Entry for something that happens exactly once, on a known calendar day.
 * Unlike {@link ExactDateWithYearEntry} it has no annual anniversary: a total
 * solar eclipse or a comet perihelion simply happens and is then over.
 *
 * Example: `Total Solar Eclipse (Iceland/Spain),2026-08-12`
 *
 * Dates are calendar days, not instants. Astronomical rows store the UTC day.
 */
export class OneTimeEntry extends Entry {
	constructor(
		name: string,
		public month: number,
		public day: number,
		public year: number,
		public override source?: string
	) {
		super(name, source);
	}

	/** The event's calendar day, at local midnight. */
	get date(): Date {
		return new Date(this.year, this.month - 1, this.day);
	}

	/**
	 * Returns the event date. A one-time event has no future occurrence once it
	 * has passed, so the returned date may be in the past; callers filtering on
	 * `date >= fromDate` (as the query helpers do) drop it naturally.
	 * @param _fromDate - Unused; present to satisfy the {@link Entry} contract
	 * @returns The event date
	 */
	getNextOccurrence(_fromDate: Date = new Date()): Date {
		return this.date;
	}

	occursOn(date: Date): boolean {
		return (
			date.getFullYear() === this.year &&
			date.getMonth() === this.month - 1 &&
			date.getDate() === this.day
		);
	}

	getOccurrencesInRange(startDate: Date, endDate: Date): Date[] {
		const date = this.date;
		return date >= startDate && date <= endDate ? [date] : [];
	}

	/**
	 * Whether this event is already in the past.
	 * @param fromDate - The date to compare against (default: today)
	 * @returns true if the event day is before `fromDate`
	 */
	hasOccurred(fromDate: Date = new Date()): boolean {
		return this.date < fromDate;
	}
}

/**
 * Entry that repeats on a fixed period measured in days, anchored to an epoch.
 * Built for cycles that do not fit a calendar: orbital periods, comet returns,
 * the saros and metonic cycles.
 *
 * Example: `Halley's Comet Perihelion,every:27758:1986-02-09`
 *
 * The period may be fractional (Mars orbits in 686.98 days); occurrences are
 * rounded to the nearest whole day.
 */
export class IntervalEntry extends Entry {
	constructor(
		name: string,
		public epoch: Date,
		public intervalDays: number,
		public override source?: string
	) {
		super(name, source);
		if (!(intervalDays > 0)) throw new Error('Interval must be a positive number of days');
	}

	/**
	 * Gets the nth occurrence relative to the epoch.
	 * @param n - Cycle index; 0 is the epoch itself, negatives run backwards
	 * @returns The occurrence date
	 */
	getOccurrence(n: number): Date {
		return fromDayNumber(Math.round(toDayNumber(this.epoch) + n * this.intervalDays));
	}

	/**
	 * Gets the cycle index nearest to the given date.
	 * @param date - The date to locate
	 * @returns The (possibly fractional) number of cycles since the epoch
	 */
	getCycleAt(date: Date): number {
		return (toDayNumber(date) - toDayNumber(this.epoch)) / this.intervalDays;
	}

	getNextOccurrence(fromDate: Date = new Date()): Date {
		let n = Math.ceil(this.getCycleAt(fromDate));
		// rounding to whole days can put the candidate on or before fromDate
		while (this.getOccurrence(n) <= fromDate) n++;
		return this.getOccurrence(n);
	}

	occursOn(date: Date): boolean {
		const n = Math.round(this.getCycleAt(date));
		return toDayNumber(this.getOccurrence(n)) === toDayNumber(date);
	}

	getOccurrencesInRange(startDate: Date, endDate: Date): Date[] {
		const occurrences: Date[] = [];
		for (let n = Math.floor(this.getCycleAt(startDate)); ; n++) {
			const occurrence = this.getOccurrence(n);
			if (occurrence > endDate) break;
			if (occurrence >= startDate) occurrences.push(occurrence);
		}
		return occurrences;
	}
}

/**
 * Entry covering a span of the year rather than a single day, recurring
 * annually. A span whose end falls before its start wraps into the next year,
 * which is how most sports seasons and two of the zodiac signs behave.
 *
 * Example: `NFL Regular Season,range:09/04-01/04`
 */
export class DateRangeEntry extends Entry {
	constructor(
		name: string,
		public startMonth: number,
		public startDay: number,
		public endMonth: number,
		public endDay: number,
		public override source?: string
	) {
		super(name, source);
	}

	/** Whether the span crosses into the following calendar year. */
	get wrapsYear(): boolean {
		return (
			this.endMonth < this.startMonth ||
			(this.endMonth === this.startMonth && this.endDay < this.startDay)
		);
	}

	/**
	 * Gets the concrete span for the year the run starts in.
	 * @param year - The year the span starts in
	 * @returns The start and end dates, both inclusive
	 */
	getRangeFor(year: number): { start: Date; end: Date } {
		return {
			start: new Date(year, this.startMonth - 1, this.startDay),
			end: new Date(year + (this.wrapsYear ? 1 : 0), this.endMonth - 1, this.endDay)
		};
	}

	/**
	 * Returns the next start date, i.e. when the span next opens.
	 * @param fromDate - The date to calculate from (default: today)
	 * @returns The next start date
	 */
	getNextOccurrence(fromDate: Date = new Date()): Date {
		const year = fromDate.getFullYear();
		const start = new Date(year, this.startMonth - 1, this.startDay);
		return start > fromDate ? start : new Date(year + 1, this.startMonth - 1, this.startDay);
	}

	/**
	 * Whether the given date falls anywhere inside the span, endpoints included.
	 * @param date - The date to check
	 * @returns true if the date is within the span
	 */
	occursOn(date: Date): boolean {
		// a wrapping span can be entered from either the current or the prior year
		for (const year of [date.getFullYear(), date.getFullYear() - 1]) {
			const { start, end } = this.getRangeFor(year);
			if (date >= start && date <= end) return true;
		}
		return false;
	}

	/**
	 * Gets the start dates of every span that opens within the given window.
	 * @param startDate - Start of the window
	 * @param endDate - End of the window
	 * @returns Array of span start dates
	 */
	getOccurrencesInRange(startDate: Date, endDate: Date): Date[] {
		const occurrences: Date[] = [];
		for (let year = startDate.getFullYear(); year <= endDate.getFullYear(); year++) {
			const start = new Date(year, this.startMonth - 1, this.startDay);
			if (start >= startDate && start <= endDate) occurrences.push(start);
		}
		return occurrences;
	}
}

/**
 * Entry positioned a fixed number of days from Easter Sunday, which moves every
 * year. Covers the moveable feasts (Ash Wednesday, Good Friday, Pentecost) in
 * both the Gregorian (Western) and Julian (Orthodox) reckonings.
 *
 * Example: `Good Friday,easter-2` / `Orthodox Easter,orthodox-easter+0`
 */
export class EasterEntry extends Entry {
	constructor(
		name: string,
		public offsetDays: number,
		public calendar: 'gregorian' | 'julian' = 'gregorian',
		public override source?: string
	) {
		super(name, source);
	}

	/**
	 * Computes Easter Sunday, as a date in the Gregorian calendar.
	 *
	 * The Gregorian branch is the anonymous Meeus/Jones/Butcher algorithm. The
	 * Julian branch computes Orthodox Easter on the Julian calendar and then
	 * shifts it onto the Gregorian calendar by the offset for that century.
	 * @param year - The year to compute for
	 * @param calendar - Which reckoning to use (default: gregorian)
	 * @returns Easter Sunday for that year
	 */
	static computeEaster(year: number, calendar: 'gregorian' | 'julian' = 'gregorian'): Date {
		if (calendar === 'julian') {
			const a = year % 4;
			const b = year % 7;
			const c = year % 19;
			const d = (19 * c + 15) % 30;
			const e = (2 * a + 4 * b - d + 34) % 7;
			const month = Math.floor((d + e + 114) / 31);
			const day = ((d + e + 114) % 31) + 1;

			// Julian -> Gregorian: 2 days at the Julian year 200, +1 per skipped leap century
			const julianDate = new Date(year, month - 1, day);
			const shift = Math.floor(year / 100) - Math.floor(year / 400) - 2;
			julianDate.setDate(julianDate.getDate() + shift);
			return julianDate;
		}

		const a = year % 19;
		const b = Math.floor(year / 100);
		const c = year % 100;
		const d = Math.floor(b / 4);
		const e = b % 4;
		const f = Math.floor((b + 8) / 25);
		const g = Math.floor((b - f + 1) / 3);
		const h = (19 * a + b - d - g + 15) % 30;
		const i = Math.floor(c / 4);
		const k = c % 4;
		const l = (32 + 2 * e + 2 * i - h - k) % 7;
		const m = Math.floor((a + 11 * h + 22 * l) / 451);
		const month = Math.floor((h + l - 7 * m + 114) / 31);
		const day = ((h + l - 7 * m + 114) % 31) + 1;

		return new Date(year, month - 1, day);
	}

	/**
	 * Gets this entry's date in a given year.
	 * @param year - The year to compute for
	 * @returns The date, Easter plus this entry's offset
	 */
	getDateFor(year: number): Date {
		const easter = EasterEntry.computeEaster(year, this.calendar);
		easter.setDate(easter.getDate() + this.offsetDays);
		return easter;
	}

	getNextOccurrence(fromDate: Date = new Date()): Date {
		const year = fromDate.getFullYear();
		const thisYear = this.getDateFor(year);
		return thisYear > fromDate ? thisYear : this.getDateFor(year + 1);
	}

	occursOn(date: Date): boolean {
		return toDayNumber(this.getDateFor(date.getFullYear())) === toDayNumber(date);
	}

	getOccurrencesInRange(startDate: Date, endDate: Date): Date[] {
		const occurrences: Date[] = [];
		// the offset can push a date into an adjacent year, so widen the sweep
		for (let year = startDate.getFullYear() - 1; year <= endDate.getFullYear() + 1; year++) {
			const date = this.getDateFor(year);
			if (date >= startDate && date <= endDate) occurrences.push(date);
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
export function getEntries(filePath: string, dataDir: string = DATA_DIR): Entry[] {
	const relative = path
		.relative(path.resolve(dataDir), path.resolve(filePath))
		.split(path.sep)
		.join('/');
	const data = fs.readFileSync(filePath, 'utf-8');
	const lines = data
		.split('\n')
		.map((line) => line.replace(/^\uFEFF/, '').replace(/\r$/, ''))
		.filter((line) => line.trim() !== '' && !line.startsWith('#'));
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
 * Whether the month/day pair is a real calendar date. February is allowed 29
 * days because a recurring `02/29` entry is valid in leap years.
 * @param month - Month (1-12)
 * @param day - Day of month
 * @returns true if the combination exists
 */
function isValidMonthDay(month: number, day: number): boolean {
	if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
	if (month < 1 || month > 12 || day < 1) return false;
	const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] as number;
	return day <= maxDay;
}

/**
 * Parses a single CSV line into an Entry object.
 *
 * Supported formats, detected from the second field:
 *
 * | Format                        | Type                       | Example                       |
 * | ----------------------------- | -------------------------- | ----------------------------- |
 * | `MM/DD`                       | {@link ExactDateEntry}     | `Pi Day,03/14`                |
 * | `MM/DD,YYYY`                  | {@link ExactDateWithYearEntry} | `Afghanistan,08/19,1919`  |
 * | `NWeekdayMonth`               | {@link RelativeDateEntry}  | `MLK Day,3MondayJan`          |
 * | `LWeekdayMonth`               | {@link RelativeDateEntry}  | `Memorial Day,LMondayMay`     |
 * | `YYYY-MM-DD`                  | {@link OneTimeEntry}       | `Solar Eclipse,2026-08-12`    |
 * | `every:DAYS:YYYY-MM-DD`       | {@link IntervalEntry}      | `Halley,every:27758:1986-02-09` |
 * | `range:MM/DD-MM/DD`           | {@link DateRangeEntry}     | `NFL Season,range:09/04-01/04` |
 * | `easter[+-]N`                 | {@link EasterEntry}        | `Good Friday,easter-2`        |
 * | `orthodox-easter[+-]N`        | {@link EasterEntry}        | `Orthodox Easter,orthodox-easter+0` |
 *
 * Names containing commas must be double-quoted.
 * @param line - The CSV line to parse
 * @param source - Optional provenance recorded on the entry
 * @returns An Entry object or null if invalid
 */
export function parseCSVLine(line: string, source?: string): Entry | null {
	const parts = splitCSVFields(line);
	if (parts.length < 2) return null;

	const name = parts[0]?.trim();
	const dateStr = parts[1]?.trim();

	if (!name || !dateStr) return null;

	// every:DAYS:YYYY-MM-DD - periodic cycle anchored to an epoch
	const intervalMatch = dateStr.match(/^every:(\d+(?:\.\d+)?):(\d{4})-(\d{2})-(\d{2})$/i);
	if (intervalMatch) {
		const [, daysStr, yearStr, monthStr, dayStr] = intervalMatch as unknown as string[];
		const days = parseFloat(daysStr as string);
		const month = parseInt(monthStr as string, 10);
		const day = parseInt(dayStr as string, 10);
		if (!(days > 0) || !isValidMonthDay(month, day)) return null;
		const epoch = new Date(parseInt(yearStr as string, 10), month - 1, day);
		return new IntervalEntry(name, epoch, days, source);
	}

	// easter+N / orthodox-easter-N - moveable feasts
	const easterMatch = dateStr.match(/^(orthodox-)?easter(?:\s*([+-])\s*(\d+))?$/i);
	if (easterMatch) {
		const sign = easterMatch[2] === '-' ? -1 : 1;
		const offset = easterMatch[3] ? sign * parseInt(easterMatch[3], 10) : 0;
		return new EasterEntry(name, offset, easterMatch[1] ? 'julian' : 'gregorian', source);
	}

	// range:MM/DD-MM/DD - an annual span
	const rangeMatch = dateStr.match(/^range:(\d{1,2})\/(\d{1,2})-(\d{1,2})\/(\d{1,2})$/i);
	if (rangeMatch) {
		const [startMonth, startDay, endMonth, endDay] = rangeMatch
			.slice(1)
			.map((value) => parseInt(value as string, 10)) as number[];
		if (
			!isValidMonthDay(startMonth as number, startDay as number) ||
			!isValidMonthDay(endMonth as number, endDay as number)
		) {
			return null;
		}
		return new DateRangeEntry(
			name,
			startMonth as number,
			startDay as number,
			endMonth as number,
			endDay as number,
			source
		);
	}

	// YYYY-MM-DD - a single dated event
	const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (isoMatch) {
		const [, yearStr, monthStr, dayStr] = isoMatch as unknown as string[];
		const month = parseInt(monthStr as string, 10);
		const day = parseInt(dayStr as string, 10);
		if (!isValidMonthDay(month, day)) return null;
		return new OneTimeEntry(name, month, day, parseInt(yearStr as string, 10), source);
	}

	// MM/DD or MM/DD,YYYY
	if (dateStr.includes('/')) {
		const segments = dateStr.split('/');
		// a bare MM/DD/YYYY would silently drop its year; require the CSV column
		if (segments.length !== 2) return null;

		const [monthStr, dayStr] = segments;
		if (!monthStr || !dayStr) return null;

		const month = parseInt(monthStr, 10);
		const day = parseInt(dayStr, 10);

		if (!isValidMonthDay(month, day)) return null;

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

	// NWeekdayMonth (e.g., "3MondayJan")
	try {
		const { occurrence, dayOfWeek, month } = RelativeDateEntry.parseRelativeDate(dateStr);
		return new RelativeDateEntry(name, occurrence, dayOfWeek, month, source);
	} catch {
		return null;
	}
}

/**
 * Reads all .csv files in the data directory and its subdirectories.
 * @param dataDir - The root data directory (default: './src/data')
 * @returns Array of all Entry objects
 */
export function getAllEntries(dataDir: string = DATA_DIR): Entry[] {
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
 * Gets entries whose anchor date is a specific month and day (any year).
 *
 * Only entries that own a fixed month/day are considered:
 * {@link ExactDateEntry}, {@link ExactDateWithYearEntry} and
 * {@link OneTimeEntry}. Entries whose date is computed
 * ({@link RelativeDateEntry}, {@link IntervalEntry}, {@link EasterEntry}) or
 * that span a window ({@link DateRangeEntry}) never match; use
 * {@link getEntriesOnDate} for those.
 * @param entries - Array of entries to filter
 * @param month - Month (1-12)
 * @param day - Day of month
 * @returns Array of entries anchored to this month/day
 */
export function getEntriesOnMonthDay(entries: Entry[], month: number, day: number): Entry[] {
	return entries.filter((entry) => {
		if (
			entry instanceof ExactDateEntry ||
			entry instanceof ExactDateWithYearEntry ||
			entry instanceof OneTimeEntry
		) {
			return entry.month === month && entry.day === day;
		}
		return false;
	});
}

/**
 * Gets every occurrence of every entry that falls inside a date window.
 *
 * Unlike the `getEntriesInNext*` helpers, which only ever consider each entry's
 * single next occurrence, this expands recurring entries so a multi-year window
 * yields one result per year.
 * @param entries - Array of entries to expand
 * @param startDate - Start of the window (inclusive)
 * @param endDate - End of the window (inclusive)
 * @returns Entry/date pairs sorted by date
 */
export function getEntriesInRange(
	entries: Entry[],
	startDate: Date,
	endDate: Date
): Array<{ entry: Entry; date: Date }> {
	return entries
		.flatMap((entry) =>
			entry.getOccurrencesInRange(startDate, endDate).map((date) => ({ entry, date }))
		)
		.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Gets entries that came from a given data file or directory.
 *
 * Sources are recorded as forward-slash paths relative to the data directory,
 * so `'sports/'` matches every sports file and `'cosmic/eclipses.csv'` matches
 * exactly one.
 * @param entries - Array of entries to filter
 * @param source - A source path or path prefix
 * @returns Array of entries whose source starts with the given prefix
 */
export function getEntriesBySource(entries: Entry[], source: string): Entry[] {
	return entries.filter((entry) => entry.source?.startsWith(source) ?? false);
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
