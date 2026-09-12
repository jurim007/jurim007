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

// Minimal single-line stat: icon + value + label, transparent bg, no border.
function miniStat(icon, value, label) {
  const width = 170;
  const height = 34;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <text x="0" y="22" font-family="'Segoe UI Emoji', 'Noto Color Emoji', monospace" font-size="16">${icon}</text>
  <text x="26" y="22" font-family="monospace" font-size="15" font-weight="bold" fill="#e0a458">${esc(value)}</text>
  <text x="26" y="22" dx="${String(value).length * 9 + 8}" font-family="monospace" font-size="12" fill="#c9d1d9">${esc(label)}</text>
</svg>`;
}

(async () => {
  const user = await getMisc();
  const longestStreak = await getLongestStreak(user.createdAt);
  const totalForks = user.repositories.nodes.reduce((sum, r) => sum + r.forkCount, 0);
  const lang = topLanguage(user.repositories.nodes);
  const memberSinceYear = new Date(user.createdAt).getFullYear();

  const stats = [
    { file: 'side-stat-streak.svg', icon: '🔥', value: longestStreak, label: 'Longest Streak' },
    { file: 'side-stat-prs.svg', icon: '🔀', value: user.pullRequests.totalCount, label: 'Pull Requests' },
    { file: 'side-stat-issues.svg', icon: '🐛', value: user.issues.totalCount, label: 'Issues' },
    { file: 'side-stat-member.svg', icon: '📅', value: memberSinceYear, label: 'Member Since' },
    { file: 'side-stat-lang.svg', icon: '🏷️', value: lang, label: 'Top Language' },
    { file: 'side-stat-forks.svg', icon: '🍴', value: totalForks, label: 'Forks' },
  ];

  for (const s of stats) {
    fs.writeFileSync(s.file, miniStat(s.icon, s.value, s.label));
  }
})();
