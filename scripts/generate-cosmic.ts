/**
 * Generates `src/data/cosmic`.
 *
 * Equinoxes and solstices are computed. Everything else is a curated table of
 * published predictions kept here rather than typed straight into CSV, so that
 * naming stays consistent and uniqueness is enforced by code instead of by eye.
 *
 * Usage: bun run scripts/generate-cosmic.ts
 */

import fs from 'fs';
import path from 'path';
import { SEASON_EVENTS, seasonInstant, utcDay } from './lib/astronomy.ts';

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

const COSMIC_DIR = path.join(import.meta.dirname, '..', 'src', 'data', 'cosmic');

const FIRST_YEAR = 2026;
const LAST_YEAR = 2050;

const SEASON_NAMES: Record<string, string> = {
	'march-equinox': 'March Equinox',
	'june-solstice': 'June Solstice',
	'september-equinox': 'September Equinox',
	'december-solstice': 'December Solstice'
};

/**
 * Sidereal orbital periods in days.
 * Source: NASA NSSDC planetary fact sheets (sidereal orbit period).
 */
const ORBITAL_PERIODS: Array<[string, number]> = [
	['Mercury', 87.969],
	['Venus', 224.701],
	['Earth', 365.256],
	['Mars', 686.98],
	['Jupiter', 4332.589],
	['Saturn', 10759.22],
	['Uranus', 30685.4],
	['Neptune', 60189.0],
	['Pluto', 90560.0],
	['Ceres', 1681.63],
	['Eris', 203830.0],
	['Haumea', 103468.0],
	['Makemake', 112897.0]
];

/**
 * Fixed astronomical cycles, anchored to a dated occurrence of each cycle.
 * Sources: IAU/NASA constants; the saros anchor is the 2017-08-21 total solar
 * eclipse (saros 145) and the metonic anchor is a January 1 new moon.
 */
const CYCLES: Array<[string, number, string]> = [
	['Synodic Month (New Moon to New Moon)', 29.530589, '2026-01-18'],
	['Sidereal Month', 27.321662, '2026-01-18'],
	['Anomalistic Month (Perigee to Perigee)', 27.554549, '2026-01-08'],
	['Draconic Month', 27.212221, '2026-01-12'],
	['Saros Cycle (Eclipse Repeat)', 6585.3211, '2017-08-21'],
	['Metonic Cycle (19-Year Lunar Return)', 6939.6884, '2014-01-01'],
	['Solar Cycle (Sunspot Maximum)', 4015.0, '2024-10-01'],
	['Venus Synodic Period (Earth Alignment)', 583.92, '2026-01-06'],
	['Mars Synodic Period (Earth Opposition)', 779.94, '2027-02-19'],
	['Jupiter Synodic Period (Earth Opposition)', 398.88, '2026-01-10']
];

/**
 * Tropical zodiac spans. These are the conventional Western sign boundaries;
 * the sun's actual ingress drifts by about a day either side of them.
 */
const ZODIAC: Array<[string, string, string]> = [
	['Aries', '03/21', '04/19'],
	['Taurus', '04/20', '05/20'],
	['Gemini', '05/21', '06/20'],
	['Cancer', '06/21', '07/22'],
	['Leo', '07/23', '08/22'],
	['Virgo', '08/23', '09/22'],
	['Libra', '09/23', '10/22'],
	['Scorpio', '10/23', '11/21'],
	['Sagittarius', '11/22', '12/21'],
	['Capricorn', '12/22', '01/19'],
	['Aquarius', '01/20', '02/18'],
	['Pisces', '02/19', '03/20']
];

/**
 * Solar eclipses 2026-2040 as `[date, type, headline regions]`.
 * Source: NASA GSFC five-millennium canon decade tables, cross-checked against
 * the Wikipedia 21st-century list; the two agree on every date here.
 */
