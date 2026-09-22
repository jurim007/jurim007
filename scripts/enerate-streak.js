const fs = require("fs");
const path = require("path");
const https = require("https");

const TOKEN = process.env.GH_TOKEN;
const USER = process.env.GH_USER || "jurim007";

if (!TOKEN) {
  console.error("Missing GH_TOKEN environment variable.");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// GitHub GraphQL
// ─────────────────────────────────────────────────────────────

function graphql(query, variables) {
  const body = JSON.stringify({ query, variables });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.github.com",
        path: "/graphql",
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "User-Agent": "streak-card-generator",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);

            if (parsed.errors) {
              reject(
                new Error(
                  parsed.errors.map((error) => error.message).join("\n")
                )
              );
              return;
            }

            resolve(parsed.data);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────

function dateOnlyUTC(date = new Date()) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate()
    )
  );
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ─────────────────────────────────────────────────────────────
// Get contribution calendar
// ─────────────────────────────────────────────────────────────

async function getContributionDays() {
  // Give ourselves enough history to calculate a streak crossing
  // the previous calendar year.
  const today = dateOnlyUTC();

  const from = new Date(today);
  from.setUTCFullYear(from.getUTCFullYear() - 1);

  const to = addDays(today, 1);

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
    login: USER,
    from: from.toISOString(),
    to: to.toISOString(),
  });

  if (!data.user) {
    throw new Error(`GitHub user "${USER}" was not found.`);
  }

  return data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((week) => week.contributionDays)
    .map((day) => ({
      date: day.date,
      count: day.contributionCount,
    }));
}

// ─────────────────────────────────────────────────────────────
// Calculate current streak
// ─────────────────────────────────────────────────────────────

function calculateStreak(days) {
  const contributions = new Map(
    days.map((day) => [day.date, day.count])
  );

  const today = dateOnlyUTC();

  /*
   * Same useful behavior as most streak cards:
   *
   * If today has contributions, start from today.
   * If today doesn't yet have contributions, allow yesterday's
   * streak to remain active.
   */
  let cursor = today;

  if ((contributions.get(dateKey(cursor)) || 0) === 0) {
    cursor = addDays(cursor, -1);
  }

  const end = new Date(cursor);
  let streak = 0;

  while ((contributions.get(dateKey(cursor)) || 0) > 0) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  if (streak === 0) {
    return {
      streak: 0,
      start: today,
      end: today,
    };
  }

  return {
    streak,
    start: addDays(cursor, 1),
    end,
  };
}

// ─────────────────────────────────────────────────────────────
// SVG
// ─────────────────────────────────────────────────────────────

function generateSVG({ streak, start, end }) {
  const WIDTH = 300;
  const HEIGHT = 110;

  const BG = "#0D1117";
  const BORDER = "#30363D";
  const ACCENT = "#E0A458";
  const TEXT = "#C9D1D9";

  const dateRange =
    streak > 0
      ? `${formatDate(start)} - ${formatDate(end)}`
      : "No active streak";

  return `<svg
  width="${WIDTH}"
  height="${HEIGHT}"
  viewBox="0 0 ${WIDTH} ${HEIGHT}"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-label="GitHub current streak: ${streak}"
>
  <!-- Card -->
  <rect
    x="0.5"
    y="0.5"
    width="${WIDTH - 1}"
    height="${HEIGHT - 1}"
    rx="10"
    fill="${BG}"
    stroke="${BORDER}"
  />

  <!-- Left: streak ring -->
  <circle
    cx="66"
    cy="57"
    r="34"
    stroke="${ACCENT}"
    stroke-width="4"
    fill="none"
  />

  <!-- Flame -->
  <g transform="translate(58 10)">
    <path
      d="
        M8 0
        C10 7 16 8 16 15
        C16 21 12.4 25 8 25
        C3.6 25 0 21.4 0 16.5
        C0 12.2 2.4 9.4 5.1 6.7
        C5 10.8 7.1 12.4 9 12.4
        C11.2 12.4 12.5 10.6 12.5 8.7
        C12.5 5.6 10.1 3.8 8 0
        Z
      "
      fill="${BG}"
      stroke="${ACCENT}"
      stroke-width="2.5"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  </g>

  <!-- Streak number -->
  <text
    x="66"
    y="64"
    text-anchor="middle"
    fill="${TEXT}"
    font-size="23"
    font-weight="600"
    font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
  >${streak}</text>

  <!-- Right: label -->
  <text
    x="125"
    y="49"
    fill="${ACCENT}"
    font-size="14"
    font-weight="600"
    font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
  >Current Streak</text>

  <!-- Right: dates -->
  <text
    x="125"
    y="70"
    fill="${TEXT}"
    font-size="11"
    font-weight="400"
    font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
  >${dateRange}</text>
</svg>
`;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching contributions for ${USER}...`);

  const days = await getContributionDays();
  const result = calculateStreak(days);

  console.log(`Current streak: ${result.streak}`);

  if (result.streak > 0) {
    console.log(
      `Range: ${dateKey(result.start)} -> ${dateKey(result.end)}`
    );
  }

  const svg = generateSVG(result);

  const output = path.join(
    process.cwd(),
    "generated",
    "streak-card.svg"
  );

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, svg, "utf8");

  console.log(`Generated ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});