const GITHUB_TOKEN = process.env.PERSONAL_TOKEN;
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

const ORG = "LinkYou-2025";
const TARGET_OFFSET_DAYS = -1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function kstDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getKstDayUtcRange(kstYYYYMMDD) {
  const [y, m, d] = kstYYYYMMDD.split("-").map(Number);

  return {
    since: new Date(Date.UTC(y, m - 1, d - 1, 15, 0, 0)).toISOString(),
    until: new Date(Date.UTC(y, m - 1, d, 14, 59, 59, 999)).toISOString(),
  };
}

function addDaysUTC(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function getTargetKstDateString() {
  const today = kstDateString();
  const { since } = getKstDayUtcRange(today);
  const shifted = addDaysUTC(new Date(since), TARGET_OFFSET_DAYS);
  return kstDateString(shifted);
}

async function gh(url, retry = 3) {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "jobdori-bot",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status}: ${text}`);
    }

    return await res.json();
  } catch (e) {
    if (retry > 0) {
      console.log(`재시도 (${4 - retry}/3): ${url}`);
      await sleep(2000);
      return gh(url, retry - 1);
    }
    throw e;
  }
}

async function getAllOrgRepos() {
  let page = 1;
  const repos = [];

  while (true) {
    const data = await gh(
      `https://api.github.com/orgs/${ORG}/repos?per_page=100&page=${page}`
    );

    if (!Array.isArray(data) || data.length === 0) break;

    repos.push(...data);
    page++;
  }

  return repos;
}

async function getBranches(repo) {
  return gh(
    `https://api.github.com/repos/${ORG}/${repo}/branches?per_page=100`
  );
}

async function getCommits(repo, branch, since, until) {
  let page = 1;
  const commits = [];

  while (true) {
    const data = await gh(
      `https://api.github.com/repos/${ORG}/${repo}/commits?sha=${encodeURIComponent(
        branch
      )}&since=${encodeURIComponent(
        since
      )}&until=${encodeURIComponent(
        until
      )}&per_page=100&page=${page}`
    );

    if (!Array.isArray(data) || data.length === 0) break;

    commits.push(...data);
    page++;
  }

  return commits;
}

async function run() {
  console.log("===== JOBDORI START =====");

  const targetDate = getTargetKstDateString();
  const { since, until } = getKstDayUtcRange(targetDate);

  console.log("Target:", targetDate);

  const repos = await getAllOrgRepos();

  console.log(
    "레포 목록:",
    repos.map((r) => `${r.name} (${r.private ? "private" : "public"})`)
  );

  const countMap = {};
  const seenSha = new Set();

  for (const repo of repos) {
    console.log(`\n===== ${repo.name} =====`);

    let branches = [];

    try {
      branches = await getBranches(repo.name);
      console.log(`브랜치 ${branches.length}개`);
    } catch (e) {
      console.log(`${repo.name} 브랜치 조회 실패`);
      console.log(e.message);
      continue;
    }

    for (const branch of branches) {
      try {
        const commits = await getCommits(
          repo.name,
          branch.name,
          since,
          until
        );

        console.log(
          `${branch.name}: ${commits.length} commits`
        );

        for (const c of commits) {
          if (!c?.sha) continue;

          if (seenSha.has(c.sha)) continue;
          seenSha.add(c.sha);

          if (
            Array.isArray(c.parents) &&
            c.parents.length > 1
          ) {
            continue;
          }

          const login =
            c.author?.login ||
            c.commit?.author?.name ||
            "Unknown";

          if (login.endsWith("[bot]")) continue;

          countMap[login] = (countMap[login] || 0) + 1;
        }
      } catch (e) {
        console.log(`${repo.name}/${branch.name} 실패`);
        console.log(e.message);
      }
    }
  }

  console.log("\n최종 집계:", countMap);

  const sorted = Object.entries(countMap).sort(
    (a, b) => b[1] - a[1]
  );

  let message = "";

  if (sorted.length === 0) {
    message =
      `📭 ${targetDate} (KST) 커밋이 없습니다...\n` +
      `내일은 모두 화이팅! 💪`;
  } else {
    message = `🏆 ${targetDate} (KST) 하루를 빛낸 기여왕!\n\n`;

    let prevCount = null;
    let displayRank = 0;

    for (let i = 0; i < sorted.length; i++) {
      const [user, count] = sorted[i];

      if (count !== prevCount) {
        displayRank = i + 1;
      }

      if (displayRank > 3) break;

      prevCount = count;

      const medal = {
        1: "👑",
        2: "🥈",
        3: "🥉",
      }[displayRank] || "";

      const isTie =
        (i > 0 && sorted[i - 1][1] === count) ||
        (i < sorted.length - 1 && sorted[i + 1][1] === count);

      const rankText = isTie
        ? `공동 ${displayRank}위`
        : `${displayRank}위`;

      message += `${medal} ${rankText} ${user} — ${count} commits\n`;
    }

    message += "\n오늘도 링큐를 움직인 최고의 개발자들~ 🚀";
  }

  console.log("\n===== 결과 =====");
  console.log(message);

  await fetch(DISCORD_WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: message,
    }),
  });

  console.log("디스코드 전송 완료");
  console.log("===== JOBDORI END =====");
}

run().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});