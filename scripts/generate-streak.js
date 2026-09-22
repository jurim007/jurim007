const fs = require("fs");
const path = require("path");
const https = require("https");

// ============================================================
// Configuration
// ============================================================

const TOKEN = process.env.GH_TOKEN;
const USER = process.env.GH_USER || "jurim007";

if (!TOKEN) {
  console.error("Missing GH_TOKEN environment variable.");
  process.exit(1);
}

// ============================================================
// GitHub GraphQL
// ============================================================

function graphql(query, variables) {
  const body = JSON.stringify({
    query,
    variables,
  });

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
                  parsed.errors
                    .map((error) => error.message)
                    .join("\n")
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

// ============================================================
// Date helpers
// ============================================================

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

  result.setUTCDate(
    result.getUTCDate() + amount
  );

  return result;
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ============================================================
// Fetch GitHub contributions
// ============================================================

async function getContributionDays() {
  const today = dateOnlyUTC();

  // Go back one year so streaks crossing New Year still work.
  const from = new Date(today);

  from.setUTCFullYear(
    from.getUTCFullYear() - 1
  );

  // Include today safely in the query range.
  const to = addDays(today, 1);

  const query = `
    query(
      $login: String!,
      $from: DateTime!,
      $to: DateTime!
    ) {
      user(login: $login) {
        contributionsCollection(
          from: $from,
          to: $to
        ) {
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
    throw new Error(
      `GitHub user "${USER}" was not found.`
    );
  }

  return data.user
    .contributionsCollection
    .contributionCalendar
    .weeks
    .flatMap((week) => week.contributionDays)
    .map((day) => ({
      date: day.date,
      count: day.contributionCount,
    }));
}

// ============================================================
// Calculate current streak
// ============================================================

function calculateStreak(days) {
  const contributions = new Map(
    days.map((day) => [
      day.date,
      day.contributionCount ?? day.count,
    ])
  );

  const today = dateOnlyUTC();

  let cursor = today;

  /*
   * If today doesn't have a contribution yet, yesterday is
   * allowed to remain the end of the current streak.
   *
   * This prevents your streak from disappearing at midnight
   * before you've had a chance to contribute that day.
   */

  if (
    (contributions.get(dateKey(cursor)) || 0) === 0
  ) {
    cursor = addDays(cursor, -1);
  }

  const end = new Date(cursor);

  let streak = 0;

  while (
    (contributions.get(dateKey(cursor)) || 0) > 0
  ) {
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

// ============================================================
// Generate SVG
// ============================================================

function generateSVG({
  streak,
  start,
  end,
}) {
  // ----------------------------------------------------------
  // Card dimensions
  // ----------------------------------------------------------

  const WIDTH = 300;
  const HEIGHT = 110;

  // ----------------------------------------------------------
  // Colors
  // ----------------------------------------------------------

  const BG = "#0D1117";
  const BORDER = "#30363D";

  const ACCENT = "#E0A458";
  const TEXT = "#C9D1D9";

  // ----------------------------------------------------------
  // Dates
  // ----------------------------------------------------------

  const dateRange =
    streak > 0
      ? `${formatDate(start)} - ${formatDate(end)}`
      : "No active streak";

  // ----------------------------------------------------------
  // SVG
  // ----------------------------------------------------------

  return `
<svg
  width="${WIDTH}"
  height="${HEIGHT}"
  viewBox="0 0 ${WIDTH} ${HEIGHT}"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-label="GitHub current streak: ${streak}"
>

  <title>GitHub Current Streak: ${streak}</title>

  <!-- ======================================================
       CARD BACKGROUND
       ====================================================== -->

  <rect
    x="0.5"
    y="0.5"
    width="${WIDTH - 1}"
    height="${HEIGHT - 1}"
    rx="10"
    fill="${BG}"
    stroke="${BORDER}"
  />


  <!-- ======================================================
       LEFT STREAK INDICATOR

       This is intentionally a PATH rather than a circle.

       The missing section at the top creates a real gap
       for the flame instead of drawing a circle behind it.
       ====================================================== -->

  <path
    d="
      M 52 25

      A 34 34
      0
      1
      0
      80 25
    "
    fill="none"
    stroke="${ACCENT}"
    stroke-width="4"
    stroke-linecap="round"
  />


  <!-- ======================================================
       FLAME

       Separate outlined flame sitting inside the gap.
       Nothing is being masked or painted over the ring,
       which keeps the intersection clean.
       ====================================================== -->

  <g
    transform="translate(56.5 7)"
    fill="none"
    stroke="${ACCENT}"
    stroke-width="2.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >

    <path
      d="
        M 9.5 1

        C 9.8 4.5,
          8.8 6.6,
          7.2 8.6

        C 5.7 10.4,
          4.5 12,
          4.5 14.5

        C 4.5 18.7,
          7.4 21.5,
          11 21.5

        C 14.8 21.5,
          17.5 18.6,
          17.5 14.6

        C 17.5 11.2,
          15.6 8.6,
          13.3 6.2

        C 13.5 9.2,
          12.2 11,
          10.4 11

        C 8.5 11,
          7.4 9.5,
          7.7 7.7

        C 8 5.6,
          9.2 3.4,
          9.5 1

        Z
      "
    />

  </g>


  <!-- ======================================================
       STREAK NUMBER
       ====================================================== -->

  <text
    x="66"
    y="65"
    text-anchor="middle"
    fill="${TEXT}"
    font-size="23"
    font-weight="600"
    font-family="
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      'Liberation Mono',
      'Courier New',
      monospace
    "
  >${streak}</text>


  <!-- ======================================================
       RIGHT SIDE
       ====================================================== -->

  <!-- Current Streak -->

  <text
    x="124"
    y="50"
    fill="${ACCENT}"
    font-size="14"
    font-weight="600"
    font-family="
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      'Liberation Mono',
      'Courier New',
      monospace
    "
  >Current Streak</text>


  <!-- Date range -->

  <text
    x="124"
    y="71"
    fill="${TEXT}"
    font-size="11"
    font-weight="400"
    font-family="
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      'Liberation Mono',
      'Courier New',
      monospace
    "
  >${dateRange}</text>

</svg>
`.trim();
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(
    `Fetching GitHub contributions for ${USER}...`
  );

  const days =
    await getContributionDays();

  const result =
    calculateStreak(days);

  console.log(
    `Current streak: ${result.streak}`
  );

  if (result.streak > 0) {
    console.log(
      `Streak range: ${dateKey(result.start)} -> ${dateKey(result.end)}`
    );
  }

  // Generate SVG
  const svg =
    generateSVG(result);

  // Output location
  const output = path.join(
    process.cwd(),
    "generated",
    "streak-card.svg"
  );

  // Make generated/ if it doesn't exist.
  fs.mkdirSync(
    path.dirname(output),
    {
      recursive: true,
    }
  );

  fs.writeFileSync(
    output,
    svg,
    "utf8"
  );

  console.log(
    `Generated: ${output}`
  );
}

// ============================================================
// Run
// ============================================================

main().catch((error) => {
  console.error(
    "Failed to generate streak card:"
  );

  console.error(error);

  process.exit(1);
});