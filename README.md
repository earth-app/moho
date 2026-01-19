# Moho

> 📚 An NPM package with a curated list of special events used by The Earth App

A powerful TypeScript library for working with calendar entries. Supports exact dates, recurring annual events, and relative dates (like "3rd Monday in January").

## Features

- 📅 **Multiple Date Formats**
  - Exact dates (recurring annually): `MM/DD`
  - Exact dates with year (one-time events): `MM/DD,YYYY`
  - Relative dates (e.g., "3rd Monday in January"): `NWeekdayMonth`

- 🔍 **Powerful Query Functions**
  - Find events in the next X days/weeks/months/years
  - Find events on a specific date
  - Filter by entry type

- 📊 **CSV Support**
  - Automatic format detection
  - Recursive directory reading
  - Handles multiple date formats in a single file

## Installation

```bash
npm install moho
# or
bun add moho
```

## Usage

### Basic Usage

```typescript
import { getEntries, getAllEntries, getEntriesInNextDays } from 'moho';

// Read entries from a single file
const events = getEntries('./data/events.csv');

// Read all entries from a directory (recursively)
const allEntries = getAllEntries('./data');

// Get events happening in the next 7 days
const upcoming = getEntriesInNextDays(allEntries, 7);
upcoming.forEach(({ entry, date }) => {
	console.log(`${entry.name} on ${date.toLocaleDateString()}`);
});
```

### Working with Different Entry Types

```typescript
import { ExactDateEntry, ExactDateWithYearEntry, RelativeDateEntry, getEntriesByType } from 'moho';

// Create entries programmatically
const newYear = new ExactDateEntry("New Year's Day", 1, 1);
const independence = new ExactDateWithYearEntry('USA Independence', 7, 4, 1776);
const mlkDay = new RelativeDateEntry('MLK Day', 3, 1, 1); // 3rd Monday in January

// Filter by type
const exactDateEvents = getEntriesByType(allEntries, ExactDateEntry);
const historicalEvents = getEntriesByType(allEntries, ExactDateWithYearEntry);
```

### Query Functions

```typescript
import {
	getEntriesInNextDays,
	getEntriesInNextWeeks,
	getEntriesInNextMonths,
	getEntriesOnDate,
	getEntriesOnMonthDay
} from 'moho';

const entries = getAllEntries('./data');

// Get entries in the next 30 days
const nextMonth = getEntriesInNextDays(entries, 30);

// Get entries in the next 2 weeks
const nextTwoWeeks = getEntriesInNextWeeks(entries, 2);

// Get entries in the next 6 months
const nextSixMonths = getEntriesInNextMonths(entries, 6);

// Get entries on a specific date
const today = new Date();
const todaysEvents = getEntriesOnDate(entries, today);

// Get entries on a specific month/day (any year)
const piDay = getEntriesOnMonthDay(entries, 3, 14); // March 14
```

### Working with Historical Events

```typescript
import { ExactDateWithYearEntry } from 'moho';

const independence = new ExactDateWithYearEntry('USA Independence', 7, 4, 1776);

// Get the anniversary for a specific year
const anniversary2026 = independence.getAnniversary(2026);
console.log(anniversary2026); // July 4, 2026

// Calculate years since the event
const yearsSince = independence.getYearsSince(new Date());
console.log(`${yearsSince} years ago`);
```

## CSV File Format

### Exact Dates (Recurring)

```csv
New Year's Day,01/01
Valentine's Day,02/14
Pi Day,03/14
```

### Exact Dates with Year (One-time)

```csv
Afghanistan,08/19,1919
United States,07/04,1776
France,07/14,1789
```

### Relative Dates

```csv
Martin Luther King Jr. Day,3MondayJan
Labor Day,1MondaySep
Thanksgiving,4ThursdayNov
```

Format: `{N}{Weekday}{Month}` where:

- `N` = occurrence number (1-5)
- `Weekday` = Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
- `Month` = Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec

## API Reference

### Classes

#### `Entry` (Abstract)

Base class for all entry types.

Methods:

- `getNextOccurrence(fromDate?: Date): Date`
- `occursOn(date: Date): boolean`
- `getOccurrencesInRange(startDate: Date, endDate: Date): Date[]`

#### `ExactDateEntry`

For events that recur annually on a specific month/day.

```typescript
new ExactDateEntry(name: string, month: number, day: number)
```

#### `ExactDateWithYearEntry`

For one-time events with a specific year.

```typescript
new ExactDateWithYearEntry(name: string, month: number, day: number, year: number)
```

Additional methods:

- `getAnniversary(year: number): Date`
- `getYearsSince(date?: Date): number`

#### `RelativeDateEntry`

For events that occur on a relative date (e.g., "3rd Monday in January").

```typescript
new RelativeDateEntry(name: string, occurrence: number, dayOfWeek: number, month: number)
```

### Functions

#### File Reading

- `getEntries(filePath: string): Entry[]` - Read entries from a CSV file
- `getAllEntries(dataDir?: string): Entry[]` - Read all CSV files recursively
- `parseCSVLine(line: string): Entry | null` - Parse a single CSV line

#### Querying

- `getEntriesInNextDays(entries: Entry[], days: number, fromDate?: Date)`
- `getEntriesInNextWeeks(entries: Entry[], weeks: number, fromDate?: Date)`
- `getEntriesInNextMonths(entries: Entry[], months: number, fromDate?: Date)`
- `getEntriesInNextYears(entries: Entry[], years: number, fromDate?: Date)`
- `getEntriesOnDate(entries: Entry[], date: Date): Entry[]`
- `getEntriesOnMonthDay(entries: Entry[], month: number, day: number): Entry[]`
- `getEntriesByType<T>(entries: Entry[], type: Constructor<T>): T[]`

## Development

```bash
# Install dependencies
bun install

# Run tests
bun run test

# Run tests with coverage
bun run test:coverage

# Run tests in watch mode
bun run test:watch

# Format code
bun run prettier

# Build
bun run build
```

## License

Apache 2.0 License
