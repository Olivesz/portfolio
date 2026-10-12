# BFS survey of GitHub personal websites

**Method.** 171 GitHub searches across ~57 query axes (topics, frameworks, aesthetics, personas,
non-English terms) × 3 star bands (100–400, 400–1200, 1200–5000). **469 unique repos**, 414 with
a live URL. Auto-classified into 13 genres, then scored for "is this somebody's actual site or a
product to fork." 147 passed as likely-real personal sites. ~20 were then examined live —
WebFetch for server-rendered, the browser for SPAs, with real keyboard input where the site
claimed to be interactive.

**Honesty about coverage.** I examined ~20 sites properly. The rest I judged from metadata,
reputation and genre. The ranking below is split accordingly, and I have not pretended to have
visited things I didn't. Ratings are **my taste only** — not Oliver's preferences, not fit for
his site. Rubric written *before* seeing data: `scratchpad/survey/RUBRIC.md`.

---

## The numbers

| Genre | count | share |
|---|---|---|
| template | 198 | 42% |
| blog / digital garden | 165 | 35% |
| plain portfolio | 150 | 32% |
| minimal | 84 | 18% |
| dashboard / startpage | 29 | 6% |
| interactive / motion | 20 | 4% |
| academic | 17 | 4% |
| terminal / CLI | 12 | 3% |
| 3D / WebGL | 11 | 2% |
| AI / LLM | 10 | 2% |
| OS / desktop | 6 | 1% |
| retro / Y2K | 4 | 1% |
| game | 3 | 1% |
| brutalist | 2 | 0.4% |

**A prediction I got wrong.** Before running this I said the 1k–5k band would be "overwhelmingly
templates." It isn't:

| star band | template rate |
|---|---|
| 100–300 | 44% |
| 300–800 | 46% |
| 800–2000 | 40% |
| **2000+** | **27%** |

