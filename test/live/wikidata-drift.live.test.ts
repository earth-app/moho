import { describe, expect, jest, test } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * Live drift check against the Wikidata Query Service.
 *
 * This is the periodic lane, not the gate: it makes real network calls and is
 * excluded from `bun run test`. It answers a question the offline gate cannot,
 * namely whether `test/fixtures/verified-facts.json` still agrees with the
 * source it was generated from.
 *
 * Run with `bun run test:live`.
 */

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'moho-data-bot/1.0 (https://github.com/earth-app/moho; drift check)';

/** How many facts to re-check. A sample keeps the run short and the endpoint happy. */
const SAMPLE_SIZE = 40;

/** Share of the sample allowed to disagree before the test fails. */
const DRIFT_THRESHOLD = 0.05;

type Fact = { qid: string; month: number; day: number; year: number };

const snapshot = JSON.parse(
	fs.readFileSync(path.join(import.meta.dirname, '..', 'fixtures', 'verified-facts.json'), 'utf-8')
) as {
	agreed: Record<string, Record<string, Fact>>;
	divergent: Record<string, Record<string, Fact>>;
};

/**
 * Flattens the snapshot into a single list of facts with their file of origin.
 *
 * Both groups are sampled: a divergent row records what Wikidata said at capture
 * time, so it drifts the same way an agreed one does.
 * @returns Every recorded fact
 */
function allFacts(): Array<{ file: string; name: string; fact: Fact }> {
	return [snapshot.agreed, snapshot.divergent].flatMap((group) =>
		Object.entries(group).flatMap(([file, facts]) =>
			Object.entries(facts).map(([name, fact]) => ({ file, name, fact }))
		)
	);
}

/**
 * Deterministically samples the facts so a failure is reproducible.
 * @param facts - The full fact list
 * @param size - How many to take
 * @returns An evenly spread sample
 */
function sample<T>(facts: T[], size: number): T[] {
	if (facts.length <= size) return facts;
	const step = facts.length / size;
	return Array.from({ length: size }, (_, i) => facts[Math.floor(i * step)] as T);
}

/**
 * Looks up inception dates for a batch of Q-ids.
 * @param qids - Wikidata item identifiers
 * @returns Q-id mapped to the set of day-precision dates it holds
 */
async function fetchDates(qids: string[]): Promise<Map<string, Set<string>>> {
	const query = `SELECT ?item ?date ?precision WHERE {
		VALUES ?item { ${qids.map((qid) => `wd:${qid}`).join(' ')} }
		{ ?item p:P571/psv:P571 ?node } UNION { ?item p:P1619/psv:P1619 ?node }
		?node wikibase:timeValue ?date ; wikibase:timePrecision ?precision .
	}`;

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

	const json = (await response.json()) as {
		results: { bindings: Array<Record<string, { value: string }>> };
	};

	const byQid = new Map<string, Set<string>>();
	for (const row of json.results.bindings) {
		if (Number(row.precision?.value) !== 11) continue;
		const qid = row.item?.value.split('/').pop();
		const day = row.date?.value.slice(0, 10);
		if (!qid || !day) continue;
		if (!byQid.has(qid)) byQid.set(qid, new Set());
		byQid.get(qid)?.add(day);
	}

	return byQid;
}

describe('Wikidata drift (live)', () => {
	jest.setTimeout(180_000);

	test('the recorded facts still match the live source', async () => {
		const facts = sample(allFacts(), SAMPLE_SIZE);
		expect(facts.length).toBeGreaterThan(0);

		const live = await fetchDates([...new Set(facts.map(({ fact }) => fact.qid))]);
		const drifted: string[] = [];
		let comparable = 0;

		for (const { file, name, fact } of facts) {
			const dates = live.get(fact.qid);
			// an item that lost its day-precision date upstream is not drift in our data
			if (!dates || dates.size === 0) continue;
			comparable++;

			const recorded = `${String(fact.year).padStart(4, '0')}-${String(fact.month).padStart(2, '0')}-${String(fact.day).padStart(2, '0')}`;
			if (!dates.has(recorded)) {
				drifted.push(
					`${file} ${name} (${fact.qid}): recorded ${recorded}, live ${[...dates].join(' / ')}`
				);
			}
		}

		expect(comparable).toBeGreaterThan(SAMPLE_SIZE / 4);
		const rate = drifted.length / comparable;
		if (rate > DRIFT_THRESHOLD) {
			throw new Error(
				`${drifted.length}/${comparable} sampled facts drifted (threshold ${DRIFT_THRESHOLD * 100}%).\n` +
					`Re-run \`bun run verify:refresh\` and review.\n${drifted.join('\n')}`
			);
		}
	});
});
