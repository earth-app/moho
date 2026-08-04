/**
 * Solar-longitude event maths, used to generate `src/data/cosmic/seasons.csv`.
 *
 * Implements the equinox/solstice method from Jean Meeus, *Astronomical
 * Algorithms* (2nd ed.), chapter 27. Accurate to well under a minute for the
 * years this package covers, which is far more than a day-granularity calendar
 * needs.
 */

const RAD = Math.PI / 180;

export type SeasonEvent =
	'march-equinox' | 'june-solstice' | 'september-equinox' | 'december-solstice';

/** Mean-JDE coefficients for years 1000-3000, Meeus table 27.B. */
const MEAN_JDE: Record<SeasonEvent, [number, number, number, number, number]> = {
	'march-equinox': [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057],
	'june-solstice': [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.0003],
	'september-equinox': [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078],
	'december-solstice': [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032]
};

/** Meeus table 27.C periodic terms: amplitude, phase (deg), frequency (deg/century). */
const PERIODIC: Array<[number, number, number]> = [
	[485, 324.96, 1934.136],
	[203, 337.23, 32964.467],
	[199, 342.08, 20.186],
	[182, 27.85, 445267.112],
	[156, 73.14, 45036.886],
	[136, 171.52, 22518.443],
	[77, 222.54, 65928.934],
	[74, 296.72, 3034.906],
	[70, 243.58, 9037.513],
	[58, 119.81, 33718.147],
	[52, 297.17, 150.678],
	[50, 21.02, 2281.226],
	[45, 247.54, 29929.562],
	[44, 325.15, 31555.956],
	[29, 60.93, 4443.417],
	[18, 155.12, 67555.328],
	[17, 288.79, 4562.452],
	[16, 198.04, 62894.029],
	[14, 199.76, 31436.921],
	[12, 95.39, 14577.848],
	[12, 287.11, 31931.756],
	[12, 320.81, 34777.259],
	[9, 227.73, 1222.114],
	[8, 15.45, 16859.074]
];

export const SEASON_EVENTS = Object.keys(MEAN_JDE) as SeasonEvent[];

/**
 * Approximates TT - UT1 in seconds. Uses the NASA/Espenak-Meeus polynomial for
 * 2005-2050, which is the only span this package generates data for.
 * @param year - Gregorian year
 * @returns Delta T in seconds
 */
function deltaTSeconds(year: number): number {
	const t = year - 2000;
	return 62.92 + 0.32217 * t + 0.005589 * t * t;
}

/**
 * Computes the instant of an equinox or solstice.
 * @param year - Gregorian year
 * @param event - Which of the four solar events
 * @returns The instant, in UTC
 */
export function seasonInstant(year: number, event: SeasonEvent): Date {
	const [a, b, c, d, e] = MEAN_JDE[event];
	const y = (year - 2000) / 1000;
	const jde0 = a + b * y + c * y ** 2 + d * y ** 3 + e * y ** 4;

	const t = (jde0 - 2451545.0) / 36525;
	const w = 35999.373 * t - 2.47;
	const lambda = 1 + 0.0334 * Math.cos(w * RAD) + 0.0007 * Math.cos(2 * w * RAD);

	let s = 0;
	for (const [amplitude, phase, frequency] of PERIODIC) {
		s += amplitude * Math.cos((phase + frequency * t) * RAD);
	}

	const jde = jde0 + (0.00001 * s) / lambda;
	// JDE is Terrestrial Time; shift to UTC
	const jdUt = jde - deltaTSeconds(year) / 86400;

	return julianDayToDate(jdUt);
}

/**
 * Converts a Julian Day number to a UTC instant.
 * @param jd - Julian Day number
 * @returns The corresponding UTC date and time
 */
export function julianDayToDate(jd: number): Date {
	// JD 2440587.5 is 1970-01-01T00:00:00Z
	return new Date(Math.round((jd - 2440587.5) * 86400000));
}

/**
 * Formats a UTC instant as the `YYYY-MM-DD` calendar day it falls on.
 * @param date - The instant
 * @returns An ISO calendar day in UTC
 */
export function utcDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}
