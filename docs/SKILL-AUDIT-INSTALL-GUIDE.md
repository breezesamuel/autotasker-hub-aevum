# GitHub 增长类技能 — 审查报告 & 安装清单

> 生成时间：2026-11-14 | 来源仓库：`coreyhaines31/marketingskills` (skills.sh v2) | 当前 GitHub 网络不通，需手动同步

## 一、审计结论（基于 meta + 职责分析，源码待联网时补审）

| # | Skill ID | 风险信号 | 决定 | 与 AutoTasker Hub 的匹配度 |
|---|----------|---------|------|--------------------------|
| 1 | **ai-seo** | 🟢 low | ✅ 安装 | 极高：决定 Agent/Perplexity 是否能搜到我们的产品页 |
| 2 | **schema-markup** | 🟢 low | ✅ 安装 | 极高：JSON-LD 直接影响 Rich Results + AI answer 引用 |
| 3 | **seo-audit** | 🟢 low | ✅ 安装 | 高：周期性站点健康检查 |
| 4 | **referrals** | 🟢 low | ✅ 安装 | 极高：已实现分销引擎，此 skill 提供框架完善 |
| 5 | **copywriting** | 🟢 low | ✅ 安装 | 高：落地页文案/A-B variant 生成 |
| 6 | **social-content** | 🟢 low | ✅ 安装 | 中：每周趋势摘要发微信/微博时使用 |
| 7 | **analytics-tracking** | 🟢 low | ✅ 安装 | 中：GA4 / 事件埋点方案参考 |
| 8 | **landing-page-cro** | 🟢 low | ✅ 安装 | 中：offer.html 转化心理学框架 |
| 9 | **email-sequence** | 🟢 low | ⏸️ 暂装 | 低（暂无 SMTP 基础设施） |
| 10 | **content-strategy** | 🟢 low | ⏸️ 暂装 | 中（有内容策略再装更高效） |
| 11 | **competitor-alternatives** | 🟢 low | ⏸️ 暂装 | 低（竞争页按需生成） |
| 12 | **programmatic-seo** | 🟡 medium | ⚠️ watchlist | 需复审后决定（可能触发 spam filter） |

## 二、即刻行动项（11 个 approved，优先装前 4 个）

### 前置条件
- 恢复网络访问 GitHub（目前被阻断）
- 本地有 OpenCode CLI 或手动复制权限

### 推荐安装顺序（按 ROI 排序）

```bash
# === P0: 立刻影响搜索可见性和分销传播力 ===
npx skills add coreyhaines31/marketingskills::ai-seo
npx skills add coreyhaines31/marketingskills::schema-markup
npx skills add coreyhaines31/marketingskills::referrals
npx skills add coreyhaines31/marketingskills::seo-audit

# === P1: 优化 offer.html 转化和社媒分发 ===
npx skills add coreyhaines31/marketingskills::copywriting
npx skills add coreyhaines31/marketingskills::social-content
npx skills add coreyhaines31/marketingskills::landing-page-cro
npx skills add coreyhaines31/marketingskills::analytics-tracking

# === P2: 按需安装 ===
npx skills add coreyhaines31/marketingskills::email-sequence
npx skills add coreyhaines31/marketingskills::content-strategy
npx skills add coreyhaines31/marketingskills::competitor-alternatives
```

### 离线方式（网络仍不可用时）
```powershell
# 克隆仓库到本地临时目录（需要网络恢复一次）
git clone --depth 1 https://github.com/coreyhaines31/marketingskills.git $env:TEMP\ms

# 批量复制到 OpenCode skills 目录
SKILLS="$env:USERPROFILE\.config\opencode\skills"
foreach ($s in @('ai-seo','schema-markup','referrals','seo-audit','copywriting','social-content')) {
  $src = "$env:TEMP\ms\skills\$s"
  if (Test-Path "$src/SKILL.md") {
    New-Item -ItemType Directory -Force -Path "$SKILLS\$s" | Out-Null
    Copy-Item "$src/SKILL.md" "$SKILLS\$s/" -Force
    Write-Host "✓ installed $s"
  } else { Write-Host "✗ missing SKILL.md for $s" }
}
Remove-Item -Recurse -Force $env:TEMP\ms
```

## 三、watchlist：programmatic-seo

**理由：** 该 skill 可能会建议大批量生成 SEO landing pages。我们的 content 政策是：
- ✅ 允许：真实数据驱动的动态页（如 /trending 实时快照）
- ❌ 禁止：模板化的 keyword-stuffing 页面（会被 Google penalize）

**决策：** 等网络恢复后拉取源码审查 `SKILL.md` 的具体指令后再决定是否安装。
