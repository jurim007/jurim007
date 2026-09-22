const fs = require("fs");
const path = require("path");
const https = require("https");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.GH_TOKEN;
const USER = process.env.GH_USER || "jurim007";

if (!TOKEN) {
  console.error("Missing GH_TOKEN environment variable.");
  process.exit(1);
}

// Card
const WIDTH = 300;
const HEIGHT = 110;

// Colors
const BG = "#0D1117";
const BORDER = "#30363D";
const ACCENT = "#E0A458";
const TEXT = "#C9D1D9";

// ============================================================
// GITHUB GRAPHQL
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
// DATE HELPERS
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
// GET CONTRIBUTION DATA
// ============================================================

async function getContributionDays() {
  const today = dateOnlyUTC();

  // Fetch enough history for long streaks and streaks crossing
  // the new year.
  const from = new Date(today);

  from.setUTCFullYear(
    from.getUTCFullYear() - 1
  );

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
// CALCULATE CURRENT STREAK
// ============================================================

function calculateStreak(days) {
  const contributions = new Map(
    days.map((day) => [
      day.date,
      day.count,
    ])
  );

  const today = dateOnlyUTC();

  let cursor = today;

  /*
   * If you haven't contributed today yet, yesterday is still
   * allowed to count as the end of the current streak.
   *
   * This prevents the streak from showing 0 immediately after
   * midnight.
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
// SVG GENERATOR
// ============================================================

function generateSVG({
  streak,
  start,
  end,
}) {
  const dateRange =
    streak > 0
      ? `${formatDate(start)} - ${formatDate(end)}`
      : "No active streak";

  /*
   * Original flame path supplied by you.
   *
   * Original viewBox:
   *
   *     0 0 56 56
   *
   * We scale it down instead of modifying the path itself,
   * preserving the original flame proportions.
   */

  const flamePath = `
    M 8.1250 37.3984
    C 8.1250 46.9141 15.9063 53.6406 26.8750 53.6406
    C 39.3203 53.6406 47.8750 45.6016 47.8750 32.3828
    C 47.8750 11.7578 29.7812 2.3594 16.5860 2.3594
    C 14.5000 2.3594 13.4687 3.3906 13.4687 4.5859
    C 13.4687 5.5469 13.9844 6.3437 14.7578 7.4453
    C 16.6328 10.0234 19.8203 13.7734 19.8203 18.4844
    C 19.8203 18.8828 19.7969 19.2813 19.7500 19.7031
    C 18.4375 17.2422 16.1172 15.5078 13.3047 15.5078
    C 12.5078 15.5078 12.0860 15.9766 12.0860 16.6562
    C 12.0860 17.4766 12.2734 18.0625 12.2734 20.6172
    C 12.2734 25.5156 8.1250 28.8203 8.1250 37.3984
    Z

    M 27.3438 47.0547
    C 22.6563 47.0547 19.5391 44.2187 19.5391 40.0000
    C 19.5391 35.5703 22.6797 34.0000 23.1016 31.1406
    C 23.1250 30.9062 23.2891 30.8359 23.4531 31.0000
    C 24.6250 32.0078 25.3516 33.2734 25.9141 34.7266
    C 26.0312 34.9844 26.2187 35.0078 26.3360 34.7969
    C 27.6250 32.5469 27.8594 29.1953 27.5547 24.9766
    C 27.5078 24.7422 27.6719 24.6250 27.8828 24.7187
    C 33.4375 27.2500 36.2734 32.7578 36.2734 37.7031
    C 36.2734 42.6719 33.3438 47.0547 27.3438 47.0547
    Z
  `;

  return `
<svg
  width="${WIDTH}"
  height="${HEIGHT}"
  viewBox="0 0 ${WIDTH} ${HEIGHT}"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-label="GitHub current streak: ${streak}"
>

  <title>GitHub Current Streak: ${streak}</title>


  <!-- ======================================================
       BACKGROUND
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
       STREAK RING

       Center: 66, 57
       Radius: 34

       Instead of drawing a complete circle, the ring stops
       on either side of the flame.

       This gives us a REAL opening rather than covering part
       of a circle with the background color.

       The two endpoints are deliberately positioned to follow
       the bottom-left and bottom-right silhouette of the flame.
       ====================================================== -->


  <!-- LEFT + BOTTOM + RIGHT portion of ring -->

  <path
    d="
      M 51.2 26.4

      C 39.8 31.8
        32 43.3
        32 57

      C 32 75.8
        47.2 91
        66 91

      C 84.8 91
        100 75.8
        100 57

      C 100 43.1
        91.9 31.4
        80.1 26.2
    "
    fill="none"
    stroke="${ACCENT}"
    stroke-width="4"
    stroke-linecap="round"
    stroke-linejoin="round"
  />


  <!-- ======================================================
       FLAME

       Exact path supplied from flame-fill-svgrepo-com.svg.

       Original:
           viewBox="0 0 56 56"

       Scale:
           0.40

       This gives the flame roughly a 22px × 22px footprint.

       It is centered directly above the streak number.
       ====================================================== -->

  <g
    transform="
      translate(54.8 6)
      scale(0.40)
    "
  >

    <path
      d="${flamePath}"
      fill="${ACCENT}"
      fill-rule="evenodd"
      clip-rule="evenodd"
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
    font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
  >${streak}</text>


  <!-- ======================================================
       CURRENT STREAK LABEL
       ====================================================== -->

  <text
    x="124"
    y="50"
    fill="${ACCENT}"
    font-size="14"
    font-weight="600"
    font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
  >Current Streak</text>


  <!-- ======================================================
       DATE RANGE
       ====================================================== -->

  <text
    x="124"
    y="71"
    fill="${TEXT}"
    font-size="11"
    font-weight="400"
    font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
  >${dateRange}</text>

</svg>
`.trim();
}

// ============================================================
// MAIN
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

  const svg =
    generateSVG(result);

  const output = path.join(
    process.cwd(),
    "generated",
    "streak-card.svg"
  );

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
// RUN
// ============================================================

main().catch((error) => {
  console.error(
    "Failed to generate streak card:"
  );

  console.error(error);

  process.exit(1);
});