Template rate is *flat-to-falling* with stars. The mechanism I proposed was wrong. What's actually
true is narrower: the **most-starred individual repos** are disproportionately templates
(#1 devportfolio 4,949★, #2 vuepress-theme-vdoing 4,902★, #8 masterPortfolio 4,210★), and the
2000+ band is diluted by things that aren't personal sites at all (cointop, LinkStack, Jupyter).
Stars still don't measure design quality — but "high stars ⇒ template" was a bad model.

---

## Biggest findings

**1. The single best predictor of quality is whether the site does the thing or describes it.**
This dwarfs every stylistic variable. Nothing else came close as a discriminator.

**2. Novelty genres are ~4% of the corpus and are mostly costume.** Of 6 OS-desktops, 12
terminals and 11 3D sites, the great majority wrap ordinary portfolio content in a skin:
- `vivek9patel` (4,309★) — most-starred OS portfolio; a full Ubuntu lock screen, and the context
  menus don't do anything.
- `donchia.tech` — Windows 95 desktop, taskbar and icons, entirely static; no draggable windows.
- `HomeTerm` — I typed `help` and pressed enter: no response. It's a start-page launcher, not a
  shell. (Fine as a launcher; it just isn't a terminal portfolio.)
The costume is cheap, so it's common; the substance is expensive, so it's rare. **This is the
biggest exploitable gap in the entire survey.**

**3. The template hero paragraph is a genuine genre.** From the #3-most-starred site, verified in
browser: *"A passionate individual who always thrives to work on end to end products which develop
sustainable and scalable social and technical systems to create impact"* → a "What I Do?" grid of
⚡ bullets → "Made with ❤️". Every word survives find-and-replace of the author's name.

**4. The strongest non-novelty pattern is the digital garden** (35% of corpus, and the best of it
is genuinely excellent). Maggie Appleton's split into Essays / Notes / Patterns / Smidgeons, with
per-item maturity timestamps and a "Library vs Antilibrary," is the most intellectually honest
IA I saw anywhere: it tells you *how finished a thought is* before you read it.

**5. Credential-first beats story-first for hireability, and almost nobody does it.**
`trekhleb.dev` opens with "Senior Software Engineer @ Uber" and "190k★ repo" before any prose.
Blunt, and it works — you know in one second whether to keep reading.

**6. Bento grids are the current default for "personal but organized."** `gianmarcocavallo.com`
is the archetype: modular tiles mixing stack, contact, a live timezone widget, a now-card, a
countries-visited counter. It reads as personality without requiring an experience.

**7. Total commitment has a real cost.** Bruno Simon's drivable world has no navbar and no
sitemap; content exists only through exploration. Maximum memorability — and **no CV anywhere**,
with contact via Discord. Worth knowing what the trade actually costs.

---

## Ratings — my taste

Scored /50 across IDEA · EARNED · CRAFT · REAL · RESPECT.
**Tier A = examined live. Tier B = metadata + reputation, lower confidence.**

### Tier A — examined live

| # | Site | ★ | Score | Why |
|---|---|---|---|---|
| 1 | maggieappleton.com | 161 | 45 | Maturity-labelled notes; Library/Antilibrary; form fits an anthropologist exactly. Best IA in the survey. |
| 2 | bruno-simon.com | — | 43 | The purest "one idea, total commitment" on the web. Loses points only on utility. |
| 3 | jayransijn.com | — | 42 | State of the art playable world; physics, achievements, lighting. Slightly less original than Bruno. |
| 4 | trekhleb.dev | 239 | 40 | Credentials first, ego last, work is genuinely huge. Redundant social rows cost it. |
| 5 | sindresorhus.com | 332 | 39 | Radical restraint from someone whose work needs no framing. The Jobs quote is the one wrong note. |
| 6 | wikibonsai.io | 103 | 38 | The site is a demo of its own knowledge system. Form and product are the same object. |
| 7 | chanhdai.com | 2166 | 37 | Genuine craft density: ⌘K palette, contribution graph, 36-component showcase. Slightly trend-shaped. |
| 8 | gianmarcocavallo.com | 373 | 36 | Best bento execution seen; live timezone + now-card are real personality signals. |
| 9 | ericwu.me | 374 | 33 | Agentic-systems work with a 3D toggle and an emoji generator — small real toys, not claims. |
| 10 | simonaking.com | 1359 | 32 | "PRESS START / STDIN → /dev/Mind" — committed voice, clean nav underneath. |
| 11 | albinotonnina.com | 2797 | 31 | Famous animated-CV lineage; current form reads more conventional than its reputation. |
| 12 | braviaprime.com | 101 | 28 | Solid, honest engineer blog with a guestbook. Nothing wrong; nothing singular. |
| 13 | flowershow.app | 1100 | 27 | Publishes Obsidian vaults to the web — useful product, less a personal site. |
| 14 | donchia.tech | 276 | 22 | Win95 desktop that is entirely static. Costume without the machine. |
| 15 | vivek9patel.github.io | 4309 | 21 | Enormous effort on a shell whose menus do nothing. The gap *is* the lesson. |
| 16 | hometerm.dev | 162 | 20 | Clean launcher, but `help` returns nothing — mislabels itself as a terminal. |
| 17 | ashutoshhathidara.com | 4210 | 12 | Template hero + ⚡ skills grid. High stars, low design. |
| 18 | devportfolio (Ryan F.) | 4949 | 10 | The most-starred repo in the survey. A distribution win, not a design one. |

### Tier B — notable, not personally verified
Ranked by how promising they look on evidence I have, not on faith.

`maxleiter.com` · `sreetamdas.com` · `shellbear.me` · `anuraghazra.dev` · `asrvd.me` ·
`m2kar.cn` · `braydoncoyer.dev` · `clevir.li` (3D) · `braydentw.io` · `agustinusnathaniel.com` ·
`chandrikadeb7.github.io` · `arasgungore.github.io` · `vinaysomawat.github.io` ·
`liberxue.com` · `imsyy/home` · `termstart` · `tilde-enhanced` · `root-startpage` ·
`chevron` · `nxt-lnk` · `Cryptofolio` · `mdamiruddin-3dportfolio` · `mytiny.page` ·
`ptprashanttripathi.github.io` · `yashitanamdeo.github.io` · `GPortfolio` ·
`vinodjangid07` · `logotip4ik/portfolio` · `umutbayraktar` · `LeetHub` · `digital-gardeners` ·
`vuepress-theme-vdoing`

---

## Features worth stealing for ANY personal site

1. **Make one thing on the page actually run.** The highest-leverage property available. A demo
   beats a description at every star level.
2. **Maturity labels on writing** (Appleton). "Seedling / budding / evergreen" or a plain
   last-tended date tells readers how much to trust a piece. Almost nobody does it; it costs
   nothing.
3. **Credentials in the first line** (trekhleb). One line: role, org, one number.
4. **A command palette** (⌘K). Serves the hurried visitor without compromising the experience for
   anyone else. Best utility-per-effort in the survey.
5. **A `/now` page.** One paragraph, dated, on what you're doing this month. Cheap, and the single
   strongest liveness signal a site can carry.
6. **A live micro-widget** — local time, current track, last commit. Proof the page is alive.
7. **A guestbook.** Appeared repeatedly on the better sites and nowhere on the templates.
8. **State what you do NOT do.** Appleton's "mediocre developer," the Antilibrary. Nothing buys
   credibility faster than a visible limit.
9. **Escape hatch from any experience.** If you build a world, still ship a résumé link.
10. **Delete the skill bars.** "React 85%" has never once been believed by anyone.

## By domain / niche

- **Researcher / academic** — maturity-labelled notes; publications with a one-line "what this
  actually found"; the Antilibrary pattern. Avoid novelty entirely.
- **Systems / low-level** — make the artifact run in the page. This niche has the widest gap
  between what's claimed and what's shown.
- **Quant / finance** — provenance under every number (period, universe, costs) and a real curve.
  One honest chart outranks ten claims.
- **Design engineer** — bento + craft density (⌘K, contribution graph, micro-interactions). This
  is where `chanhdai.com` wins.
- **Writer** — garden IA, essays vs notes separated, no motion competing with reading.
- **Game / creative dev** — full commitment (Bruno, Ransijn) is correct *only here*, because the
  medium is the portfolio. Everyone else pays the cost without the payoff.
- **Open source maintainer** — Sindre's model: get out of the way, link the work.
- **Student / early career** — credential-first + one genuinely running project beats any
  template, and beats a 3D scene you didn't build.
