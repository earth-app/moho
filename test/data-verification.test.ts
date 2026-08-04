import { describe, expect, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, ExactDateWithYearEntry, getEntries } from '../src/index';

/**
 * A date recorded from Wikidata for one entry, captured by
 * `bun run verify:refresh` (see `scripts/verify-data.ts`).
 */
type Fact = {
	qid: string;
	month: number;
	day: number;
	year: number;
	calendar: 'gregorian' | 'julian';
};

type Snapshot = {
	source: string;
	/** Rows where the CSV and Wikidata agree. */
	agreed: Record<string, Record<string, Fact>>;
	/** Rows where they disagree, carrying both values. */
	divergent: Record<string, Record<string, Fact & { csv: string }>>;
	unresolvedCount: Record<string, number>;
};

const snapshot = JSON.parse(
	fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'verified-facts.json'), 'utf-8')
) as Snapshot;

/**
 * Loads a data file's dated entries, keyed by name.
 * @param file - Data-relative path
 * @returns Entry name mapped to its parsed entry
 */
function datedEntries(file: string): Map<string, ExactDateWithYearEntry> {
	return new Map(
		getEntries(path.join(DATA_DIR, file))
			.filter((entry): entry is ExactDateWithYearEntry => entry instanceof ExactDateWithYearEntry)
			.map((entry) => [entry.name, entry])
	);
}

/**
 * Renders a date as `MM/DD/YYYY`.
 * @param value - Month, day and year
 * @returns The formatted date
 */
function format(value: { month: number; day: number; year: number }): string {
	return `${String(value.month).padStart(2, '0')}/${String(value.day).padStart(2, '0')}/${value.year}`;
}

const agreedFiles = Object.keys(snapshot.agreed);
const divergentFiles = Object.keys(snapshot.divergent);

describe('Data Verification', () => {
	test('the snapshot covers a meaningful share of the dataset', () => {
		const total = Object.values(snapshot.agreed).reduce(
			(sum, facts) => sum + Object.keys(facts).length,
			0
		);
		// guards against the snapshot silently emptying out and the suite going green
		expect(total).toBeGreaterThan(1500);
		expect(agreedFiles.length).toBeGreaterThan(15);
	});

	test('agreements outnumber divergences by a wide margin', () => {
		const count = (group: Record<string, Record<string, unknown>>) =>
			Object.values(group).reduce((sum, facts) => sum + Object.keys(facts).length, 0);
		const agreed = count(snapshot.agreed);
		const divergent = count(snapshot.divergent);
		expect(divergent / (agreed + divergent)).toBeLessThan(0.1);
	});

	describe.each(agreedFiles)('%s (agreed)', (file) => {
		const facts = snapshot.agreed[file] ?? {};
		const entries = datedEntries(file);

		test('every verified row still matches its Wikidata date', () => {
			const mismatches = Object.entries(facts)
				.filter(([name]) => entries.has(name))
				.filter(([name, fact]) => {
					const entry = entries.get(name) as ExactDateWithYearEntry;
					return entry.month !== fact.month || entry.day !== fact.day || entry.year !== fact.year;
				})
				.map(([name, fact]) => {
					const entry = entries.get(name) as ExactDateWithYearEntry;
					return `${name}: CSV now says ${format(entry)}, Wikidata ${fact.qid} says ${format(fact)}`;
				});
			expect(mismatches).toEqual([]);
		});

		test('every verified row still exists in the data file', () => {
			const missing = Object.keys(facts).filter((name) => !entries.has(name));
			expect(missing).toEqual([]);
		});
	});

	describe.each(divergentFiles)('%s (divergent)', (file) => {
		const facts = snapshot.divergent[file] ?? {};
		const entries = datedEntries(file);

		test('each known divergence still holds the reviewed CSV value', () => {
			// a divergence is usually definitional, not an error: countries.csv records
			// Afghanistan's 1919 independence where Wikidata records the 1747 founding.
			// Pinning the CSV side means the value cannot drift without a refresh.
			const drifted = Object.entries(facts)
				.filter(([name]) => entries.has(name))
				.filter(([name, fact]) => format(entries.get(name) as ExactDateWithYearEntry) !== fact.csv)
				.map(([name, fact]) => {
					const entry = entries.get(name) as ExactDateWithYearEntry;
					return `${name}: recorded ${fact.csv}, CSV now says ${format(entry)}`;
				});
			expect(drifted).toEqual([]);
		});

		test('every divergent row still exists in the data file', () => {
			const missing = Object.keys(facts).filter((name) => !entries.has(name));
			expect(missing).toEqual([]);
		});
	});
});
