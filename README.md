# Moho

> 📚 An NPM package with a curated list of special events used by The Earth App

A TypeScript library for working with calendar entries. Supports exact dates, recurring annual events, relative dates ("3rd Monday in January"), one-off astronomical events, periodic cycles, seasonal spans, and the moveable feasts.

## Features

- 📅 **Seven Date Formats**
  - Exact dates (recurring annually): `MM/DD`
  - Exact dates with year (historical): `MM/DD,YYYY`
  - Relative dates ("3rd Monday in January"): `NWeekdayMonth`, and `LWeekdayMonth` for the last in the month
  - One-off dated events (eclipses, comet returns): `YYYY-MM-DD`
  - Periodic cycles (orbital periods, the saros): `every:DAYS:YYYY-MM-DD`
  - Annual spans (sports seasons, zodiac signs): `range:MM/DD-MM/DD`
  - Moveable feasts, Western and Orthodox: `easter+N` / `orthodox-easter+N`

- 🔍 **Query Functions**
  - Find events in the next X days/weeks/months/years
  - Expand every occurrence across a date range
  - Find events on a specific date, or filter by type or source file

- 📊 **CSV Support**
  - Automatic format detection
  - RFC 4180 quoted fields, so names may contain commas
  - `#` comment lines for provenance
  - Recursive directory reading, with the bundled data resolvable from anywhere

- ✅ **Verified Data**
  - Place, institution and club birthdays are generated from Wikidata, day precision only
  - A checked-in fact snapshot is asserted by the test suite on every run

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

The parser picks the entry type from the shape of the second field.

| Format                  | Type                     | Example                                |
| ----------------------- | ------------------------ | -------------------------------------- |
| `MM/DD`                 | `ExactDateEntry`         | `Pi Day,03/14`                         |
| `MM/DD,YYYY`            | `ExactDateWithYearEntry` | `Afghanistan's Birthday,08/19,1919`    |
| `NWeekdayMonth`         | `RelativeDateEntry`      | `Labor Day,1MondaySep`                 |
| `LWeekdayMonth`         | `RelativeDateEntry`      | `Memorial Day,LMondayMay`              |
| `YYYY-MM-DD`            | `OneTimeEntry`           | `Total Solar Eclipse,2026-08-12`       |
| `every:DAYS:YYYY-MM-DD` | `IntervalEntry`          | `Mars Orbit,every:686.98:2000-01-01`   |
| `range:MM/DD-MM/DD`     | `DateRangeEntry`         | `NFL Regular Season,range:09/04-01/05` |
| `easter[+-]N`           | `EasterEntry`            | `Good Friday,easter-2`                 |
| `orthodox-easter[+-]N`  | `EasterEntry`            | `Orthodox Easter,orthodox-easter+0`    |

Lines beginning with `#` are comments. Names containing a comma must be double-quoted, RFC 4180 style:

```csv
# generated from Wikidata
"Nike, Inc's Birthday",01/25,1964
```

### Relative Dates

Format: `{N}{Weekday}{Month}` where:

- `N` = occurrence number (1-5), or `L` for the last one in the month
- `Weekday` = Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
- `Month` = Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec

`L` matters: Memorial Day is the _last_ Monday in May, which is the fourth Monday in most years and the fifth in others.

### Spans

A `range:` whose end falls before its start wraps into the next year, which is how most sports seasons and two zodiac signs behave. `occursOn` returns true for every day inside the span, endpoints included.

```csv
NFL Regular Season,range:09/04-01/05
Capricorn,range:12/22-01/19
```

### Cycles

`every:DAYS:YYYY-MM-DD` repeats on a fixed period, anchored to an epoch. The period may be fractional; occurrences round to the nearest whole day, and day arithmetic is DST-safe.

```csv
Synodic Month (New Moon to New Moon),every:29.530589:2026-01-18
Saros Cycle (Eclipse Repeat),every:6585.3211:2017-08-21
```

## Bundled Data

`getAllEntries()` with no arguments reads the data shipped with the package, resolved from the module's own location.

| Directory        | Contents                                                                         |
| ---------------- | -------------------------------------------------------------------------------- |
| `events.csv`     | Fixed-date observances                                                           |
| `events_d.csv`   | Relative-date observances                                                        |
| `events_e.csv`   | Moveable feasts, Western and Orthodox                                            |
| `anniversaries/` | Dated milestones by domain                                                       |
| `birthdays/`     | Countries, companies, international bodies, and places across 27 country folders |
| `cosmic/`        | Equinoxes, eclipses, comets, orbits, cycles, meteor showers, zodiac              |
| `sports/`        | League calendars, motorsport, football, Olympics, clubs and governing bodies     |

