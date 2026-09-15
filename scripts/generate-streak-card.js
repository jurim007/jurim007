const fs = require('fs');

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.METRICS_TOKEN;

async function graphql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function getContributionDays() {
  const to = new Date();
  const from = new Date();
  from.setUTCFullYear(from.getUTCFullYear() - 1);

  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;
  const data = await graphql(query, {
    login: USERNAME,
    from: from.toISOString(),
    to: to.toISOString(),
  });

  const days = data.user.contributionsCollection.contributionCalendar.weeks.flatMap(
    (w) => w.contributionDays
  );
  return days;
}

// Returns both the streak length and the date range it covers.
function currentStreakInfo(days) {
  let streak = 0;
  let startDate = null;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) {
      streak++;
      startDate = days[i].date;
    } else {
      if (i === days.length - 1) continue; // today can be zero without breaking the streak
      break;
    }
  }
  const endDate = days[days.length - 1].date;
  return { streak, startDate, endDate };
}

function formatShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildSVG({ streak, startDate, endDate }) {
  const gold = '#e0a458';   // circle + flame + title
  const light = '#c9d1d9';  // number + date range

  const width = 180;
  const height = 230;
  const cx = width / 2;
  const cy = 95;
  const r = 62;

  const dateRange =
    streak > 0 ? `${formatShort(startDate)} - ${formatShort(endDate)}` : formatShort(endDate);

  // Generic flame silhouette (not tied to any specific brand mark), sized ~34x40,
  // positioned straddling the top of the circle like the reference.
  const flame = `
    <g transform="translate(${cx - 17}, ${cy - r - 22})" fill="${gold}">
      <path d="M17,2 C10,10 6,17 10,24 C5,21 3,27 6,33
               C1,30 -1,38 5,43 C0,46 3,55 12,55
               C21,55 26,49 25,41 C29,47 32,41 29,35
               C34,38 36,30 29,27 C32,21 26,11 17,2 Z" />
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${gold}" stroke-width="6" />
  ${flame}
  <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-family="monospace" font-size="40" font-weight="bold" fill="${light}">${streak}</text>
  <text x="${cx}" y="${cy + r + 34}" text-anchor="middle" font-family="monospace" font-size="17" font-weight="bold" fill="${gold}">Current Streak</text>
  <text x="${cx}" y="${cy + r + 56}" text-anchor="middle" font-family="monospace" font-size="13" fill="${light}">${esc(dateRange)}</text>
</svg>`;
}

(async () => {
  const days = await getContributionDays();
  const info = currentStreakInfo(days);
  fs.mkdirSync('generated', { recursive: true });
  fs.writeFileSync('generated/streak-card.svg', buildSVG(info));
})();