/**
 * Example usage of the Moho library
 */

import {
	ExactDateEntry,
	ExactDateWithYearEntry,
	RelativeDateEntry,
	getAllEntries,
	getEntriesByType,
	getEntriesInNextDays,
	getEntriesInNextMonths,
	getEntriesOnDate
} from '../src/index';

const allEntries = getAllEntries('./src/data');

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
