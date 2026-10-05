# JEVArena

<p align="center">
  <strong>Visual decision-routing simulator for AI model routing</strong><br/>
  <sub>Simulation-first · No API key required · Browser-first</sub>
</p>

<p align="center">
  <a href="https://pouramin.dev/JEVArena/"><img alt="Try Online" src="https://img.shields.io/badge/Try%20Online-GitHub%20Pages-2ea44f?style=for-the-badge"></a>
  <a href="https://github.com/pouramin/JEVArena/releases/download/latest/JEVArena-Windows-Portable.zip"><img alt="Download for Windows" src="https://img.shields.io/badge/Download-Windows%20Portable-0078D4?style=for-the-badge&logo=windows"></a>
</p>

<p align="center">
  <a href="#english">English</a> · <a href="#persian">فارسی</a>
</p>

---

<a id="persian"></a>
## فارسی

<div dir="rtl" align="right">

### جی‌وی‌آرنا چیست؟

این پروژه یک شبیه‌ساز تصویری برای فهم بهتر مسیریابی بین مدل‌های هوش مصنوعی است. هدفش این نیست که جای سرویس واقعی یا API را بگیرد؛ هدف این است که بتوانید در یک رابط گرافیکی ببینید یک لایه‌ی تصمیم‌گیر چطور می‌تواند درخواست را تحلیل کند، یک سطح مدل را انتخاب کند و تفاوت هزینه و زمان را با اجرای مستقیم مقایسه کند.

نسخه‌ی فعلی روی نمایش تصویری مسیر تصمیم، انتخاب سطح مدل، هزینه، زمان و مقایسه با اجرای مستقیم تمرکز دارد.

> نکته: خروجی مسیریابی داخل JEVArena شبیه‌سازی‌شده است و نباید به‌عنوان اندازه‌گیری زنده‌ی یک API واقعی در نظر گرفته شود.

### ساده‌ترین راه استفاده

برای تست عادی هیچ چیزی لازم نیست نصب کنید. نسخه‌ی وب را باز کنید:

