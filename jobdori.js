const fetch = require("node-fetch");

const GITHUB_TOKEN = process.env.PERSONAL_TOKEN;
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;

const ORG = "LinkYou-2025";
const TARGET_OFFSET_DAYS = 0;

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
  const since = new Date(Date.UTC(y, m - 1, d, -9, 0, 0, 0));
  const until = new Date(Date.UTC(y, m - 1, d, 14, 59, 59, 999));
  return { since: since.toISOString(), until: until.toISOString() };
}

function addDaysUTC(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function getTargetKstDateString() {
  const todayKst = kstDateString(new Date());
  const { since } = getKstDayUtcRange(todayKst);
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

// 전체 레포 조회
async function getAllOrgRepos() {
  let page = 1;
  let allRepos = [];

  while (true) {
    const repos = await gh(
      `https://api.github.com/orgs/${ORG}/repos?per_page=100&page=${page}`
    );

    if (!Array.isArray(repos) || repos.length === 0) break;

    allRepos = allRepos.concat(repos);
    page++;
  }

  return allRepos;
}

async function getBranches(repo) {
  return gh(`https://api.github.com/repos/${ORG}/${repo}/branches?per_page=100`);
}

async function getCommits(repo, branch, since, until) {
  const url =
    `https://api.github.com/repos/${ORG}/${repo}/commits` +
    `?sha=${encodeURIComponent(branch)}` +
    `&since=${encodeURIComponent(since)}` +
    `&until=${encodeURIComponent(until)}` +
    `&per_page=100`;

  return gh(url);
}

async function run() {
  const targetKst = getTargetKstDateString();
  const { since, until } = getKstDayUtcRange(targetKst);

  console.log(`Target KST = ${targetKst}`);
  console.log(`UTC range since=${since} until=${until}`);

  const repos = await getAllOrgRepos();
  if (!Array.isArray(repos)) return;

  const countMap = {};
  const seenSha = new Set();

  for (const repo of repos) {
    const branches = await getBranches(repo.name);
    if (!Array.isArray(branches)) continue;

    for (const b of branches) {
      const commits = await getCommits(repo.name, b.name, since, until);
      if (!Array.isArray(commits)) continue;

      for (const c of commits) {
        if (!c?.sha || !c?.author) continue; // GitHub 유저 없는 커밋 제외

        if (seenSha.has(c.sha)) continue;
        seenSha.add(c.sha);

        // merge commit 제외
        if (Array.isArray(c.parents) && c.parents.length > 1) continue;

        const key = c.author.login;
        if (key.endsWith("[bot]")) continue;

        countMap[key] = (countMap[key] || 0) + 1;
      }
    }
  }

  const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]);

  let message = "";

  if (sorted.length === 0) {
    message = `📭 ${targetKst} (KST) 커밋이 없습니다...\n내일 열심히 해주시겠죠..? 🥲`;
  } else {
    message = `🏆 ${targetKst} (KST) 오늘자 귀염둥이 기여왕!\n\n`;

    let prevCnt = null;
    let displayRank = 0;

    for (let i = 0; i < sorted.length; i++) {
      const [user, cnt] = sorted[i];

      if (cnt !== prevCnt) {
        displayRank = i + 1;
      }

      if (displayRank > 3) break;

      prevCnt = cnt;

      const medalMap = {
        1: "👑",
        2: "🥈",
        3: "🥉",
      };

      const medal = medalMap[displayRank] || "";

      const isTie =
        (i > 0 && cnt === sorted[i - 1][1]) ||
        (i < sorted.length - 1 && cnt === sorted[i + 1][1]);

      const rankText = isTie ? `공동 ${displayRank}위` : `${displayRank}위`;

      message += `${medal} ${rankText} ${user} — ${cnt} commits\n`;
    }

    message += "\n오늘도 링큐를 움직인 최고의 개발자들~ 🚀";
  }

  await fetch(DISCORD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });

  console.log("디스코드 전송 완료!");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
