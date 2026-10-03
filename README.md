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

</div>