**[اجرای آنلاین JEVArena](https://pouramin.dev/JEVArena/)**

نسخه‌ی وب به حساب کاربری، کلید API یا نصب Node.js نیاز ندارد.

### نسخه‌ی ویندوز بدون نصب Node.js

برای اجرای آفلاین در ویندوز، فایل Portable را از بخش Releases دانلود کنید:

**[دانلود نسخه‌ی Portable ویندوز](https://github.com/pouramin/JEVArena/releases/download/latest/JEVArena-Windows-Portable.zip)**

بعد از Extract کردن فایل ZIP، فقط این فایل را اجرا کنید:

```text
START_JEVARENA.bat
```

نسخه‌ی Portable یک سرور محلی بسیار کوچک با PowerShell خود ویندوز اجرا می‌کند و مرورگر را باز می‌کند؛ بنابراین برای استفاده‌ی معمول نیازی به Node.js، npm یا Python نیست.

### چه چیزهایی در شبیه‌ساز دیده می‌شود؟

- اجرای تک‌پرامپت و بنچمارک گروهی
- انتخاب مدل مستقیم برای مقایسه
- نمایش مسیر تصمیم JEV در کنار اجرای مستقیم
- نمایش سطح Easy / Medium / Hard
- نمایش مسیر انتخاب مدل
- برآورد توکن، هزینه و زمان
- نمایش هزینه‌ی لایه‌ی تصمیم جدا از هزینه‌ی مدل نهایی
- مقایسه‌ی مسیر هوشمند با اجرای مستقیم
- بنچمارک تصادفی از استخر 1,500 پرامپتی
- فید زنده‌ی مسیریابی و گزارش خروجی CSV

### اجرای سورس برای توسعه‌دهنده‌ها

اگر می‌خواهید خود پروژه را تغییر دهید، Node.js لازم است:

```bash
git clone https://github.com/pouramin/JEVArena.git
cd JEVArena
npm install
npm run dev
```

برای Build نهایی:

```bash
npm run build
```

### محدودیت مهم

این پروژه یک ابزار آموزشی و نمایشی است. زمان‌ها، هزینه‌ها و نتایج شبیه‌سازی نباید به‌عنوان اندازه‌گیری زنده‌ی APIها یا تضمین عملکرد واقعی مدل‌ها تفسیر شوند. هرجا از داده‌ی منتشرشده‌ی شخص ثالث استفاده شده، منبع آن در رابط یا مستندات مشخص شده است.

### منطق هزینه و زمان شبیه‌ساز

پروفایل فعلی از نرخ استاندارد و بدون Cache برای API مستقیم استفاده می‌کند:

| Model | Input / 1M | Output / 1M |
| --- | ---: | ---: |
| Claude Haiku 4.5 | $1.00 | $5.00 |
| Claude Sonnet 5.5 | $2.00 | $10.00 |
| Claude Opus 5.5 | $4.00 | $20.00 |
| GPT-6 Luna | $0.10 | $0.50 |
| GPT-6.1 Sol | $2.00 | $10.00 |
| GPT-6 Astra | $10.00 | $50.00 |

تخفیف Prompt caching، Batch، حالت Fast/Priority، هزینه‌ی Regional processing و قیمت‌های قراردادی داخل شبیه‌ساز حساب نمی‌شن.

مسیر Router فعلاً سطح‌های **Fast / Balanced / Strong** رو به **Claude Haiku / Sonnet / Opus** نگاشت می‌کنه. برای Direct baseline می‌شه مدل‌های Anthropic یا OpenAI رو انتخاب کرد.

اگر یک مدل از سطح Task ضعیف‌تر باشه، شبیه‌ساز هزینه و زمان را بر اساس **کار مؤثر لازم برای رسیدن به Completion** تنظیم می‌کنه؛ یعنی Rework، Agent loop و تلاش‌های تکراریِ فرضی داخل Effective workload می‌رن:

- یک Tier ضعیف‌تر: Input ×2.15، Output ×2.35، Runtime ×2.2
- دو Tier ضعیف‌تر: Input ×5.0، Output ×6.0، Runtime ×5.5
- مدل هم‌سطح یا قوی‌تر: بدون Penalty

این ضرایب **فرض شبیه‌ساز** هستن و Benchmark یا Success rate واقعی Anthropic یا OpenAI نیستن. عدد Effective Input/Output هم مصرف تجمعی شبیه‌سازی‌شده برای Completion-adjusted workload رو نشان می‌ده، نه اینکه الزاماً یک Request با همین تعداد Context token ارسال شده باشه.

برای JEV، قیمت منتشرشده‌ی TypeSafe یعنی $0.042 برای هر 1M Input token استفاده می‌شه و اندازه‌ی ورودی Decision از Prompt به‌علاوه‌ی یک سربار کوچک شبیه‌سازی‌شده تخمین زده می‌شه. برای Laya، انتخاب Route شبیه‌سازی‌شده است؛ زمان 39.5 ms از پروفایل منتشرشده‌ی Single-question روی Tesla T4 گرفته شده و هزینه‌ی API برای Self-hosting برابر $0 نمایش داده می‌شه؛ هزینه‌ی Hardware و برق داخلش نیست.

### این Benchmark چه چیزی را ثابت نمی‌کند؟

- کیفیت و Success rate واقعی مدل‌ها در Simulation اندازه‌گیری نمی‌شه.
- ارزان‌تر بودن یک مدل سبک به معنی بهتر بودنش نیست؛ ممکنه فقط هزینه‌ی شبیه‌سازی‌شده‌ی کمتری داشته باشه.
- بخش **Simulated Tier Match** فقط تطابق Heuristic محلی با Labelهای Easy / Medium / Hard است و Accuracy واقعی JEV یا Laya نیست.
- استخر 1,500 پرامپتی عمداً از Templateهایی ساخته شده که به همین سه سطح مربوط می‌شن.

قبل از انتشار Build وب و Windows، Regression testها هر 1,500 پرامپت تولیدشده، هر 6 مدل، منطق Capability mismatch، قیمت‌ها، هزینه‌ی JEV/Laya و روند منطقی Cost/Runtime رو بررسی می‌کنن.

</div>

---

<a id="english"></a>
## English

<div dir="ltr" align="left">

### What is JEVArena?

JEVArena is a visual simulator for understanding AI model routing. It is not a live provider gateway and it does not require provider credentials. The goal is to make the routing idea visible: inspect a prompt, choose a model tier, and compare the routed path against a direct model call.

The current build focuses on a simulated JEV routing path beside a direct-model baseline, making model choice, cost, latency, token estimates, and route distribution easy to inspect visually.

> Important: routing output inside JEVArena is simulated and should not be interpreted as a live API measurement.

### Fastest way to try it

Nothing needs to be installed for normal use:

**[Try JEVArena online](https://pouramin.dev/JEVArena/)**

The web build requires no account, no API key, and no local Node.js installation.

### Portable Windows build

For offline Windows use, download the portable package from Releases:

**[Download JEVArena for Windows](https://github.com/pouramin/JEVArena/releases/download/latest/JEVArena-Windows-Portable.zip)**

Extract the ZIP and double-click:

```text
START_JEVARENA.bat
```

The portable package uses Windows PowerShell to serve the prebuilt static app locally, so regular users do not need Node.js, npm, or Python.

### What the simulator includes

- Single-run and automated benchmark modes
- Direct-model comparison
- Visual JEV routing path and direct-model baseline
- Easy / Medium / Hard routing tiers
- Route distribution and live routing feed
- Token, cost, and timing estimates
- Separate decision-layer and routed-model costs
- Randomized benchmark runs from a 1,500-prompt pool
- CSV export
- Responsive presentation-oriented UI

### Developer setup

```bash
git clone https://github.com/pouramin/JEVArena.git
cd JEVArena
npm install
npm run dev
```

Production build:

```bash
npm run build
```

### Accuracy / simulation note

JEVArena is an educational and presentation-focused simulator. Simulated timing, cost, confidence, and routing output should not be interpreted as live provider measurements or guarantees. Published third-party reference values are labeled as such.

#### Pricing profile

The simulator uses **standard, uncached, direct-API list rates** configured for the October 2026 profile:

| Model | Input / 1M | Output / 1M |
| --- | ---: | ---: |
| Claude Haiku 4.5 | $1.00 | $5.00 |
| Claude Sonnet 5.5 | $2.00 | $10.00 |
| Claude Opus 5.5 | $4.00 | $20.00 |
| GPT-6 Luna | $0.10 | $0.50 |
| GPT-6.1 Sol | $2.00 | $10.00 |
| GPT-6 Astra | $10.00 | $50.00 |

Prompt caching, batch discounts, fast/priority tiers, regional premiums, and provider-specific negotiated pricing are not modeled.

The routed path currently maps simulated **Fast / Balanced / Strong** decisions to **Claude Haiku / Sonnet / Opus**. The direct baseline can be selected from either the Anthropic or OpenAI model family.

#### Capability-mismatch workload model

For fixed-model comparisons, if a task is above the selected model's tier, JEVArena uses a completion-adjusted effective workload to represent rework, agent loops, and repeated attempts needed to reach a completion-equivalent result:

- 1 tier under the task: input ×2.15, output ×2.35, runtime ×2.2
- 2 tiers under the task: input ×5.0, output ×6.0, runtime ×5.5
- Correct-tier or stronger model: no mismatch multiplier

These are **simulator assumptions**, not measured Anthropic/OpenAI performance data. “Effective input/output” represents cumulative simulated billable usage across retries/agent loops, not a claim that one request contains that many context tokens.

These mismatch multipliers and runtime factors are simulation profiles rather than measured provider success rates or vendor benchmarks. The app models effective work and relative execution time for comparison; use the numbers as simulator assumptions, not real latency or quality guarantees.

#### Decision-layer assumptions

- **JEV:** uses TypeSafe's published $0.042 per 1M input-token rate. Decision input size is estimated from the prompt plus a small simulated schema/routing overhead; output-token cost is modeled as $0.
- **Laya:** routing choice is simulated. Decision latency uses the published 39.5 ms single-question Tesla T4 English-checkpoint profile and API fee is modeled as $0 for self-hosting; hardware/electricity are excluded.

#### What the benchmark does not prove

- Quality and task-success rate are **not measured** in Simulation mode.
- A cheaper fixed lightweight model is not automatically “better”; it may simply have a lower simulated cost while quality is unknown.
- **Simulated Tier Match** only reports agreement between the local routing heuristic and the benchmark's generated Easy/Medium/Hard labels. It is not JEV or Laya accuracy.
- The 1,500-prompt benchmark pool is intentionally generated from templates that map to those three tiers.

Regression tests now verify all 1,500 generated prompts, all six configured model profiles, mismatch behavior, pricing constants, Laya/JEV decision-cost rules, and monotonic cost/runtime invariants before the web and Windows builds are published.

</div>
