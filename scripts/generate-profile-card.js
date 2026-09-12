const fs = require('fs');
const { execSync } = require('child_process');

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.METRICS_TOKEN;

// ─── Easily-changeable static info ─────────────────────────────────────────
const HEADER = 'juri@malaj';
const BIRTHDATE = '2004-05-21';

const OS_LINE = 'Linux Ubuntu, Android 13';
const HOST_LINE = 'Holberton School';
const KERNEL_LINE = 'Student';
const IDE_LINE = 'VS Code';

const LANG_PROGRAMMING = 'JavaScript, TypeScript';
const LANG_COMPUTER = 'HTML, CSS, JSON, YAML';
const LANG_REAL = 'English, Albanian';

const HOBBY_COMPETITIVE = 'Competitive CS2';
const HOBBY_CREATIVE = 'Minecraft (Server Hosting + Builds)';

const CONTACT = {
  email: 'juri.malaj@gmail.com',
  linkedin: 'juri-malaj',
  discord: 'jurim007',
};
// ────────────────────────────────────────────────────────────────────────────

const ASCII_ART_PATH = 'assets/ascii-art.txt'; // commit your sourcebin art here
const ASCII_ART = fs.existsSync(ASCII_ART_PATH)
  ? fs.readFileSync(ASCII_ART_PATH, 'utf-8').replace(/\n$/, '')
  : '(add assets/ascii-art.txt)';

function ageBreakdown(birthISO) {
  const birth = new Date(birthISO + 'T00:00:00Z');
  const now = new Date();
  let years = now.getUTCFullYear() - birth.getUTCFullYear();
  let months = now.getUTCMonth() - birth.getUTCMonth();
  let days = now.getUTCDate() - birth.getUTCDate();
  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    days += prevMonthLastDay.getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years} years, ${months} months, ${days} days`;
}

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
          nodes { name stargazerCount }
        }
        repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
          totalCount
        }
      }
    }
  `;
  const data = await graphql(query, { login: USERNAME });
  return data.user;
}

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

// All-time LOC across full history of every owned repo.
// No --author filter: these are your own repos, so nearly every
// commit is yours anyway, and filtering by author was silently
// dropping almost everything whenever your local git name/email
// didn't literally match your GitHub username string.
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
      const log = execSync(`git -C ${dir} log --pretty=tformat: --numstat`, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 100,
      });
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
  return { additions, deletions };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const BULLET = '. ';
const MIN_DOTS = 3; // every leader shows at least this many dots, even on the longest line
const EDGE_PADDING = 2; // a couple of spare columns beyond the longest line, so nothing looks cramped

// A "label: value" row. `targetWidth` is the total character width every row
// (and every divider) is being stretched or shrunk to hit — that's what makes
// them all end at the same right edge instead of all starting at the same
// left edge. Dots are whatever's left after the bullet, label and value are
// accounted for, so they recompute automatically if any label or value
// changes length.
function field(label, value, targetWidth, labelColor, valueColor, dotColor) {
  const prefix = `${BULLET}${label}: `;
  const suffix = ` ${value}`;
  const dotCount = Math.max(MIN_DOTS, targetWidth - prefix.length - suffix.length);
  const dots = '.'.repeat(dotCount);
  return `<tspan fill="${labelColor}">${esc(BULLET)}${esc(label)}: </tspan><tspan fill="${dotColor}">${dots}</tspan><tspan fill="${valueColor}"> ${esc(value)}</tspan>`;
}

// Section divider: "- Title ----------...----------" filling to targetWidth,
// drawn with a heavier line + bold weight so it reads as a thicker rule.
function sectionDivider(title, targetWidth, dashColor) {
  const text = ` ${title} `;
  const dashCount = Math.max(4, targetWidth - text.length - 1);
  return `<tspan fill="#e0a458" font-weight="bold">-${text}</tspan><tspan fill="${dashColor}" font-weight="bold">${'\u2501'.repeat(dashCount)}</tspan>`;
}

