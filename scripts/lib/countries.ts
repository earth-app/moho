/**
 * The countries whose places are generated from Wikidata, keyed by the ISO
 * 3166-1 alpha-2 code used for the `src/data/birthdays/<code>` directory.
 *
 * Subdivisions are read from the country's own `P150` (contains administrative
 * territorial entity) statements rather than from a per-country subdivision
 * class, so there are no class Q-ids to guess at or keep in sync.
 */

export type CountryConfig = {
	/** ISO 3166-1 alpha-2 code, lowercased; also the data sub-directory name. */
	code: string;
	/** English name, used only in log output. */
	name: string;
	/** Wikidata Q-id of the country. */
	qid: string;
	/**
	 * Filename for the first-level subdivisions, e.g. `states` or `provinces`.
	 * Omit to generate cities only, leaving a hand-maintained subdivision file
	 * alone.
	 */
	subdivisionFile?: string;
	/**
	 * How many `P150` levels down to walk. The default of 1 is the first-level
	 * subdivision; the UK needs 2 because its first level is the four
	 * constituent countries rather than anything county-sized.
	 */
	subdivisionDepth?: 1 | 2;
};

export const COUNTRIES: CountryConfig[] = [
	// Canada's city list was previously hand-written and largely wrong (Barrie was
	// dated 2026 against an actual city incorporation of 1959), so it is generated
	// like the rest. ca/provinces.csv is hand-maintained and more complete than
	// Wikidata's day-precision coverage, so no subdivision file is generated here.
	{ code: 'ca', name: 'Canada', qid: 'Q16' },
	{ code: 'mx', name: 'Mexico', qid: 'Q96', subdivisionFile: 'states' },
	{
		code: 'gb',
		name: 'United Kingdom',
		qid: 'Q145',
		subdivisionFile: 'subdivisions',
		subdivisionDepth: 2
	},
	{ code: 'fr', name: 'France', qid: 'Q142', subdivisionFile: 'regions' },
	{ code: 'hu', name: 'Hungary', qid: 'Q28', subdivisionFile: 'counties' },
	{ code: 'ru', name: 'Russia', qid: 'Q159', subdivisionFile: 'federal_subjects' },
	{ code: 'tr', name: 'Turkey', qid: 'Q43', subdivisionFile: 'provinces' },
	{ code: 'es', name: 'Spain', qid: 'Q29', subdivisionFile: 'communities' },
	{ code: 'br', name: 'Brazil', qid: 'Q155', subdivisionFile: 'states' },
	{ code: 'ar', name: 'Argentina', qid: 'Q414', subdivisionFile: 'provinces' },
	{ code: 'ma', name: 'Morocco', qid: 'Q1028', subdivisionFile: 'regions' },
	{ code: 'za', name: 'South Africa', qid: 'Q258', subdivisionFile: 'provinces' },
	{ code: 'bw', name: 'Botswana', qid: 'Q963', subdivisionFile: 'districts' },
	{ code: 'nz', name: 'New Zealand', qid: 'Q664', subdivisionFile: 'regions' },
	{ code: 'au', name: 'Australia', qid: 'Q408', subdivisionFile: 'states' },
	{ code: 'gl', name: 'Greenland', qid: 'Q223', subdivisionFile: 'municipalities' },
	{ code: 'is', name: 'Iceland', qid: 'Q189', subdivisionFile: 'regions' },
	{ code: 'ml', name: 'Mali', qid: 'Q912', subdivisionFile: 'regions' },
	{ code: 'gh', name: 'Ghana', qid: 'Q117', subdivisionFile: 'regions' },
	{ code: 'td', name: 'Chad', qid: 'Q657', subdivisionFile: 'regions' },
	{ code: 'tg', name: 'Togo', qid: 'Q945', subdivisionFile: 'regions' },
	{ code: 'bj', name: 'Benin', qid: 'Q962', subdivisionFile: 'departments' },
	{ code: 'tz', name: 'Tanzania', qid: 'Q924', subdivisionFile: 'regions' },
	{ code: 'zw', name: 'Zimbabwe', qid: 'Q954', subdivisionFile: 'provinces' },
	{ code: 'cr', name: 'Costa Rica', qid: 'Q800', subdivisionFile: 'provinces' },
	{ code: 'sv', name: 'El Salvador', qid: 'Q792', subdivisionFile: 'departments' }
];
