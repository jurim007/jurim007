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

async function getMisc() {
  const query = `
    query($login: String!) {
      user(login: $login) {
        createdAt
        pullRequests { totalCount }
        issues { totalCount }
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
          nodes {
            forkCount
            primaryLanguage { name }
          }
        }
      }
    }
  `;
  const data = await graphql(query, { login: USERNAME });
  return data.user;
}

async function getLongestStreak(createdAt) {
  const startYear = new Date(createdAt).getFullYear();
  const currentYear = new Date().getFullYear();
  let allDays = [];

  for (let year = startYear; year <= currentYear; year++) {
    const from = `${year}-01-01T00:00:00Z`;
    const to = `${year}-12-31T23:59:59Z`;
    const query = `
      query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              weeks { contributionDays { date contributionCount } }
            }
          }
        }
      }
    `;
    const data = await graphql(query, { login: USERNAME, from, to });
    const days = data.user.contributionsCollection.contributionCalendar.weeks.flatMap(
      (w) => w.contributionDays
    );
    allDays = allDays.concat(days);
  }

  let longest = 0;
  let current = 0;
  for (const day of allDays) {
    if (day.contributionCount > 0) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function topLanguage(repos) {
  const counts = {};
  for (const r of repos) {
    const name = r.primaryLanguage?.name;
    if (!name) continue;
    counts[name] = (counts[name] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length ? sorted[0][0] : 'N/A';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Stacks 3 icon+value+label rows into ONE transparent, borderless SVG.
// Width auto-sizes to the widest row so nothing gets clipped.
function stackedStats(rows) {
  const rowHeight = 34;
  const fontSize = 15;
  const charW = fontSize * 0.62;

  const widths = rows.map((r) => {
    const valueW = String(r.value).length * charW;
    const labelW = r.label.length * (fontSize * 0.8 * 0.62);
    return 30 + valueW + 10 + labelW + 10; // icon col + value + gap + label + margin
  });
  const width = Math.ceil(Math.max(...widths));
  const height = rows.length * rowHeight;

  const rowsSVG = rows
    .map((r, i) => {
      const y = i * rowHeight + rowHeight / 2 + 5;
      const valueX = 30;
      const valueW = String(r.value).length * charW;
      const labelX = valueX + valueW + 10;
      return `
  <text x="0" y="${y}" font-family="'Segoe UI Emoji','Noto Color Emoji',monospace" font-size="16">${r.icon}</text>
  <text x="${valueX}" y="${y}" font-family="monospace" font-size="${fontSize}" font-weight="bold" fill="#e0a458">${esc(r.value)}</text>
  <text x="${labelX}" y="${y}" font-family="monospace" font-size="${fontSize * 0.8}" fill="#c9d1d9">${esc(r.label)}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rowsSVG}
</svg>`;
}

(async () => {
  const user = await getMisc();
  const longestStreak = await getLongestStreak(user.createdAt);
  const totalForks = user.repositories.nodes.reduce((sum, r) => sum + r.forkCount, 0);
  const lang = topLanguage(user.repositories.nodes);
  const memberSinceYear = new Date(user.createdAt).getFullYear();

  const leftRows = [
    { icon: '🔥', value: longestStreak, label: 'Longest Streak' },
    { icon: '🔀', value: user.pullRequests.totalCount, label: 'Pull Requests' },
    { icon: '🐛', value: user.issues.totalCount, label: 'Issues' },
  ];

  const rightRows = [
    { icon: '📅', value: memberSinceYear, label: 'Member Since' },
    { icon: '🏷️', value: lang, label: 'Top Language' },
    { icon: '🍴', value: totalForks, label: 'Forks' },
  ];

  fs.writeFileSync('side-stats-left.svg', stackedStats(leftRows));
  fs.writeFileSync('side-stats-right.svg', stackedStats(rightRows));
})();