Every entry carries a `source` field holding its data-relative path, so `getEntriesBySource(entries, 'cosmic/')` retrieves a whole domain.

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

Pass `RelativeDateEntry.LAST` as the occurrence for the last weekday of the month.

#### `OneTimeEntry`

For something that happens exactly once, on a known calendar day.

```typescript
new OneTimeEntry(name: string, month: number, day: number, year: number)
```

Additional members:

- `date: Date` - the event day, at local midnight
- `hasOccurred(fromDate?: Date): boolean`

#### `IntervalEntry`

For a cycle that repeats on a fixed period in days, anchored to an epoch.

```typescript
new IntervalEntry(name: string, epoch: Date, intervalDays: number)
```

Additional methods:

- `getOccurrence(n: number): Date` - the nth cycle; 0 is the epoch, negatives run backwards
- `getCycleAt(date: Date): number`

#### `DateRangeEntry`

For an annually recurring span. `occursOn` is true anywhere inside it.

```typescript
new DateRangeEntry(name: string, startMonth: number, startDay: number, endMonth: number, endDay: number)
```

Additional members:

- `wrapsYear: boolean`
- `getRangeFor(year: number): { start: Date; end: Date }`

#### `EasterEntry`

For a feast positioned a fixed number of days from Easter Sunday.

```typescript
new EasterEntry(name: string, offsetDays: number, calendar?: 'gregorian' | 'julian')
```

Additional members:

- `static computeEaster(year: number, calendar?): Date`
- `getDateFor(year: number): Date`

### Functions

#### File Reading

- `getEntries(filePath: string, dataDir?: string): Entry[]` - Read entries from a CSV file
- `getAllEntries(dataDir?: string): Entry[]` - Read all CSV files recursively; defaults to the bundled data
- `parseCSVLine(line: string, source?: string): Entry | null` - Parse a single CSV line
- `splitCSVFields(line: string): string[]` - Split a line into RFC 4180 fields
- `DATA_DIR: string` - Absolute path to the bundled data

#### Querying

- `getEntriesInNextDays(entries: Entry[], days: number, fromDate?: Date)`
- `getEntriesInNextWeeks(entries: Entry[], weeks: number, fromDate?: Date)`
- `getEntriesInNextMonths(entries: Entry[], months: number, fromDate?: Date)`
- `getEntriesInNextYears(entries: Entry[], years: number, fromDate?: Date)`
- `getEntriesInRange(entries: Entry[], startDate: Date, endDate: Date)` - every occurrence, not just the next one
- `getEntriesOnDate(entries: Entry[], date: Date): Entry[]`
- `getEntriesOnMonthDay(entries: Entry[], month: number, day: number): Entry[]`
- `getEntriesByType<T>(entries: Entry[], type: Constructor<T>): T[]`
- `getEntriesBySource(entries: Entry[], source: string): Entry[]`

## Data Provenance and Verification

Place, institution and club birthdays are generated from the Wikidata Query Service, using `P571` (inception) and `P1619` (date of official opening). Only **day-precision** dates are kept: Wikidata stores "founded in 1521" as `1521-01-01`, and emitting that as a January 1st birthday would invent a fact that does not exist. Dates before 1582 are recorded as stated in the Julian calendar, matching the sources that quote them.

`scripts/verify-data.ts` resolves every dated row back to a Wikidata item and writes `test/fixtures/verified-facts.json`. `test/data-verification.test.ts` asserts the CSVs against that snapshot offline, so the gate suite stays hermetic while still being checked against a real external source.

The snapshot has two halves:

- **`agreed`** - the CSV and Wikidata state the same date. The gate asserts these strictly, so editing either side fails the build.
- **`divergent`** - they disagree, and both values are recorded. Most divergences are definitional rather than wrong: `countries.csv` dates Afghanistan to its 1919 independence where Wikidata reaches back to the 1747 founding of the Durrani Empire, and `companies.csv` dates ExxonMobil to the 1999 merger where Wikidata reaches back to Standard Oil in 1882. The gate pins the CSV side of each divergence so it cannot drift unreviewed.

Rows that cannot be resolved unambiguously are counted but not asserted. A name that matches several Wikidata items with conflicting dates is dropped rather than guessed at, which is why `us/cities.csv` verifies fewer rows than it holds.

```bash
bun run data:all         # regenerate every generated data file
bun run verify:refresh   # rebuild the snapshot and print a divergence report
bun run test:live        # check the snapshot still agrees with live Wikidata
```

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
