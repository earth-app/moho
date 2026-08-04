/**
 * Rebuilds `test/fixtures/verified-facts.json`, the snapshot the data
 * verification gate test compares the CSVs against.
 *
 * Every `Name,MM/DD,YYYY` row in the birthday and sports data is resolved to a
 * Wikidata item by label and its inception date recorded. The gate test then
 * runs offline against that snapshot, so the test suite stays hermetic and fast
 * while still checking the data against a real external source.
 *
 * Run this when the data changes, then review the mismatch report it prints.
 *
 * Usage:
 *   bun run scripts/verify-data.ts             # every verifiable file
 *   bun run scripts/verify-data.ts countries   # only files matching a substring
 */

import fs from 'fs';
import path from 'path';
import { COUNTRIES } from './lib/countries.ts';
import { sparql, type Binding } from './lib/wikidata.ts';

const ROOT = path.join(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'src', 'data');
const SNAPSHOT = path.join(ROOT, 'test', 'fixtures', 'verified-facts.json');

/**
 * Which Wikidata class each data file's entries should belong to. Constraining
 * the lookup by class is what stops "Jackson" the city resolving to Jackson the
 * president. Files absent from this map are not verifiable against Wikidata and
 * are left to the structural tests.
 */
const FILE_CLASSES: Record<string, string[]> = {
	'birthdays/countries.csv': ['Q6256', 'Q3624078'],
	'birthdays/companies.csv': ['Q4830453', 'Q6881511', 'Q891723', 'Q783794'],
	'birthdays/international_orgs.csv': ['Q484652', 'Q245065', 'Q43229'],
	'birthdays/us/cities.csv': ['Q515', 'Q1093829', 'Q62049'],
	'birthdays/us/counties.csv': ['Q47168', 'Q13360155'],
	'birthdays/us/colleges.csv': ['Q38723', 'Q3918', 'Q1663017'],
	'birthdays/us/territories.csv': ['Q35657', 'Q783733'],
	'birthdays/ca/cities.csv': ['Q515', 'Q3327873'],
	'birthdays/ca/provinces.csv': ['Q11828004', 'Q1352230'],
	'sports/clubs.csv': ['Q847017', 'Q476028'],
	'sports/organizations.csv': ['Q623109', 'Q4438121', 'Q2367225', 'Q1079023']
};

/** Files matching these prefixes are generated from Wikidata and share its classes. */
const GENERATED_PLACE_CLASSES = ['Q515', 'Q3957', 'Q532', 'Q15284', 'Q486972', 'Q10864048'];

/**
 * Country Q-id for each `birthdays/<code>/` folder, so a place lookup is pinned
 * to the right country. Without this, "Toronto" resolves to whichever Toronto
 * happens to carry a day-precision date, and "Hamilton" and "Windsor" exist on
 * three continents apiece.
 */
const COUNTRY_QIDS: Record<string, string> = {
	us: 'Q30',
	...Object.fromEntries(COUNTRIES.map((country) => [country.code, country.qid]))
};

/**
 * Resolves the country constraint for a data file, if it has one.
 * @param file - Data-relative path
 * @returns A Wikidata country Q-id, or undefined for files that span countries
 */
