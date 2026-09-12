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

// Static ASCII portrait (generated once from a photo — doesn't need regenerating)
const ASCII_ART = `                ....                          
             .-=++=++=--::.                   
           .:+**######*****+=:                
          :+*###%%%%@%%%%%##%#+-              
         :*##*+**####*++++**#%%#:             
        -##+-----==--------=++*#*.            
        +*--::::::::::::::---==**-            
       :*=---::::.....::::::--==##:           
       :*==-::::--:::::-=++=====*#-           
       :*+=-==++++=-::-+++===++=+#:           
        ++====+++++-::=++++*+++==*.           
        -+-=++++===-.:-----====-=+::          
        .=------::-:..---::::::-=+++:         
       :-=--::::::--::-=--::::--=++=:         
       :++=--:::::=+==++=::::--==*+=:         
        -++=--::::=++++++-----=++*+-.         
        .-++=----==++++++++===++**-.          
         .=++===++++===+++++=+****:           
          .++++++====++===+++*****.           
           =*****+==+++++++**#*##=            
           -#*****+*********###%%=            
           .*#*#***####**#%%###%%*.           
            :#%%#########%%%%%%%#+-           
             -*#%%%%%%%%%%%%%%#*++=--.        
              -+**####%####*++=======. .      
             .-====================-. .       
             ..==================-:           
             ...-=========-====-:.            
              .. .:---====---:.               
               ..   ..::::..                  `;

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
  return { additions, deletions };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// label ..... value   (dot leader padded to a fixed character width)
function field(label, value, labelColor, valueColor, dotColor, width = 34) {
  const plain = `${label}: `;
  const dotCount = Math.max(2, width - plain.length);
  const dots = '.'.repeat(dotCount);
  return `<tspan fill="${labelColor}">${esc(label)}: </tspan><tspan fill="${dotColor}">${dots}</tspan><tspan fill="${valueColor}"> ${esc(value)}</tspan>`;
}

function sectionHeader(title, totalWidth = 56) {
  const label = ` ${title} `;
  const dashCount = Math.max(4, totalWidth - label.length);
  return `<tspan fill="#c9d1d9" font-weight="bold">-${label}</tspan><tspan fill="#30363d">${'-'.repeat(dashCount)}</tspan>`;
}

function buildSVG(stats) {
  const bg = '#0d1117';
  const artColor = '#8b949e';
  const label = '#c9d1d9';
  const dot = '#30363d';
  const val = '#e3b341';
  const green = '#3fb950';
  const red = '#f85149';

  const artLines = ASCII_ART.split('\n');
  const lineHeight = 15;
  const fontSize = 12;

  const rightLines = [
    { type: 'header' },
    { type: 'section', text: sectionHeader('OS') },
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
    { type: 'section', text: sectionHeader('Contact') },
    { type: 'field', l: 'Email', v: CONTACT.email },
    { type: 'field', l: 'LinkedIn', v: CONTACT.linkedin },
    { type: 'field', l: 'Discord', v: CONTACT.discord },
    { type: 'blank' },
    { type: 'section', text: sectionHeader('GitHub Stats') },
    {
      type: 'raw',
      text: `<tspan fill="${label}">Repos: </tspan><tspan fill="${dot}">${'.'.repeat(4)}</tspan><tspan fill="${val}"> ${stats.repoCount} </tspan><tspan fill="${val}">{Contributed: ${stats.contributedCount}}</tspan><tspan fill="${label}"> | Stars: </tspan><tspan fill="${dot}">${'.'.repeat(9)}</tspan><tspan fill="${val}"> ${stats.starCount}</tspan>`,
    },
    {
      type: 'raw',
      text: `<tspan fill="${label}">Commits: </tspan><tspan fill="${dot}">${'.'.repeat(18)}</tspan><tspan fill="${val}"> ${stats.commitCount.toLocaleString()}</tspan><tspan fill="${label}"> | Followers: </tspan><tspan fill="${dot}">${'.'.repeat(6)}</tspan><tspan fill="${val}"> ${stats.followerCount}</tspan>`,
    },
    {
      type: 'raw',
      text: `<tspan fill="${label}">Lines of Code on GitHub: </tspan><tspan fill="${dot}">.</tspan><tspan fill="${label}"> ${stats.loc.additions.toLocaleString() - stats.loc.deletions.toLocaleString() >= 0 ? '' : ''}${(stats.loc.additions - stats.loc.deletions).toLocaleString()} (</tspan><tspan fill="${green}"> ${stats.loc.additions.toLocaleString()}++,</tspan><tspan fill="${red}"> ${stats.loc.deletions.toLocaleString()}--</tspan><tspan fill="${label}"> )</tspan>`,
    },
  ];

  const rightColX = 480;
  const artColX = 20;
  const topPad = 30;
  const height = Math.max(artLines.length, rightLines.length) * lineHeight + topPad + 20;
  const width = 980;

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
      rightSVG += `<text x="${rightColX}" y="${y}" font-family="monospace" font-size="${fontSize}"><tspan fill="${val}" font-weight="bold">${esc(HEADER)}</tspan><tspan fill="${dot}"> ${'-'.repeat(46)}</tspan></text>\n`;
    } else if (l.type === 'section' || l.type === 'raw') {
      rightSVG += `<text x="${rightColX}" y="${y}" font-family="monospace" font-size="${fontSize}">${l.text}</text>\n`;
    } else if (l.type === 'field') {
      rightSVG += `<text x="${rightColX}" y="${y}" font-family="monospace" font-size="${fontSize}">${field(l.l, l.v, label, val, dot)}</text>\n`;
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

  fs.writeFileSync('profile-card.svg', buildSVG(stats));
})();