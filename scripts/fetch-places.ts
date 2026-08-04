/**
 * Generates `src/data/birthdays/<country>/{cities,<subdivisions>}.csv` from
 * Wikidata inception dates.
 *
 * Usage:
 *   bun run scripts/fetch-places.ts            # every configured country
 *   bun run scripts/fetch-places.ts mx br      # only these country codes
 */

import fs from 'fs';
import path from 'path';
import { COUNTRIES, type CountryConfig } from './lib/countries.ts';
import { birthdayRows, sparql, toDatedItems, type DatedItem } from './lib/wikidata.ts';

const DATA_DIR = path.join(import.meta.dirname, '..', 'src', 'data', 'birthdays');

const DATE_BLOCK = `
	{ ?item p:P571/psv:P571 ?node } UNION { ?item p:P1619/psv:P1619 ?node }
	?node wikibase:timeValue ?date ;
	      wikibase:timePrecision ?precision ;
	      wikibase:timeCalendarModel ?calendar .
	SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
`;

/**
 * Settlement classes matched directly, without walking `P279*`.
 *
 * The subclass walk under "human settlement" is broad enough that the public
 * endpoint times out on it, so the classes are listed instead: city, town,
 * village, municipality, big city, capital, human settlement, borough,
 * commune of France, urban-type settlement, and city/town of the relevant
 * national types.
 */
const SETTLEMENT_CLASSES = [
	'Q515',
	'Q3957',
	'Q532',
	'Q15284',
	'Q1549591',
	'Q5119',
	'Q486972',
	'Q5195043',
	'Q484170',
	'Q2039348',
	'Q1637706',
	'Q11618417'
]
	.map((qid) => `wd:${qid}`)
	.join(' ');

/**
 * Builds the query for a country's populated places.
 *
 * The direct VALUES match and the Q515 subclass walk each find places the other
 * misses, so the preferred query unions both. That is heavy enough that the
 * public endpoint sometimes times out, hence the narrower fallback.
 * @param country - The country configuration
 * @returns Preferred query first, then progressively cheaper fallbacks
 */
function citiesQueries(country: CountryConfig): string[] {
	const wrap = (selector: string) =>
		`SELECT ?item ?itemLabel ?date ?precision ?calendar ?population WHERE {
	${selector}
	?item wdt:P17 wd:${country.qid} .
	OPTIONAL { ?item wdt:P1082 ?population }
	${DATE_BLOCK}
}`;

	return [
		wrap(`{
		VALUES ?class { ${SETTLEMENT_CLASSES} }
		?item wdt:P31 ?class .
	} UNION {
		?item wdt:P31/wdt:P279* wd:Q515 .
	}`),
		wrap(`VALUES ?class { ${SETTLEMENT_CLASSES} }
	?item wdt:P31 ?class .`),
		wrap('?item wdt:P31/wdt:P279* wd:Q515 .')
	];
}

/**
 * Builds the query for a country's first-level administrative subdivisions.
 * @param country - The country configuration
 * @returns SPARQL query text
 */
function subdivisionsQuery(country: CountryConfig): string {
	const hop = country.subdivisionDepth === 2 ? 'wdt:P150/wdt:P150' : 'wdt:P150';
	return `SELECT ?item ?itemLabel ?date ?precision ?calendar ?population WHERE {
	wd:${country.qid} ${hop} ?item .
	OPTIONAL { ?item wdt:P1082 ?population }
	${DATE_BLOCK}
}`;
}

/**
 * Most rows kept per file. France alone has over 1800 communes with a dated
 * inception, nearly all of them 20th-century administrative mergers of very
 * small villages; keeping every one would drown the rest of the dataset. The
 * cap keeps the most populous places, and the drop count is reported.
 */
const MAX_ROWS_PER_FILE = 150;

/**
 * Writes a sorted, de-duplicated CSV of birthday rows, capped by population.
 * @param file - Absolute path to write
 * @param items - The dated items to render
 * @param header - Provenance comment placed at the top of the file
 * @returns The number of rows written and the number dropped by the cap
 */
function writeCsv(
	file: string,
	items: DatedItem[],
	header: string
): { written: number; dropped: number } {
	const byName = new Map<string, DatedItem>();
	for (const item of items) {
		// keep the first of any name collision so output stays deterministic
		if (!byName.has(item.label)) byName.set(item.label, item);
	}

	const ranked = [...byName.values()].sort(
		(a, b) => (b.population ?? -1) - (a.population ?? -1) || a.label.localeCompare(b.label, 'en')
	);
	const kept = ranked.slice(0, MAX_ROWS_PER_FILE);
	const dropped = ranked.length - kept.length;

	if (kept.length === 0) return { written: 0, dropped };

	const rows = birthdayRows(kept);
	const capNote = dropped
		? `\n# capped at the ${MAX_ROWS_PER_FILE} most populous; ${dropped} further dated place(s) omitted`
		: '';

	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${header}${capNote}\n${rows.join('\n')}\n`);
	return { written: rows.length, dropped };
}

const requested = process.argv.slice(2);
const targets = requested.length ? COUNTRIES.filter((c) => requested.includes(c.code)) : COUNTRIES;

if (requested.length && targets.length !== requested.length) {
	const known = new Set(targets.map((c) => c.code));
	throw new Error(`Unknown country code(s): ${requested.filter((c) => !known.has(c)).join(', ')}`);
}

for (const country of targets) {
	for (const kind of ['cities', 'subdivisions'] as const) {
		const isCities = kind === 'cities';
		const filename = isCities ? 'cities' : country.subdivisionFile;
		// a country with no subdivisionFile keeps a hand-maintained one
		if (!filename) continue;

		const queries = isCities ? citiesQueries(country) : [subdivisionsQuery(country)];

		process.stdout.write(`${country.name} (${country.code}) ${filename}... `);
		let bindings;
		for (const [index, query] of queries.entries()) {
			try {
				bindings = await sparql(query, 3);
				if (index > 0) process.stdout.write(`[fallback ${index}] `);
				break;
			} catch (error) {
				if (index === queries.length - 1) {
					// one country timing out must not abandon the other twenty-four
					process.stdout.write(`SKIPPED (${error})\n`);
				}
			}
		}
		if (!bindings) continue;

		const items = toDatedItems(bindings);
		const header =
			'# generated by scripts/fetch-places.ts from Wikidata (P571 inception / P1619 official opening)\n' +
			'# day-precision dates only; dates before 1582 are as stated in the Julian calendar';
		const { written, dropped } = writeCsv(
			path.join(DATA_DIR, country.code, `${filename}.csv`),
			items,
			header
		);
		const note = dropped ? ` (${dropped} dropped by cap)` : '';
		process.stdout.write(
			`${bindings.length} raw -> ${items.length} dated -> ${written} rows${note}\n`
		);

		// be a good citizen on a shared public endpoint
		await new Promise((resolve) => setTimeout(resolve, 1500));
	}
}
