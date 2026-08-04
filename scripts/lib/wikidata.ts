/**
 * Thin client for the Wikidata Query Service, used to generate and verify the
 * CSV data in `src/data`. Not part of the published package.
 */

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'moho-data-bot/1.0 (https://github.com/earth-app/moho; data generation)';

/** Wikidata time precision codes we care about. */
export const PRECISION = {
	YEAR: 9,
	MONTH: 10,
	DAY: 11
} as const;

/** Q-id of the proleptic Gregorian calendar, the only calendar model we accept. */
export const GREGORIAN = 'http://www.wikidata.org/entity/Q1985727';

export type Binding = Record<string, { value: string; type: string; datatype?: string }>;

/**
 * Runs a SPARQL query, retrying on the timeouts and 502s the public endpoint
 * regularly returns.
 * @param query - The SPARQL query text
 * @param attempts - How many times to try before giving up
 * @returns The result bindings
 */
export async function sparql(query: string, attempts = 5): Promise<Binding[]> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const response = await fetch(ENDPOINT, {
				method: 'POST',
				headers: {
					Accept: 'application/sparql-results+json',
					'Content-Type': 'application/x-www-form-urlencoded',
					'User-Agent': USER_AGENT
				},
				body: new URLSearchParams({ query }),
				signal: AbortSignal.timeout(120_000)
			});

			if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

			const json = (await response.json()) as { results: { bindings: Binding[] } };
			return json.results.bindings;
		} catch (error) {
			lastError = error;
			if (attempt < attempts) {
				const backoff = 2000 * 2 ** (attempt - 1);
				process.stderr.write(`  retry ${attempt}/${attempts - 1} in ${backoff}ms (${error})\n`);
				await new Promise((resolve) => setTimeout(resolve, backoff));
			}
		}
	}

	throw new Error(`SPARQL failed after ${attempts} attempts: ${lastError}`);
}

export type DatedItem = {
	qid: string;
	label: string;
	month: number;
	day: number;
	year: number;
	/** Which calendar the stated month/day belongs to. */
	calendar: 'gregorian' | 'julian';
	population: number | null;
};

/**
 * Turns raw bindings into items that carry a real calendar day.
 *
 * Rows whose date precision is coarser than a day are dropped rather than
 * guessed at: Wikidata stores "founded in 1521" as `1521-01-01`, and emitting
 * that as a January 1st birthday would be inventing a fact.
 *
 * Julian-model dates are kept as stated. A city founded in 1531 has its
 * founding day recorded, and celebrated, in the Julian calendar of the time;
 * silently converting it to a proleptic Gregorian day would disagree with every
 * source that quotes the date. The model is carried through so verification can
 * compare like with like.
 * @param bindings - Raw SPARQL bindings with item/itemLabel/date/precision vars
 * @returns The subset that has a genuine day-precision date
 */
export function toDatedItems(bindings: Binding[]): DatedItem[] {
	const byQid = new Map<string, DatedItem>();

	for (const row of bindings) {
		if (Number(row.precision?.value) !== PRECISION.DAY) continue;

		const label = row.itemLabel?.value?.trim();
		const iso = row.date?.value;
		const qid = row.item?.value?.split('/').pop();
		if (!label || !iso || !qid) continue;
		// unlabelled items come back as the bare Q-id
		if (/^Q\d+$/.test(label)) continue;

		const match = iso.match(/^(-?\d+)-(\d{2})-(\d{2})T/);
		if (!match) continue;

		const year = Number(match[1]);
		const month = Number(match[2]);
		const day = Number(match[3]);
		if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) continue;

		const calendar = row.calendar?.value === GREGORIAN ? 'gregorian' : 'julian';
		const population = row.population ? Number(row.population.value) : null;
		const existing = byQid.get(qid);
		// prefer the earliest inception when an item has several
		if (
			existing &&
			Date.UTC(existing.year, existing.month - 1, existing.day) <= Date.UTC(year, month - 1, day)
		) {
			continue;
		}

		byQid.set(qid, { qid, label, month, day, year, calendar, population });
	}

	return [...byQid.values()];
}

/**
 * Escapes a value for a CSV field, quoting it when it contains a comma or quote.
 * @param value - The raw field value
 * @returns A CSV-safe field
 */
export function csvField(value: string): string {
	return /[",]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Formats a dated item as a `Name's Birthday,MM/DD,YYYY` row.
 * @param item - The dated item
 * @param nameSuffix - Text appended to the label (default: `'s Birthday`)
 * @returns A single CSV line
 */
export function birthdayRow(item: DatedItem, nameSuffix = "'s Birthday"): string {
	// "Illinois' Birthday" reads better than "Illinois's Birthday"
	const suffix =
		nameSuffix === "'s Birthday" && item.label.endsWith('s') ? "' Birthday" : nameSuffix;
	const month = String(item.month).padStart(2, '0');
	const day = String(item.day).padStart(2, '0');
	return `${csvField(item.label + suffix)},${month}/${day},${item.year}`;
}

/**
 * Renders items as birthday rows, one per distinct label, ordered by label.
 *
 * Sorting on the label rather than the rendered row matters because a name
 * containing a comma gets quoted, and a leading `"` would otherwise sort the
 * whole row to the top of the file.
 * @param items - The dated items to render
 * @returns Sorted, de-duplicated CSV rows
 */
export function birthdayRows(items: DatedItem[]): string[] {
	const byLabel = new Map<string, DatedItem>();
	for (const item of items) {
		if (!byLabel.has(item.label)) byLabel.set(item.label, item);
	}

	return [...byLabel.values()]
		.sort((a, b) => a.label.localeCompare(b.label, 'en'))
		.map((item) => birthdayRow(item));
}
