const fs = require('fs');

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.METRICS_TOKEN;

// Drop your own art in here with these exact filenames — nothing else
// in the script needs to change.
const ICON_LEFT = 'assets/batman/1.png';
const ICON_RIGHT = 'assets/batman/2.png';

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

function currentStreak(days) {
  // days are in chronological order; walk backwards from the most recent day
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].contributionCount > 0) {
      streak++;
    } else {
      // allow today to be a zero-contribution day without breaking the streak
      if (i === days.length - 1) continue;
      break;
    }
  }
  return streak;
}

function toBase64(path) {
  if (!fs.existsSync(path)) return null;
  return fs.readFileSync(path).toString('base64');
}

function buildSVG(streak) {
  const bg = '#0d1117';
  const border = '#30363d';
  const val = '#e0a458';
  const label = '#c9d1d9';

  const iconSize = 60;
  const width = 260;
  const height = 90;

  const leftB64 = toBase64(ICON_LEFT);
  const rightB64 = toBase64(ICON_RIGHT);

  const leftImg = leftB64
    ? `<image href="data:image/png;base64,${leftB64}" x="20" y="${(height - iconSize) / 2}" width="${iconSize}" height="${iconSize}" />`
    : '';
  const rightImg = rightB64
    ? `<image href="data:image/png;base64,${rightB64}" x="${width - 20 - iconSize}" y="${(height - iconSize) / 2}" width="${iconSize}" height="${iconSize}" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" rx="10" fill="${bg}" stroke="${border}" stroke-width="1"/>
  ${leftImg}
  <text x="50%" y="42%" text-anchor="middle" font-family="monospace" font-size="28" font-weight="bold" fill="${val}">${streak}</text>
  <text x="50%" y="68%" text-anchor="middle" font-family="monospace" font-size="12" fill="${label}">Current Streak</text>
  ${rightImg}
</svg>`;
}

(async () => {
  const days = await getContributionDays();
  const streak = currentStreak(days);
  fs.mkdirSync('generated', { recursive: true });
  fs.writeFileSync('generated/streak-card.svg', buildSVG(streak));
})();
