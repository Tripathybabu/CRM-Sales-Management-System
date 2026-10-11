const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * DAY_MS);
}

module.exports = { DAY_MS, startOfDay, addDays };