// Header divider: "juri@malaj ----------...----------" filling to targetWidth (no leading dash)
function headerDivider(name, targetWidth, dashColor) {
  const text = `${name} `;
  const dashCount = Math.max(4, targetWidth - text.length);
  return `<tspan fill="#e0a458" font-weight="bold">${text}</tspan><tspan fill="${dashColor}" font-weight="bold">${'\u2501'.repeat(dashCount)}</tspan>`;
}

function buildSVG(stats) {
  const bg = '#0d1117';
  const artColor = '#8b949e';
  const labelColor = '#c9d1d9';
  const dotColor = '#4b5263';
  const dashColor = '#6e7681'; // brighter than dotColor so section/header rules look heavier
  const val = '#e0a458';
  const green = '#3fb950';
  const red = '#f85149';

  const artLines = ASCII_ART.split('\n');
  const artMaxLen = Math.max(...artLines.map((l) => l.length));
  const lineHeight = 15;
  const fontSize = 12;
  const charW = fontSize * 0.6;

  // Every "label: value" row that needs to line-wrap to the shared right edge.
  const rows = [
    { l: 'OS', v: OS_LINE },
    { l: 'Uptime', v: ageBreakdown(BIRTHDATE) },
    { l: 'Host', v: HOST_LINE },
    { l: 'Kernel', v: KERNEL_LINE },
    { l: 'IDE', v: IDE_LINE },
    { l: 'Languages.Programming', v: LANG_PROGRAMMING },
    { l: 'Languages.Computer', v: LANG_COMPUTER },
    { l: 'Languages.Real', v: LANG_REAL },
    { l: 'Hobbies.Competitive', v: HOBBY_COMPETITIVE },
    { l: 'Hobbies.Creative', v: HOBBY_CREATIVE },
    { l: 'Email', v: CONTACT.email },
    { l: 'LinkedIn', v: CONTACT.linkedin },
    { l: 'Discord', v: CONTACT.discord },
  ];

  // The GitHub Stats block has two labelled values per physical line, so it
  // can't use the same single dot-run formula as `field()` — but its total
  // plain-text length still needs to count toward the shared target width so
  // it doesn't overshoot the dividers.
  const rawPlainLens = [
    `${BULLET}Repos: ${stats.repoCount} {Contributed: ${stats.contributedCount}} | Stars: ${stats.starCount}`.length,
    `${BULLET}Commits: ${stats.commitCount.toLocaleString()} | Followers: ${stats.followerCount}`.length,
    `${BULLET}Lines of Code on GitHub: ${(stats.loc.additions - stats.loc.deletions).toLocaleString()} ( ${stats.loc.additions.toLocaleString()}++, ${stats.loc.deletions.toLocaleString()}-- )`.length,
  ];

  const targetWidth =
    Math.max(
      ...rows.map((r) => BULLET.length + r.l.length + 2 + MIN_DOTS + 1 + r.v.length),
      ...rawPlainLens,
      HEADER.length + 6,
      'GitHub Stats'.length + 6,
      'Contact'.length + 6
    ) + EDGE_PADDING;

  const rightLines = [
    { type: 'header' },
    { type: 'field', l: 'OS', v: OS_LINE },
    { type: 'field', l: 'Uptime', v: ageBreakdown(BIRTHDATE) },
    { type: 'field', l: 'Host', v: HOST_LINE },
    { type: 'field', l: 'Kernel', v: KERNEL_LINE },
    { type: 'field', l: 'IDE', v: IDE_LINE },
    { type: 'blank' },
    { type: 'field', l: 'Languages.Programming', v: LANG_PROGRAMMING },
    { type: 'field', l: 'Languages.Computer', v: LANG_COMPUTER },
    { type: 'field', l: 'Languages.Real', v: LANG_REAL },
    { type: 'blank' },
    { type: 'field', l: 'Hobbies.Competitive', v: HOBBY_COMPETITIVE },
    { type: 'field', l: 'Hobbies.Creative', v: HOBBY_CREATIVE },
    { type: 'blank' },
    { type: 'section', title: 'Contact' },
    { type: 'field', l: 'Email', v: CONTACT.email },
    { type: 'field', l: 'LinkedIn', v: CONTACT.linkedin },
    { type: 'field', l: 'Discord', v: CONTACT.discord },
    { type: 'blank' },
    { type: 'section', title: 'GitHub Stats' },
    {
      type: 'raw',
      text: `<tspan fill="${labelColor}">${esc(BULLET)}Repos: </tspan><tspan fill="${dotColor}">${'.'.repeat(4)}</tspan><tspan fill="${val}"> ${stats.repoCount} {Contributed: ${stats.contributedCount}}</tspan><tspan fill="${labelColor}"> | Stars: </tspan><tspan fill="${dotColor}">${'.'.repeat(9)}</tspan><tspan fill="${val}"> ${stats.starCount}</tspan>`,
    },
    {
      type: 'raw',
      text: `<tspan fill="${labelColor}">${esc(BULLET)}Commits: </tspan><tspan fill="${dotColor}">${'.'.repeat(18)}</tspan><tspan fill="${val}"> ${stats.commitCount.toLocaleString()}</tspan><tspan fill="${labelColor}"> | Followers: </tspan><tspan fill="${dotColor}">${'.'.repeat(6)}</tspan><tspan fill="${val}"> ${stats.followerCount}</tspan>`,
    },
    {
      type: 'raw',
      text: `<tspan fill="${labelColor}">${esc(BULLET)}Lines of Code on GitHub: </tspan><tspan fill="${dotColor}">.</tspan><tspan fill="${labelColor}"> ${(stats.loc.additions - stats.loc.deletions).toLocaleString()} (</tspan><tspan fill="${green}"> ${stats.loc.additions.toLocaleString()}++,</tspan><tspan fill="${red}"> ${stats.loc.deletions.toLocaleString()}--</tspan><tspan fill="${labelColor}"> )</tspan>`,
    },
  ];

  const artColX = 20;
  const rightColX = artColX + artMaxLen * charW + 40;
  const topPad = 30;
  const height = Math.max(artLines.length, rightLines.length) * lineHeight + topPad + 20;
  const width = rightColX + targetWidth * charW + 30;

  const artSVG = artLines
    .map(
      (l, i) =>
        `<text x="${artColX}" y="${topPad + i * lineHeight}" fill="${artColor}" font-family="monospace" font-size="${fontSize}" xml:space="preserve">${esc(l)}</text>`
    )
    .join('\n');

  let rightSVG = '';
  rightLines.forEach((l, i) => {
    const y = topPad + i * lineHeight;
    if (l.type === 'blank') return;
    if (l.type === 'header') {
      rightSVG += `<text x="${rightColX}" y="${y}" font-family="monospace" font-size="${fontSize}">${headerDivider(HEADER, targetWidth, dashColor)}</text>\n`;
    } else if (l.type === 'section') {
      rightSVG += `<text x="${rightColX}" y="${y}" font-family="monospace" font-size="${fontSize}">${sectionDivider(l.title, targetWidth, dashColor)}</text>\n`;
    } else if (l.type === 'raw') {
      rightSVG += `<text x="${rightColX}" y="${y}" font-family="monospace" font-size="${fontSize}">${l.text}</text>\n`;
    } else if (l.type === 'field') {
      rightSVG += `<text x="${rightColX}" y="${y}" font-family="monospace" font-size="${fontSize}">${field(l.l, l.v, targetWidth, labelColor, val, dotColor)}</text>\n`;
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" rx="10" fill="${bg}" stroke="#30363d" stroke-width="1"/>
  ${artSVG}
  ${rightSVG}
</svg>`;
}

if (require.main === module) {
  (async () => {
    const user = await getUserOverview();
    const totalStars = user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0);
    const commitCount = await getTotalCommits(user.createdAt);
    const loc = countLinesOfCode(user.repositories.nodes);

    const stats = {
      repoCount: user.repositories.totalCount,
      contributedCount: user.repositoriesContributedTo.totalCount,
      starCount: totalStars,
      followerCount: user.followers.totalCount,
      commitCount,
      loc,
    };

    fs.writeFileSync('profile-card.svg', buildSVG(stats));
  })();
}

module.exports = { buildSVG };