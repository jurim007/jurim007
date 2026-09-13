const fs = require('fs');
const path = require('path');

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.METRICS_TOKEN;

const OUT_DIR = 'generated';

// Drop your own small icon PNGs here with these exact filenames.
const ICONS = {
  streak: 'assets/icons/streak.png',
  pr: 'assets/icons/pr.png',
  issues: 'assets/icons/issues.png',
  member: 'assets/icons/member.png',
  language: 'assets/icons/language.png',
  forks: 'assets/icons/forks.png',
};

function iconB64(key) {
  const p = ICONS[key];
  if (!p || !fs.existsSync(p)) return null;
  return fs.readFileSync(p).toString('base64');
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

// side: 'left'  -> icon, value, label   (icon nearest the LEFT edge)
// side: 'right' -> label, value, icon   (icon nearest the RIGHT edge — mirror of left)
// edgeMargin adds baked-in blank space on the OUTER edge, so the pair
// naturally spreads wider once centered as a row in the README.
// Layout constants pulled out so naturalWidth() and stackedStats() can't drift apart.
const ROW_HEIGHT = 34;
const FONT_SIZE = 15;
const SMALL_FONT_SIZE = FONT_SIZE * 0.8;
const CHAR_W = FONT_SIZE * 0.62;
const SMALL_CHAR_W = SMALL_FONT_SIZE * 0.62;
const ICON_SIZE = 20;
const GAP = 8;
// How far the icon/stat text sits from the TRUE outer edge of the whole
// centered row (left edge for the left block, right edge for the right
// block). Bump this up to push both blocks further out toward the readme's
// full width; bring it down to pull them in closer to the girls image.
const EDGE_MARGIN = 220;

// The width this block of rows would naturally render at, based purely on
// its own text — i.e. with no forced/shared width applied. Used to figure
// out which of the left/right blocks is wider so the narrower one can be
// padded out to match.
function naturalWidth(rows, edgeMargin = EDGE_MARGIN) {
  const contentWidths = rows.map((r) => {
    const valueW = String(r.value).length * CHAR_W;
    const labelW = r.label.length * SMALL_CHAR_W;
    return ICON_SIZE + GAP + valueW + GAP + labelW;
  });
  return Math.ceil(Math.max(...contentWidths)) + edgeMargin;
}

// `width` is always passed in explicitly (see naturalWidth() above / the
// shared width computed in the IIFE below) rather than derived here, so that
// the left and right blocks can be rendered at an identical width — that's
// what keeps them symmetric (and the centered image between them truly
// centered) regardless of which side has longer labels/values.
function stackedStats(rows, side, width, edgeMargin = EDGE_MARGIN) {
  const rowHeight = ROW_HEIGHT;
  const fontSize = FONT_SIZE;
  const smallFontSize = SMALL_FONT_SIZE;
  const charW = CHAR_W;
  const smallCharW = SMALL_CHAR_W;
  const iconSize = ICON_SIZE;
  const gap = GAP;

  const height = rows.length * rowHeight;

  const rowsSVG = rows
    .map((r, i) => {
      const y = i * rowHeight + rowHeight / 2 + 5;
      const iconY = i * rowHeight + (rowHeight - iconSize) / 2;
      const b64 = iconB64(r.key);
      const valueW = String(r.value).length * charW;
      const labelW = r.label.length * smallCharW;

      if (side === 'left') {
        const iconX = edgeMargin; // icon sits at the outer (left) edge
        const valueX = iconX + iconSize + gap;
        const labelX = valueX + valueW + gap;
        const iconTag = b64
          ? `<image href="data:image/png;base64,${b64}" x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" />`
          : '';
        return `
  ${iconTag}
  <text x="${valueX}" y="${y}" font-family="monospace" font-size="${fontSize}" font-weight="bold" fill="#e0a458">${esc(r.value)}</text>
  <text x="${labelX}" y="${y}" font-family="monospace" font-size="${smallFontSize}" fill="#c9d1d9">${esc(r.label)}</text>`;
      } else {
        // build from the right edge inward: icon, then value, then label
        const iconX = width - edgeMargin - iconSize;
        const valueX = iconX - gap - valueW;
        const labelX = valueX - gap - labelW;
        const iconTag = b64
          ? `<image href="data:image/png;base64,${b64}" x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" />`
          : '';
        return `
  <text x="${labelX}" y="${y}" font-family="monospace" font-size="${smallFontSize}" fill="#c9d1d9">${esc(r.label)}</text>
  <text x="${valueX}" y="${y}" font-family="monospace" font-size="${fontSize}" font-weight="bold" fill="#e0a458">${esc(r.value)}</text>
  ${iconTag}`;
      }
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rowsSVG}
</svg>`;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const user = await getMisc();
  const longestStreak = await getLongestStreak(user.createdAt);
  const totalForks = user.repositories.nodes.reduce((sum, r) => sum + r.forkCount, 0);
  const lang = topLanguage(user.repositories.nodes);
  const memberSinceYear = new Date(user.createdAt).getFullYear();

  const leftRows = [
    { key: 'streak', value: longestStreak, label: 'Longest Streak' },
    { key: 'pr', value: user.pullRequests.totalCount, label: 'Pull Requests' },
    { key: 'issues', value: user.issues.totalCount, label: 'Issues' },
  ];

  const rightRows = [
    { key: 'member', value: memberSinceYear, label: 'Member Since' },
    { key: 'language', value: lang, label: 'Top Language' },
    { key: 'forks', value: totalForks, label: 'Forks' },
  ];

  // Whichever side needs more room dictates the shared width; the other
  // side just gets padded out to match (blank space added away from its
  // outer edge, so its icon/text stays flush against the true left/right
  // edge of the whole row — see the side==='left' vs 'right' branches above).
  const sharedWidth = Math.max(naturalWidth(leftRows), naturalWidth(rightRows));

  fs.writeFileSync(path.join(OUT_DIR, 'side-stats-left.svg'), stackedStats(leftRows, 'left', sharedWidth));
  fs.writeFileSync(path.join(OUT_DIR, 'side-stats-right.svg'), stackedStats(rightRows, 'right', sharedWidth));
})();