const SOLAR_ECLIPSES: Array<[string, string, string]> = [
	['2026-02-17', 'Annular', 'Antarctica'],
	['2026-08-12', 'Total', 'Greenland/Iceland/Spain'],
	['2027-02-06', 'Annular', 'Chile/Argentina'],
	['2027-08-02', 'Total', 'Morocco/Spain/Egypt/Saudi Arabia'],
	['2028-01-26', 'Annular', 'Peru/Brazil/Portugal/Spain'],
	['2028-07-22', 'Total', 'Australia/New Zealand'],
	['2029-01-14', 'Partial', 'North and Central America'],
	['2029-06-12', 'Partial', 'Scandinavia/Alaska/Northern Canada'],
	['2029-07-11', 'Partial', 'Southern Chile/Argentina'],
	['2029-12-05', 'Partial', 'Southern Argentina/Antarctica'],
	['2030-06-01', 'Annular', 'Algeria/Greece/Turkey/Russia/China/Japan'],
	['2030-11-25', 'Total', 'Botswana/South Africa/Australia'],
	['2031-05-21', 'Annular', 'Angola/Zambia/Tanzania/India/Indonesia'],
	['2031-11-14', 'Hybrid', 'Pacific/Panama'],
	['2032-05-09', 'Annular', 'South Atlantic'],
	['2032-11-03', 'Partial', 'Asia'],
	['2033-03-30', 'Total', 'Eastern Russia/Alaska'],
	['2033-09-23', 'Partial', 'Southern South America/Antarctica'],
	['2034-03-20', 'Total', 'Nigeria/Chad/Egypt/Iran/Pakistan/India/China'],
	['2034-09-12', 'Annular', 'Chile/Bolivia/Argentina/Brazil'],
	['2035-03-09', 'Annular', 'New Zealand/Pacific'],
	['2035-09-02', 'Total', 'China/Korea/Japan'],
	['2036-02-27', 'Partial', 'Antarctica/Southern Australia/New Zealand'],
	['2036-07-23', 'Partial', 'Southern Atlantic'],
	['2036-08-21', 'Partial', 'Alaska/Canada/Western Europe'],
	['2037-01-16', 'Partial', 'North Africa/Europe/Middle East'],
	['2037-07-13', 'Total', 'Australia/New Zealand'],
	['2038-01-05', 'Annular', "Cuba/Cote d'Ivoire/Ghana/Niger/Chad/Egypt"],
	['2038-07-02', 'Annular', 'Colombia/Morocco/Mali/Chad/Sudan/Kenya'],
	['2038-12-26', 'Total', 'Australia/New Zealand/South Pacific'],
	['2039-06-21', 'Annular', 'Alaska/Norway/Sweden/Finland/Russia'],
	['2039-12-15', 'Total', 'Antarctica'],
	['2040-05-11', 'Partial', 'Australia/New Zealand/Antarctica'],
	['2040-11-04', 'Partial', 'North and Central America']
];

/**
 * Lunar eclipses 2026-2040 as `[date, type]`.
 * Source: Wikipedia list of 21st-century lunar eclipses, cross-checked against
 * the NASA GSFC decade tables where those overlap.
 */
const LUNAR_ECLIPSES: Array<[string, string]> = [
	['2026-03-03', 'Total'],
	['2026-08-28', 'Partial'],
	['2027-02-20', 'Penumbral'],
	['2027-07-18', 'Penumbral'],
	['2027-08-17', 'Penumbral'],
	['2028-01-12', 'Partial'],
	['2028-07-06', 'Partial'],
	['2028-12-31', 'Total'],
	['2029-06-26', 'Total'],
	['2029-12-20', 'Total'],
	['2030-06-15', 'Partial'],
	['2030-12-09', 'Penumbral'],
	['2031-05-07', 'Penumbral'],
	['2031-06-05', 'Penumbral'],
	['2031-10-30', 'Penumbral'],
	['2032-04-25', 'Total'],
	['2032-10-18', 'Total'],
	['2033-04-14', 'Total'],
	['2033-10-08', 'Total'],
	['2034-04-03', 'Penumbral'],
	['2034-09-28', 'Partial'],
	['2035-02-22', 'Penumbral'],
	['2035-08-19', 'Partial'],
	['2036-02-11', 'Total'],
	['2036-08-07', 'Total'],
	['2037-01-31', 'Total'],
	['2037-07-27', 'Partial'],
	['2038-01-21', 'Penumbral'],
	['2038-06-17', 'Penumbral'],
	['2038-07-16', 'Penumbral'],
	['2038-12-11', 'Penumbral'],
	['2039-06-06', 'Partial'],
	['2039-11-30', 'Partial'],
	['2040-05-26', 'Total'],
	['2040-11-18', 'Total']
];

/**
 * Next predicted perihelion passage for well-known periodic comets, as
 * `[designation, date, orbital period in years]`.
 * Source: JPL Small-Body Database via the comets' Wikipedia articles.
 */
const COMETS: Array<[string, string, number]> = [
	['1P/Halley', '2061-07-28', 75.32],
	['2P/Encke', '2027-02-10', 3.3],
	['12P/Pons-Brooks', '2095-08-15', 71.3],
	['21P/Giacobini-Zinner', '2031-08-30', 6.55],
	['46P/Wirtanen', '2029-10-27', 5.44],
	['55P/Tempel-Tuttle', '2031-05-20', 33.24],
	['67P/Churyumov-Gerasimenko', '2028-04-09', 6.44],
	['109P/Swift-Tuttle', '2126-07-12', 133.28]
];

/**
 * Major meteor showers as `[name, activity start, activity end, peak]`.
 * Source: IMO Working List of Visual Meteor Showers, cross-checked against the
 * Wikipedia list of meteor showers.
 */
