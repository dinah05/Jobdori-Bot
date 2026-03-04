# 🤖 잡도리봇 (Jobdori-Bot)

> 팀의 기여를 매일 기록하고,
> 노력을 눈에 보이게 만드는 자동 랭킹 봇

---

## 👩🏻‍💻 Built By

PM으로서
**기획 → 운영 자동화 설계 → 직접 구현 → 배포**까지 진행한 프로젝트입니다.

> 기여는 숫자이기도 하지만, 문화이기도 합니다.
> 작은 자동화 하나가 팀의 분위기와 생산성을 바꿀 수 있다고 믿습니다.

---

## 📌 Why I Built This

팀을 운영하면서 이런 문제를 느꼈습니다.

* 누가 얼마나 기여했는지 매일 한눈에 확인하기 어렵다
* 열심히 한 사람을 즉시 칭찬해주고 싶다
* 팀 분위기를 건강한 경쟁 구조로 만들고 싶다

그래서 만들었습니다.

**매일 밤 11시, 그날의 기여왕을 자동 발표하는 디스코드 봇.**

---

## 🏗 Architecture Strategy

이 프로젝트는 **팀 조직 레포지토리를 수정하지 않습니다.**

대신:

* 봇은 PM의 **개인 레포지토리에서만 실행**
* GitHub REST API를 통해 **조직(Organization) 레포를 읽기 전용으로 조회**
* 집계 결과만 디스코드로 전송

### 설계 의도

* 팀 메인 레포에 불필요한 워크플로 추가 방지
* 조직 코드베이스와 완전 분리
* 운영 리스크 최소화
* 권한 최소화 원칙(Read-only) 적용
* PM이 독립적으로 자동화 실험 가능

> 개발 영역을 건드리지 않으면서도
> 팀 운영에 개입할 수 있는 구조를 설계했습니다.

---

## 🏆 What It Does

* 매일 **한국시간 23시 자동 실행**
* 팀 GitHub Organization 전체 레포지토리 조회
* 모든 브랜치의 당일 커밋 수 집계
* 중복 커밋 제거, Merge Commit 제외, Bot 계정 제외
* 상위 3명 랭킹 정렬
* 디스코드 자동 알림 발송

### Example Message

```
🏆 2026-03-04 (KST) 오늘자 귀염둥이 기여왕!

👑 1위 dinah05 — 12 commits
🥈 2위 dimo123 — 7 commits
🥉 3위 dainie5 — 4 commits

오늘도 (팀프로젝트명)을 움직인 최고의 개발자들~ 🚀
```

---

## ⚙️ Tech Stack

* Node.js
* GitHub REST API
* GitHub Actions (cron scheduling)
* Discord Webhook

---

## ⏰ GitHub Actions

```yaml
name: Daily King

on:
  schedule:
    - cron: "0 14 * * *"  # UTC 14시 = KST 23시
  workflow_dispatch:

jobs:
  run-script:
    runs-on: ubuntu-latest
```

* 매일 자동 실행
* 필요 시 수동 실행 가능

---

## 🔐 Required Secrets

Repository → Settings → Secrets

* `PERSONAL_TOKEN` (Organization read 권한)
* `DISCORD_WEBHOOK`

---

## 🧠 Core Technical Logic

### 1️⃣ KST 기준 날짜 집계

GitHub API는 UTC 기준이므로
KST 하루 범위를 UTC로 변환하여 정확히 집계

### 2️⃣ 중복 SHA 제거

여러 브랜치에 동일 커밋이 존재할 수 있으므로
SHA 기준으로 중복 제거

### 3️⃣ Merge Commit 제외

parent가 2개 이상인 커밋 제외 → 순수 작업만 집계

### 4️⃣ Bot 계정 제외

자동 생성 커밋은 랭킹에서 제외

---

## 🎯 Why This Project Matters

이 봇의 목적은 감시가 아닙니다.

* 기여를 수치화
* 작은 노력도 즉각 인정
* 선의의 경쟁 유도
* PM의 수작업 운영 리소스 절감

---

## 📊 Impact (추후 작성 예정)

* PM 운영 리소스 절감
* 팀 내 기여 가시성 향상
* 긍정적 경쟁 구조 형성

---

## 🚀 Future Improvements

* 핵심 인원 가중치 적용
* PR 리뷰 점수 포함
* 월간 MVP 자동 선정
* 누적 랭킹 대시보드화

---