function countryFor(file: string): string | undefined {
	const match = file.match(/^birthdays\/([a-z]{2})\//);
	return match?.[1] ? COUNTRY_QIDS[match[1]] : undefined;
}

const LABEL_SUFFIXES = [/'s Birthday$/, /' Birthday$/];
const BATCH_SIZE = 60;

/**
 * US state and territory codes used as disambiguators in the data, mapped to
 * the full name Wikidata puts in its labels ("Arlington, Texas").
 *
 * Without this, stripping "(TX)" from "Arlington (TX)" leaves "Arlington",
 * which four separate rows in `us/cities.csv` all collapse onto - and they then
 * all resolve to whichever Arlington happens to carry a day-precision date.
 */
const US_STATES: Record<string, string> = {
	AL: 'Alabama',
	AK: 'Alaska',
	AZ: 'Arizona',
	AR: 'Arkansas',
	CA: 'California',
	CO: 'Colorado',
	CT: 'Connecticut',
	DE: 'Delaware',
	DC: 'District of Columbia',
	FL: 'Florida',
	GA: 'Georgia',
	HI: 'Hawaii',
	ID: 'Idaho',
	IL: 'Illinois',
	IN: 'Indiana',
	IA: 'Iowa',
	KS: 'Kansas',
	KY: 'Kentucky',
	LA: 'Louisiana',
	ME: 'Maine',
	MD: 'Maryland',
	MA: 'Massachusetts',
	MI: 'Michigan',
	MN: 'Minnesota',
	MS: 'Mississippi',
	MO: 'Missouri',
	MT: 'Montana',
	NE: 'Nebraska',
	NV: 'Nevada',
	NH: 'New Hampshire',
	NJ: 'New Jersey',
	NM: 'New Mexico',
	NY: 'New York',
	NC: 'North Carolina',
	ND: 'North Dakota',
	OH: 'Ohio',
	OK: 'Oklahoma',
	OR: 'Oregon',
	PA: 'Pennsylvania',
	RI: 'Rhode Island',
	SC: 'South Carolina',
	SD: 'South Dakota',
	TN: 'Tennessee',
	TX: 'Texas',
	UT: 'Utah',
	VT: 'Vermont',
	VA: 'Virginia',
	WA: 'Washington',
	WV: 'West Virginia',
	WI: 'Wisconsin',
	WY: 'Wyoming',
	PR: 'Puerto Rico',
	GU: 'Guam',
	VI: 'United States Virgin Islands'
};

type Fact = {
	qid: string;
	month: number;
	day: number;
	year: number;
	calendar: 'gregorian' | 'julian';
};

/**
 * Recursively lists the CSV files under the data directory.
 * @param dir - Directory to walk
 * @returns Data-relative forward-slash paths
 */
function listCsvFiles(dir: string): string[] {
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

/**
 * Reads the `Name,MM/DD,YYYY` rows of a data file.
 * @param relative - Data-relative path
 * @returns The entry name mapped to its stated date
 */
function readDatedRows(
	relative: string
): Map<string, { month: number; day: number; year: number }> {
	const rows = new Map<string, { month: number; day: number; year: number }>();
	const text = fs.readFileSync(path.join(DATA_DIR, relative), 'utf-8');

	for (const line of text.split('\n')) {
		if (!line.trim() || line.startsWith('#')) continue;
		const match = line.match(/^("(?:[^"]|"")*"|[^,]*),(\d{2})\/(\d{2}),(\d{4})$/);
		if (!match) continue;
		const name = (match[1] as string).replace(/^"|"$/g, '').replace(/""/g, '"');
		rows.set(name, {
			month: Number(match[2]),
			day: Number(match[3]),
			year: Number(match[4])
		});
	}

	return rows;
}

/**
 * Strips the birthday suffix and any trailing disambiguator to recover the
 * label Wikidata is likely to hold.
 * @param name - The CSV entry name
 * @returns Candidate labels, most specific first
 */
function candidateLabels(name: string): string[] {
	let base = name;
	for (const suffix of LABEL_SUFFIXES) base = base.replace(suffix, '');
	base = base.trim();

	const stateMatch = base.match(/^(.*?)\s*\(([A-Z]{2})\)$/);
	if (stateMatch) {
		const [, place, code] = stateMatch as unknown as string[];
		const state = US_STATES[code as string];
		// a state disambiguator exists precisely because the bare name is
		// ambiguous, so never fall back to it - an unresolved row beats a
		// confidently wrong one
		return state ? [`${place}, ${state}`] : [base];
	}

	const candidates = new Set<string>([base]);
	// "Nike, Inc" -> "Nike"
	const withoutSuffixCompany = base.replace(/,?\s+(Inc|Corp|Ltd|LLC|Co)\.?$/i, '').trim();
	if (withoutSuffixCompany) candidates.add(withoutSuffixCompany);

	return [...candidates];
}

/**
 * Escapes a label for use in a SPARQL string literal.
 * @param label - The raw label
 * @returns The escaped literal body
 */
function escapeLiteral(label: string): string {
	return label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Resolves each label to the single Wikidata item it most likely names.
 *
 * Identity is settled before any date is looked at. Joining the two in one
 * query lets the date requirement pick the entity: "Houston" then resolves to a
 * village in Alaska, because Houston, Texas has no day-precision inception and
 * so never appears in the results at all. Resolving identity first means the
 * Texan city wins on notability and the row is simply left unverified.
 * @param labels - The labels to look up
 * @param classes - Wikidata class Q-ids constraining the match
 * @param countryQid - Optional country to pin the match to
 * @returns Label mapped to the chosen Q-id
 */
async function resolveIdentities(
	labels: string[],
	classes: string[],
	countryQid?: string
): Promise<Map<string, string>> {
	const values = labels.map((label) => `"${escapeLiteral(label)}"@en`).join(' ');
	const classValues = classes.map((qid) => `wd:${qid}`).join(' ');
	const countryClause = countryQid ? `?item wdt:P17 wd:${countryQid} .` : '';

	const bindings = await sparql(`SELECT ?item ?label ?links WHERE {
	VALUES ?label { ${values} }
	VALUES ?class { ${classValues} }
	?item rdfs:label ?label ;
	      wdt:P31/wdt:P279* ?class ;
	      wikibase:sitelinks ?links .
	${countryClause}
}`);

	const byLabel = new Map<string, Array<{ qid: string; links: number }>>();
	for (const row of bindings) {
		const label = row.label?.value;
		const qid = row.item?.value?.split('/').pop();
		if (!label || !qid) continue;
		if (!byLabel.has(label)) byLabel.set(label, []);
		byLabel.get(label)?.push({ qid, links: Number(row.links?.value ?? 0) });
	}

	const chosen = new Map<string, string>();
	for (const [label, options] of byLabel) {
		const deduped = [...new Map(options.map((o) => [o.qid, o])).values()].sort(
			(a, b) => b.links - a.links
		);
		const best = deduped[0];
		if (!best) continue;
		// a tie on notability means the candidates are indistinguishable
		if (deduped.length > 1 && (deduped[1] as { links: number }).links === best.links) continue;
		chosen.set(label, best.qid);
	}

	return chosen;
}

/**
 * Reads day-precision inception dates for a batch of already-chosen items.
 * @param qids - Wikidata item identifiers
 * @returns Raw bindings
 */
async function fetchDates(qids: string[]): Promise<Binding[]> {
	return sparql(`SELECT ?item ?date ?precision ?calendar WHERE {
	VALUES ?item { ${qids.map((qid) => `wd:${qid}`).join(' ')} }
	{ ?item p:P571/psv:P571 ?node } UNION { ?item p:P1619/psv:P1619 ?node }
	?node wikibase:timeValue ?date ;
	      wikibase:timePrecision ?precision ;
	      wikibase:timeCalendarModel ?calendar .
}`);
}

/**
 * Reduces date bindings to one fact per item, keeping the earliest.
 *
 * An item often carries several inception statements (a settlement date and a
 * later incorporation, say); the earliest is the one that reads as a founding.
 * @param bindings - Raw bindings from {@link fetchDates}
 * @returns Q-id mapped to its earliest day-precision date
 */
function collapseDates(bindings: Binding[]): Map<string, Fact> {
	const facts = new Map<string, Fact>();

	for (const row of bindings) {
		if (Number(row.precision?.value) !== 11) continue;
		const iso = row.date?.value;
		const qid = row.item?.value?.split('/').pop();
		if (!iso || !qid) continue;

		const match = iso.match(/^(-?\d+)-(\d{2})-(\d{2})T/);
		if (!match) continue;

		const fact: Fact = {
			qid,
			year: Number(match[1]),
			month: Number(match[2]),
			day: Number(match[3]),
			calendar:
				row.calendar?.value === 'http://www.wikidata.org/entity/Q1985727' ? 'gregorian' : 'julian'
		};

		const existing = facts.get(qid);
		if (
			existing &&
			Date.UTC(existing.year, existing.month - 1, existing.day) <=
				Date.UTC(fact.year, fact.month - 1, fact.day)
		) {
			continue;
		}

		facts.set(qid, fact);
	}

	return facts;
}

const filter = process.argv[2];
const files = listCsvFiles(DATA_DIR).filter((file) => {
	if (filter && !file.includes(filter)) return false;
	return file in FILE_CLASSES || /^birthdays\/[a-z]{2}\//.test(file);
});

/**
 * Rows where the CSV and Wikidata agree. These are asserted strictly: any later
 * edit to one of them fails the gate.
 */
const agreed: Record<string, Record<string, Fact>> = {};

/**
 * Rows where the CSV and Wikidata disagree. Most are definitional rather than
 * wrong - `countries.csv` records Afghanistan's 1919 independence where Wikidata
 * records the 1747 founding of the Durrani Empire, and `companies.csv` records
 * ExxonMobil's 1999 merger where Wikidata reaches back to Standard Oil in 1882.
 * Both values are recorded so the divergence is visible and reviewable, and the
 * gate pins the CSV side so it cannot drift unnoticed.
 */
const divergent: Record<string, Record<string, Fact & { csv: string }>> = {};

const unresolved: Record<string, string[]> = {};
const mismatches: string[] = [];
let checked = 0;

// a filtered run visits only some files, so seed from what is already recorded
// rather than dropping every file it did not look at
if (filter && fs.existsSync(SNAPSHOT)) {
	const existing = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf-8')) as {
		agreed?: typeof agreed;
		divergent?: typeof divergent;
	};
	Object.assign(agreed, existing.agreed ?? {});
	Object.assign(divergent, existing.divergent ?? {});
	process.stdout.write(`merging into existing snapshot (filter: ${filter})\n`);
}

for (const file of files) {
	const rows = readDatedRows(file);
	if (rows.size === 0) continue;

	// a re-visited file is rebuilt from scratch, so clear any seeded entries
	delete agreed[file];
	delete divergent[file];

	const classes = FILE_CLASSES[file] ?? GENERATED_PLACE_CLASSES;
	const countryQid = countryFor(file);
	const names = [...rows.keys()];
	const labelToNames = new Map<string, string[]>();
	for (const name of names) {
		for (const label of candidateLabels(name)) {
			if (!labelToNames.has(label)) labelToNames.set(label, []);
			labelToNames.get(label)?.push(name);
		}
	}

	const labels = [...labelToNames.keys()];
	const resolved = new Map<string, Fact>();

	process.stdout.write(`${file}: ${names.length} rows, ${labels.length} labels`);
	for (let i = 0; i < labels.length; i += BATCH_SIZE) {
		const batch = labels.slice(i, i + BATCH_SIZE);
		try {
			const identities = await resolveIdentities(batch, classes, countryQid);
			if (identities.size === 0) continue;

			await new Promise((r) => setTimeout(r, 400));
			const dates = collapseDates(await fetchDates([...new Set(identities.values())]));
			for (const [label, qid] of identities) {
				const fact = dates.get(qid);
				if (fact) resolved.set(label, fact);
			}
		} catch (error) {
			process.stdout.write(` [batch ${i / BATCH_SIZE} failed: ${error}]`);
		}
		await new Promise((r) => setTimeout(r, 800));
	}

	const fileAgreed: Record<string, Fact> = {};
	const fileDivergent: Record<string, Fact & { csv: string }> = {};
	const fileUnresolved: string[] = [];

	for (const name of names) {
		const label = candidateLabels(name).find((candidate) => resolved.has(candidate));
		const fact = label ? resolved.get(label) : undefined;
		const stated = rows.get(name);
		if (!fact || !stated) {
			fileUnresolved.push(name);
			continue;
		}

		checked++;
		if (stated.month === fact.month && stated.day === fact.day && stated.year === fact.year) {
			fileAgreed[name] = fact;
			continue;
		}

		const statedText = `${String(stated.month).padStart(2, '0')}/${String(stated.day).padStart(2, '0')}/${stated.year}`;
		const factText = `${String(fact.month).padStart(2, '0')}/${String(fact.day).padStart(2, '0')}/${fact.year}`;
		fileDivergent[name] = { ...fact, csv: statedText };
		mismatches.push(`${file}\t${name}\tCSV ${statedText}\tWikidata ${factText}\t${fact.qid}`);
	}

	if (Object.keys(fileAgreed).length) agreed[file] = fileAgreed;
	if (Object.keys(fileDivergent).length) divergent[file] = fileDivergent;
	if (fileUnresolved.length) unresolved[file] = fileUnresolved;
	process.stdout.write(
		` -> ${Object.keys(fileAgreed).length} agreed, ${Object.keys(fileDivergent).length} divergent\n`
	);
}

fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
fs.writeFileSync(
	SNAPSHOT,
	`${JSON.stringify(
		{
			source: 'Wikidata Query Service (P571 inception / P1619 official opening, day precision)',
			note: 'Regenerate with `bun run verify:refresh`. Asserted by test/data-verification.test.ts.',
			agreed,
			divergent,
			unresolvedCount: Object.fromEntries(
				Object.entries(unresolved).map(([file, names]) => [file, names.length])
			)
		},
		null,
		2
	)}\n`
);

const agreedCount = Object.values(agreed).reduce((sum, f) => sum + Object.keys(f).length, 0);
process.stdout.write(`\n${checked} rows resolved against Wikidata\n`);
process.stdout.write(`${agreedCount} agree, ${mismatches.length} diverge\n`);
if (mismatches.length) {
	const report = path.join(ROOT, 'mismatches.tsv');
	fs.writeFileSync(report, `${mismatches.join('\n')}\n`);
	process.stdout.write(`report written to ${report}\n`);
	for (const line of mismatches.slice(0, 40)) process.stdout.write(`  ${line}\n`);
}
