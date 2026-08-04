/**
 * Example usage of the Moho library
 */

import {
	DateRangeEntry,
	EasterEntry,
	ExactDateEntry,
	ExactDateWithYearEntry,
	IntervalEntry,
	OneTimeEntry,
	RelativeDateEntry,
	getAllEntries,
	getEntriesBySource,
	getEntriesByType,
	getEntriesInNextDays,
	getEntriesInNextMonths,
	getEntriesOnDate
} from '../src/index';

const allEntries = getAllEntries();

console.log(`Total entries loaded: ${allEntries.length}\n`);

console.log('📅 Events in the next 30 days:');
const upcoming = getEntriesInNextDays(allEntries, 30);
upcoming.slice(0, 10).forEach(({ entry, date }) => {
	console.log(`  - ${entry.name} on ${date.toLocaleDateString()}`);
});
console.log(`  ... and ${upcoming.length - 10} more\n`);

// Find events happening today
console.log('🎉 Events today:');
const today = new Date();
const todaysEvents = getEntriesOnDate(allEntries, today);
if (todaysEvents.length > 0) {
	todaysEvents.forEach((entry) => {
		console.log(`  - ${entry.name}`);
	});
} else {
	console.log('  No events today');
}
console.log();

// Get place birthdays (independence days) in the next 6 months
console.log('🌍 Place birthdays in the next 6 months:');
const countryBirthdays = getEntriesByType(allEntries, ExactDateWithYearEntry);
const upcomingBirthdays = getEntriesInNextMonths(countryBirthdays, 6);
upcomingBirthdays.slice(0, 5).forEach(({ entry, date }) => {
	if (entry instanceof ExactDateWithYearEntry) {
		const years = entry.getYearsSince(date);
		console.log(`  - ${entry.name}: ${years} years (${date.toLocaleDateString()})`);
	}
});
console.log();

// Get all relative date events (holidays that change dates)
console.log('🔄 Relative date holidays:');
const relativeDates = getEntriesByType(allEntries, RelativeDateEntry);
relativeDates.slice(0, 5).forEach((entry) => {
	const next = entry.getNextOccurrence();
	console.log(`  - ${entry.name} on ${next.toLocaleDateString()}`);
});
console.log();

// Create custom entries
console.log('✨ Custom entries:');
const customEvent = new ExactDateEntry('Pi Day', 3, 14);
const independence = new ExactDateWithYearEntry('USA Independence', 7, 4, 1776);
const thanksgiving = new RelativeDateEntry('Thanksgiving', 4, 4, 11); // 4th Thursday in November

console.log(
	`  - ${customEvent.name}: Next occurrence on ${customEvent.getNextOccurrence().toLocaleDateString()}`
);
console.log(`  - ${independence.name}: ${independence.getYearsSince()} years ago`);
console.log(
	`  - ${thanksgiving.name}: Next occurrence on ${thanksgiving.getNextOccurrence().toLocaleDateString()}`
);

console.log();

// Cosmic events: eclipses and comet returns are one-time dated events
console.log('🌘 Next cosmic events:');
const cosmic = getEntriesBySource(allEntries, 'cosmic/');
getEntriesInNextDays(cosmic, 365 * 3)
	.slice(0, 6)
	.forEach(({ entry, date }) => {
		console.log(`  - ${entry.name} on ${date.toLocaleDateString()}`);
	});
console.log();

// Periodic cycles: orbital periods and the saros, anchored to an epoch
console.log('🪐 Orbital cycles:');
getEntriesByType(allEntries, IntervalEntry)
	.slice(0, 4)
	.forEach((entry) => {
		const years = (entry.intervalDays / 365.25).toFixed(2);
		console.log(`  - ${entry.name}: every ${entry.intervalDays} days (${years} years)`);
	});
console.log();

const rightNow = new Date();

// Spans: which sports seasons and zodiac sign are running today
console.log('🏟️  In season today:');
getEntriesByType(allEntries, DateRangeEntry)
	.filter((entry) => entry.occursOn(rightNow))
	.slice(0, 8)
	.forEach((entry) => {
		const { end } = entry.getRangeFor(rightNow.getFullYear() - (entry.wrapsYear ? 1 : 0));
		console.log(`  - ${entry.name} (through ${end.toLocaleDateString()})`);
	});
console.log();

// Moveable feasts move every year, in both the Western and Orthodox reckonings
console.log('✝️  Moveable feasts this year:');
getEntriesByType(allEntries, EasterEntry)
	.filter((entry) =>
		['Easter Sunday', 'Good Friday', 'Pentecost', 'Orthodox Easter'].includes(entry.name)
	)
	.forEach((entry) => {
		console.log(
			`  - ${entry.name}: ${entry.getDateFor(rightNow.getFullYear()).toLocaleDateString()}`
		);
	});
console.log();

// One-time events drop out of the upcoming list once they have passed
console.log('🔭 Eclipses still ahead:');
const eclipses = getEntriesByType(
	getEntriesBySource(allEntries, 'cosmic/eclipses.csv'),
	OneTimeEntry
);
const remaining = eclipses.filter((entry) => !entry.hasOccurred());
console.log(
	`  ${remaining.length} of ${eclipses.length} eclipses in the dataset are still to come`
);
