const fetch = require("node-fetch");

const GITHUB_TOKEN = process.env.PERSONAL_TOKEN;
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

const ORG = "LinkYou-2025";
const TARGET_OFFSET_DAYS = -1;

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

async function gh(url) {
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

  return res.json();
}

async function getAllRepos() {
  let page = 1;
  const repos = [];

  while (true) {
    const data = await gh(
      `https://api.github.com/orgs/${ORG}/repos?per_page=100&page=${page}`
    );

    if (!data.length) break;

    repos.push(...data);
    page++;
  }

  return repos;
}

async function getCommits(repo, since, until) {
  let page = 1;
  const commits = [];

  while (true) {
    const data = await gh(
      `https://api.github.com/repos/${ORG}/${repo}/commits?since=${encodeURIComponent(
        since
      )}&until=${encodeURIComponent(until)}&per_page=100&page=${page}`
    );

    if (!data.length) break;

    commits.push(...data);
    page++;
  }

  return commits;
}

async function run() {
  const targetDate = getTargetKstDateString();
  const { since, until } = getKstDayUtcRange(targetDate);

  console.log("===== JOBDORI START =====");
  console.log("Target:", targetDate);

  const repos = await getAllRepos();

  console.log(
    repos.map((r) => `${r.name} (${r.private ? "private" : "public"})`)
  );

  const countMap = {};
  const seenSha = new Set();

  for (const repo of repos) {
    console.log(`조회중 : ${repo.name}`);

    try {
      const commits = await getCommits(repo.name, since, until);

      console.log(`${repo.name}: ${commits.length} commits`);

      for (const c of commits) {
        if (!c.sha) continue;

        if (seenSha.has(c.sha)) continue;
        seenSha.add(c.sha);

        if (c.parents && c.parents.length > 1) continue;

        const login =
          c.author?.login ||
          c.commit?.author?.name ||
          "Unknown";

        if (login.endsWith("[bot]")) continue;

        countMap[login] = (countMap[login] || 0) + 1;
      }
    } catch (e) {
      console.log(`${repo.name} 실패`);
      console.log(e.message);
    }
  }

  const sorted = Object.entries(countMap).sort(
    (a, b) => b[1] - a[1]
  );

  let message = "";

  if (!sorted.length) {
    message = `📭 ${targetDate} (KST) 커밋이 없습니다...\n내일은 모두 화이팅!`;
  } else {
    message = `🏆 ${targetDate} (KST) 하루를 빛낸 기여왕!\n\n`;

    let prevCount = null;
    let rank = 0;

    for (let i = 0; i < sorted.length; i++) {
      const [user, count] = sorted[i];

      if (count !== prevCount) {
        rank = i + 1;
      }

      if (rank > 3) break;

      prevCount = count;

      const medal = {
        1: "👑",
        2: "🥈",
        3: "🥉",
      }[rank];

      const tie =
        (i > 0 && sorted[i - 1][1] === count) ||
        (i < sorted.length - 1 && sorted[i + 1][1] === count);

      message += `${medal} ${
        tie ? `공동 ${rank}위` : `${rank}위`
      } ${user} — ${count} commits\n`;
    }

    message += "\n오늘도 링큐를 움직인 최고의 개발자들~ 🚀";
  }

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
  console.error(e);
  process.exit(1);
});