const fs = require('fs');
const { execSync } = require('child_process');

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.METRICS_TOKEN;

async function graphql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function getUserOverview() {
  const query = `
    query($login: String!) {
      user(login: $login) {
        createdAt
        followers { totalCount }
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
          totalCount
          nodes {
            name
            stargazerCount
          }
        }
      }
    }
  `;
  const data = await graphql(query, { login: USERNAME });
  return data.user;
}

// Sums totalCommitContributions year-by-year since account creation,
// since contributionsCollection only covers 1 year per call.
async function getTotalCommits(createdAt) {
  const startYear = new Date(createdAt).getFullYear();
  const currentYear = new Date().getFullYear();
  let total = 0;

  for (let year = startYear; year <= currentYear; year++) {
    const from = `${year}-01-01T00:00:00Z`;
    const to = `${year}-12-31T23:59:59Z`;
    const query = `
      query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            restrictedContributionsCount
          }
        }
      }
    `;
    const data = await graphql(query, { login: USERNAME, from, to });
    const c = data.user.contributionsCollection;
    total += c.totalCommitContributions + c.restrictedContributionsCount;
  }
  return total;
}

// Clones each repo and sums numstat lines attributed to USERNAME.
// Heavier and slower than the API-only stats above — see notes.
function countLinesOfCode(repos) {
  let additions = 0;
  let deletions = 0;

  for (const repo of repos) {
    const dir = `/tmp/loc-${repo.name}`;
    try {
      execSync(
        `git clone --quiet https://x-access-token:${TOKEN}@github.com/${USERNAME}/${repo.name}.git ${dir}`,
        { stdio: 'ignore' }
      );
      const log = execSync(
        `git -C ${dir} log --author="${USERNAME}" --pretty=tformat: --numstat`,
        { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 }
      );
      for (const line of log.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length === 3 && parts[0] !== '-' && parts[1] !== '-') {
          additions += parseInt(parts[0], 10) || 0;
          deletions += parseInt(parts[1], 10) || 0;
        }
      }
    } catch (e) {
      console.error(`Skipping ${repo.name}: ${e.message}`);
    } finally {
      execSync(`rm -rf ${dir}`);
    }
  }

  return { additions, deletions, net: additions - deletions };
}

function buildSVG(stats, theme) {
  const colors =
    theme === 'dark'
      ? { bg: '#0d1117', text: '#c9d1d9', accent: '#58a6ff', border: '#30363d' }
      : { bg: '#ffffff', text: '#24292f', accent: '#0969da', border: '#d0d7de' };

  const rows = [
    ['Repositories', stats.repoCount],
    ['Total Stars', stats.starCount],
    ['Followers', stats.followerCount],
    ['Total Commits', stats.commitCount],
    ['Lines of Code', `${stats.loc.additions.toLocaleString()}++ / ${stats.loc.deletions.toLocaleString()}--`],
  ];

  const rowHeight = 30;
  const height = 55 + rows.length * rowHeight;

  const rowsSVG = rows
    .map(
      (r, i) => `
    <text x="20" y="${65 + i * rowHeight}" fill="${colors.text}" font-family="'Segoe UI', monospace" font-size="14">${r[0]}</text>
    <text x="360" y="${65 + i * rowHeight}" fill="${colors.accent}" font-family="'Segoe UI', monospace" font-size="14" font-weight="bold" text-anchor="end">${r[1]}</text>`
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="${height}">
    <rect x="0.5" y="0.5" width="379" height="${height - 1}" rx="10" fill="${colors.bg}" stroke="${colors.border}" stroke-width="1"/>
    <text x="20" y="30" fill="${colors.text}" font-family="'Segoe UI', monospace" font-size="16" font-weight="bold">GitHub Stats</text>
    ${rowsSVG}
  </svg>`;
}

(async () => {
  const user = await getUserOverview();
  const totalStars = user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0);
  const commitCount = await getTotalCommits(user.createdAt);
  const loc = countLinesOfCode(user.repositories.nodes);

  const stats = {
    repoCount: user.repositories.totalCount,
    starCount: totalStars,
    followerCount: user.followers.totalCount,
    commitCount,
    loc,
  };

  fs.writeFileSync('stats-dark.svg', buildSVG(stats, 'dark'));
  fs.writeFileSync('stats-light.svg', buildSVG(stats, 'light'));
})();