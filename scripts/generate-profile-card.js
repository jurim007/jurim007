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

const ASCII_ART_PATH = 'assets/ascii-art.txt';
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
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
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

const LINE_WIDTH = 64; // total characters each row (from ". " to end of value) should span
const DIVIDER_CHAR = '─'; // solid box-drawing line, not repeated hyphens

// Field line: ". Label: ....dots.... value" — dot count computed so the
// WHOLE line (prefix + label + dots + value) lands on LINE_WIDTH chars,
// so short values get more dots and long values get fewer — every line
// ends flush at the same right edge instead of values starting at a
// fixed column.
function field(label, value, labelColor, valueColor, dotColor) {
  const prefix = '. ';
  const labelPart = `${label}: `;
  const used = prefix.length + labelPart.length + 1 + String(value).length; // +1 = space before value
  const dotCount = Math.max(3, LINE_WIDTH - used);
  const dots = DIVIDER_CHAR.repeat(dotCount);
  return `<tspan fill="${dotColor}">${prefix}</tspan><tspan fill="${labelColor}">${esc(label)}: </tspan><tspan fill="${dotColor}">${dots}</tspan><tspan fill="${valueColor}"> ${esc(value)}</tspan>`;
}

function sectionDivider(title) {
  const text = ` ${title} `;
  const dashCount = Math.max(4, LINE_WIDTH - text.length - 1);
  return `<tspan fill="#e0a458" font-weight="bold">-${text}</tspan><tspan fill="#4b5263" font-weight="bold">${DIVIDER_CHAR.repeat(dashCount)}</tspan>`;
}

function headerDivider(name) {
  const text = `${name} `;
  const dashCount = Math.max(4, LINE_WIDTH - text.length);
  return `<tspan fill="#e0a458" font-weight="bold">${text}</tspan><tspan fill="#4b5263" font-weight="bold">${DIVIDER_CHAR.repeat(dashCount)}</tspan>`;
}

function buildSVG(stats) {
  const bg = '#0d1117';
  const artColor = '#8b949e';
  const labelColor = '#c9d1d9';
  const dotColor = '#4b5263';
  const val = '#e0a458';
  const green = '#3fb950';
  const red = '#f85149';

  const artLines = ASCII_ART.split('\n');
  const artMaxLen = Math.max(...artLines.map((l) => l.length));
  const lineHeight = 15;
  const fontSize = 12;
  const charW = fontSize * 0.6;

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
      text: `<tspan fill="${dotColor}">. </tspan><tspan fill="${labelColor}">Repos: </tspan><tspan fill="${dotColor}">${DIVIDER_CHAR.repeat(4)}</tspan><tspan fill="${val}"> ${stats.repoCount} {Contributed: ${stats.contributedCount}}</tspan><tspan fill="${labelColor}"> | Stars: </tspan><tspan fill="${dotColor}">${DIVIDER_CHAR.repeat(9)}</tspan><tspan fill="${val}"> ${stats.starCount}</tspan>`,
    },
    {
      type: 'raw',
      text: `<tspan fill="${dotColor}">. </tspan><tspan fill="${labelColor}">Commits: </tspan><tspan fill="${dotColor}">${DIVIDER_CHAR.repeat(16)}</tspan><tspan fill="${val}"> ${stats.commitCount.toLocaleString()}</tspan><tspan fill="${labelColor}"> | Followers: </tspan><tspan fill="${dotColor}">${DIVIDER_CHAR.repeat(6)}</tspan><tspan fill="${val}"> ${stats.followerCount}</tspan>`,
    },
    {
      type: 'raw',
      text: `<tspan fill="${dotColor}">. </tspan><tspan fill="${labelColor}">Lines of Code on GitHub: </tspan><tspan fill="${dotColor}">${DIVIDER_CHAR}</tspan><tspan fill="${labelColor}"> ${(stats.loc.additions - stats.loc.deletions).toLocaleString()} (</tspan><tspan fill="${green}"> ${stats.loc.additions.toLocaleString()}++,</tspan><tspan fill="${red}"> ${stats.loc.deletions.toLocaleString()}--</tspan><tspan fill="${labelColor}"> )</tspan>`,
    },
  ];

  const artColX = 20;
  const rightColX = artColX + artMaxLen * charW + 40;
  const topPad = 30;
  const height = Math.max(artLines.length, rightLines.length) * lineHeight + topPad + 20;
  const width = rightColX + LINE_WIDTH * charW + 30;

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
      rightSVG += `<text x="${rightColX}" y="${y}" font-family="monospace" font-size="${fontSize}">${headerDivider(HEADER)}</text>\n`;
    } else if (l.type === 'section') {
      rightSVG += `<text x="${rightColX}" y="${y}" font-family="monospace" font-size="${fontSize}">${sectionDivider(l.title)}</text>\n`;
    } else if (l.type === 'raw') {
      rightSVG += `<text x="${rightColX}" y="${y}" font-family="monospace" font-size="${fontSize}">${l.text}</text>\n`;
    } else if (l.type === 'field') {
      rightSVG += `<text x="${rightColX}" y="${y}" font-family="monospace" font-size="${fontSize}">${field(l.l, l.v, labelColor, val, dotColor)}</text>\n`;
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" rx="10" fill="${bg}" stroke="#30363d" stroke-width="1"/>
  ${artSVG}
  ${rightSVG}
</svg>`;
}

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

  fs.mkdirSync('generated', { recursive: true });
  fs.writeFileSync('generated/profile-card.svg', buildSVG(stats));
})();