const METEOR_SHOWERS: Array<[string, string, string, string]> = [
	['Quadrantids', '12/28', '01/12', '01/03'],
	['Lyrids', '04/14', '04/30', '04/22'],
	['Eta Aquariids', '04/19', '05/28', '05/06'],
	['Alpha Capricornids', '07/03', '08/15', '07/30'],
	['Southern Delta Aquariids', '07/12', '08/23', '07/30'],
	['Perseids', '07/17', '08/24', '08/12'],
	['Southern Taurids', '09/20', '11/20', '11/05'],
	['Orionids', '10/02', '11/07', '10/21'],
	['Northern Taurids', '10/20', '12/10', '11/12'],
	['Leonids', '11/06', '11/30', '11/17'],
	['Geminids', '12/04', '12/17', '12/14'],
	['Ursids', '12/17', '12/26', '12/22']
];

/**
 * Renders `YYYY-MM-DD` as `Month YYYY`.
 * @param iso - An ISO calendar day
 * @returns The month and year in words
 */
function monthYear(iso: string): string {
	const [year, month] = iso.split('-');
	return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

/**
 * Writes a data file with a provenance header, rejecting duplicate entry names.
 * @param name - Filename inside `src/data/cosmic`
 * @param header - Comment lines, without the leading `#`
 * @param rows - CSV rows
 */
function write(name: string, header: string[], rows: string[]): void {
	const names = rows.map((row) => row.slice(0, row.lastIndexOf(',')));
	const duplicates = names.filter((value, index) => names.indexOf(value) !== index);
	if (duplicates.length) {
		throw new Error(`${name} has duplicate entry names: ${[...new Set(duplicates)].join(', ')}`);
	}

	fs.mkdirSync(COSMIC_DIR, { recursive: true });
	const comment = header.map((line) => `# ${line}`).join('\n');
	fs.writeFileSync(path.join(COSMIC_DIR, name), `${comment}\n${rows.join('\n')}\n`);
	process.stdout.write(`cosmic/${name}: ${rows.length} rows\n`);
}

// equinoxes and solstices, one dated row per event per year
const seasonRows: string[] = [];
for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) {
	for (const event of SEASON_EVENTS) {
		const instant = seasonInstant(year, event);
		seasonRows.push(`${SEASON_NAMES[event]} ${year},${utcDay(instant)}`);
	}
}
seasonRows.sort();
write(
	'seasons.csv',
	[
		'generated by scripts/generate-cosmic.ts',
		'equinox and solstice instants from Meeus, Astronomical Algorithms ch. 27',
		'dates are the UTC calendar day the instant falls on'
	],
	seasonRows
);

write(
	'zodiac.csv',
	[
		'tropical (Western) zodiac sign spans, inclusive of both endpoints',
		'conventional boundary dates; the true solar ingress drifts about a day either way'
	],
	ZODIAC.map(([sign, start, end]) => `${sign},range:${start}-${end}`)
);

write(
	'orbits.csv',
	[
		'sidereal orbital periods, source: NASA NSSDC planetary fact sheets',
		'anchored to the J2000.0 epoch; the interval is the physical constant, the phase is a convention'
	],
	ORBITAL_PERIODS.map(([body, days]) => `${body} Completes an Orbit,every:${days}:2000-01-01`)
);

write(
	'cycles.csv',
	['fixed astronomical cycles, each anchored to a dated occurrence of that cycle'],
	CYCLES.map(([name, days, epoch]) => `${name},every:${days}:${epoch}`)
);

const eclipseRows = [
	...SOLAR_ECLIPSES.map(
		([date, type, regions]) => `${type} Solar Eclipse over ${regions} (${monthYear(date)}),${date}`
	),
	...LUNAR_ECLIPSES.map(([date, type]) => `${type} Lunar Eclipse (${monthYear(date)}),${date}`)
].sort();
write(
	'eclipses.csv',
	[
		'solar and lunar eclipses, 2026-2040',
		'source: NASA GSFC five millennium canon decade tables (eclipse.gsfc.nasa.gov),',
		'cross-checked against the Wikipedia 21st-century eclipse lists',
		'dates are the UTC calendar day of greatest eclipse'
	],
	eclipseRows
);

write(
	'comets.csv',
	[
		'next predicted perihelion passage for well-known periodic comets',
		"source: JPL Small-Body Database via each comet's Wikipedia article",
		'the orbital period is noted in the name; comet periods vary between returns,',
		'so these are the published predictions rather than a period applied to an epoch'
	],
	COMETS.map(
		([designation, date, years]) => `${designation} Perihelion (${years} Year Period),${date}`
	)
);

write(
	'meteor_showers.csv',
	[
		'major meteor showers: an activity window plus the night of maximum',
		'source: IMO Working List of Visual Meteor Showers, cross-checked against Wikipedia',
		'peak dates shift by about a day year to year'
	],
	METEOR_SHOWERS.flatMap(([name, start, end, peak]) => [
		`${name} Meteor Shower,range:${start}-${end}`,
		`${name} Meteor Shower Peak,${peak}`
	])
);
