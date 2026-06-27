# Tonus — Telegram Bot Demo Animation (Landing Page)
## v2: EXACT TELEGRAM UI DESIGN

**Назначение:** Три реальных Telegram-подобных сценки на лендинге, показывающие основные возможности бота.

**Ключевое отличие от v1:** Дизайн **идентичен реальному Telegram** — не имитация, а максимально близкое воспроизведение официального UI.

---

## 🎨 Design System (точные параметры Telegram)

### Palette
```
Primary Blue (User messages):   #0084FF  (Telegram brand blue)
Bot Gray (Bot messages):        #F0F0F0  (light gray background)
Text Primary:                   #222222  (dark text)
Text Secondary:                 #999999  (timestamp/meta)
Background:                     #FFFFFF  (chat background)
Success (checkmark):            #31A24C  (green)
Processing (pulse):             #FFB340  (orange)
```

### Typography
```
Chat text:           'Roboto', sans-serif
                     Regular 400, 15px, line-height 1.4
                     
Timestamps:          'Roboto', sans-serif
                     Regular 400, 12px, opacity 0.6
                     
Numbers/Metrics:     'Roboto Mono', monospace
                     Bold 600, 16–20px
                     
Emoji:               System emoji, 24–32px (не изменяется размер с текстом)
```

### Spacing & Geometry
```
Chat bubble padding:         12px 16px (top/bottom, left/right)
Chat bubble border-radius:   18px (Telegram standard)
Gap between messages:        8px (vertical)
Gap between bubbles:         4px (если одна после другой от одного sender)
Avatar size:                 32px × 32px, border-radius: 50%
Avatar margin-right:         8px (between avatar and bubble)
Chat container padding:      12px 16px (top/bottom, left/right)

Message timestamp:
  position: absolute
  bottom: 4px (inside bubble)
  right: 8px
  font-size: 12px
  opacity: 0.5
```

### Shadows & Styling
```
Chat bubble shadow:  none (в Telegram нет shadows)
Chat background:    single color #FFFFFF
Border:            none
Underline:         none (для ссылок используется color только)
```

---

## 📱 Scene 1: Data Logging (Логирование текста)

### Визуальная структура

```
┌──────────────────────────────────────────┐
│   Telegram                    close(X)   │
├──────────────────────────────────────────┤
│                                          │
│  🤖  Bot                    14:23        │
│  ┌────────────────────────────────────┐  │
│  │ Привет! 👋                         │  │
│  │ Отправь мне что-нибудь интересное  │  │
│  └────────────────────────────────────┘  │
│                           ✓ 14:24        │
│                                          │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ пил кофе в 14:00 ☕                │  │
│  └────────────────────────────────────┘  │
│                     ✓✓ 14:25 (from right) │
│                                          │
│  ⏳ Analyzing...                          │
│                                          │
│  🤖  Bot                    14:25        │
│  ┌────────────────────────────────────┐  │
│  │ ✅ Записал!                        │  │
│  │                                    │  │
│  │ ☕ Кофе в 14:00                    │  │
│  │ 95 mg caffeine                     │  │
│  │                                    │  │
│  │ 📊 Added to Tonus dashboard        │  │
│  └────────────────────────────────────┘  │
│                           ✓ 14:26        │
│                                          │
└──────────────────────────────────────────┘

[Input field at bottom]
```

### Детали анимации

**User message: "пил кофе в 14:00 ☕"**
- Появляется **справа** (user)
- Background: `#0084FF` (синий)
- Text color: `#FFFFFF` (белый)
- Border-radius: `18px`
- Padding: `12px 16px`
- Анимация: **slide-in справа** + fade (300ms)
  ```css
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  ```

**Typing indicator: "⏳ Analyzing..."**
- Появляется слева
- Small gray text, `font-size: 13px`, `color: #999999`
- Появляется после 0.8s от user message
- Анимация: **fade-in** (200ms) + **pulse dots**
  ```css
  @keyframes typingDots {
    0%, 20% { content: '⏳ Analyzing'; }
    25%, 45% { content: '⏳ Analyzing.'; }
    50%, 70% { content: '⏳ Analyzing..'; }
    75%, 100% { content: '⏳ Analyzing...'; }
  }
  /* или просто пульсирующие точки */
  ```

**Bot message: "✅ Записал! ..."**
- Появляется **слева** (bot)
- Background: `#F0F0F0` (светло-серый)
- Text color: `#222222` (темный)
- Border-radius: `18px`
- Padding: `12px 16px`
- Avatar: 32px × 32px, слева (🤖)
- Анимация: **slide-in слева** + fade (400ms), trigger at 1.3s
  ```css
  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  ```

**Детали внутри bot message:**
- "✅ Записал!" — appears immediately
- "☕ Кофе в 14:00" — appear с stagger 150ms (каждая строка)
- "95 mg caffeine" — appears с stagger 150ms
- "📊 Added to Tonus dashboard" — appears в конце (300ms after last line)

**Timestamps:**
- User message: "14:25" справа внизу bubble (inside, small gray text)
- Bot message: "14:26" слева (в стиле Telegram)
- Checkmarks: `✓` (одна), `✓✓` (две, полные) после timestamp

**Horizontal line / divider:**
- Нет в реальном Telegram, только вертикальный gap

### Temporal Flow

| Time | Event | Animation |
|------|-------|-----------|
| 0.0s | Scene starts, bot intro visible | — |
| 0.8s | User message appears | slideInRight (300ms) |
| 1.1s | Typing indicator appears | fade-in (200ms) |
| 1.2s | Typing indicator pulses | pulse dots (repeat) |
| 1.5s | Typing indicator disappears | fade-out (200ms) |
| 1.7s | Bot message starts appearing | slideInLeft (400ms) |
| 1.8s | "✅ Записал!" visible | included in slide |
| 2.0s | "☕ Кофе в 14:00" appears | fade-in (150ms) |
| 2.15s | "95 mg caffeine" appears | fade-in (150ms) |
| 2.3s | "📊 Added to Tonus dashboard" | fade-in (200ms) |
| 2.8s | Full message visible | — |
| 3.2s | Pause / loop prep | — |

**Loop duration:** 4.5s (then fade-out all and restart)

---

## 📸 Scene 2: Food Photo Analysis (Анализ еды)

### Визуальная структура

```
┌──────────────────────────────────────────┐
│   Telegram                    close(X)   │
├──────────────────────────────────────────┤
│                                          │
│  🤖  Bot                    14:30        │
│  ┌────────────────────────────────────┐  │
│  │ Покажи мне что ты ешь 🍽️          │  │
│  └────────────────────────────────────┘  │
│                           ✓ 14:31        │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ [Фото блюда: Big Mac + фрешка]    │  │
│  │ (thumbnail 200×150, rounded 12px) │  │
│  └────────────────────────────────────┘  │
│                     ✓✓ 14:32              │
│                                          │
│  ⏳ Analyzing photo...  (2.5s real wait)  │
│                                          │
│  🤖  Bot                    14:34        │
│  ┌────────────────────────────────────┐  │
│  │ 🔍 Я вижу:                         │  │
│  │                                    │  │
│  │ 🍔 Big Mac                         │  │
│  │ 🍟 French fries                    │  │
│  │ 🥤 Coca-Cola                       │  │
│  │                                    │  │
│  │ 📊 Nutrients:                      │  │
│  │ 550 kcal | 25g protein             │  │
│  │ 30g fat | 45g carbs                │  │
│  │                                    │  │
│  │ ✅ Saved to Food Diary             │  │
│  └────────────────────────────────────┘  │
│                           ✓ 14:35        │
│                                          │
└──────────────────────────────────────────┘
```

### Детали анимации

**User photo message:**
- Фото占用 200px width, rounded corners `12px` (slightly less than bubble 18px)
- Padding inside bubble: `8px`
- Анимация: **blur-in** (500ms)
  ```css
  @keyframes blurIn {
    from {
      filter: blur(10px);
      opacity: 0;
    }
    to {
      filter: blur(0);
      opacity: 1;
    }
  }
  ```
- slideInRight (300ms) at the same time

**Typing indicator:**
- "⏳ Analyzing photo..." (2.5s дожидаемся, потом исчезает)
- Gray text, pulse

**Bot response message: "🔍 Я вижу: ..."**
- slideInLeft (400ms)
- Internal animation (staggered):
  - "🔍 Я вижу:" — immediate
  - Empty line gap (20px)
  - "🍔 Big Mac" — fade-in + slide-left (150ms stagger)
  - "🍟 French fries" — fade-in + slide-left (150ms)
  - "🥤 Coca-Cola" — fade-in + slide-left (150ms)
  - Empty line gap
  - "📊 Nutrients:" — fade-in (200ms)
  - "550 kcal | 25g protein" — **counter-up animation** (1.2s)
    ```javascript
    // Pseudocode:
    from 0 to 550 kcal
    easing: easeOut
    update every 16ms
    ```
  - "30g fat | 45g carbs" — appear (150ms)
  - Empty line
  - "✅ Saved to Food Diary" — **glow effect** (400ms)
    ```css
    @keyframes glow {
      from {
        box-shadow: 0 0 0px rgba(49, 162, 76, 0);
      }
      to {
        box-shadow: 0 0 12px rgba(49, 162, 76, 0.4);
      }
    }
    ```

### Temporal Flow

| Time | Event | Animation |
|------|-------|-----------|
| 0.0s | Scene starts | — |
| 0.5s | Bot greeting visible | — |
| 1.0s | User photo message starts | blur-in + slideInRight (500ms) |
| 1.7s | Photo fully visible | — |
| 2.2s | Typing indicator appears | fade-in (200ms) |
| 2.5s | Typing pulses | pulse (repeat) |
| 5.0s | Typing disappears | fade-out (200ms) |
| 5.4s | Bot message starts | slideInLeft (400ms) |
| 5.6s | "🔍 Я вижу:" visible | — |
| 5.8s | Food list stagger begins | fade-in + slide (150ms each) |
| 6.4s | "📊 Nutrients:" visible | fade-in (200ms) |
| 6.6s | Counter-up starts: 0 → 550 | counter animation (1.2s) |
| 7.8s | Nutrients fully filled | — |
| 8.1s | "✅ Saved" glow | glow (400ms) |
| 8.7s | Full message complete | — |
| 9.2s | Pause / loop prep | — |

**Loop duration:** 10s

---

## 💬 Scene 3: Health Query (AI анализ здоровья)

### Визуальная структура

```
┌──────────────────────────────────────────┐
│   Telegram                    close(X)   │
├──────────────────────────────────────────┤
│                                          │
│  🤖  Bot                    14:40        │
│  ┌────────────────────────────────────┐  │
│  │ Как дела? 👋                       │  │
│  └────────────────────────────────────┘  │
│                           ✓ 14:41        │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ Почему я так устаю днем?           │  │
│  └────────────────────────────────────┘  │
│                     ✓✓ 14:42              │
│                                          │
│  ⏳ Analyzing your health data...        │
│     (контекст: последние 4 недели)      │
│                                          │
│  🤖  Bot                    14:44        │
│  ┌────────────────────────────────────┐  │
│  │ 🧠 Я нашел 3 закономерности:       │  │
│  │                                    │  │
│  │ 1️⃣  ☕ Кофе после 15:00            │  │
│  │    → сон на 1.5ч короче на        │  │
│  │      следующую ночь               │  │
│  │                                    │  │
│  │ 2️⃣  🍽️ Поздняя еда (>21:00)       │  │
│  │    → HRV падает на 15%             │  │
│  │                                    │  │
│  │ 3️⃣  💼 Стрессовые дни             │  │
│  │    → пульс покоя поднимается      │  │
│  │      на 8 уд/мин                  │  │
│  │                                    │  │
│  │ 💡 Совет: спи раньше на 20 мин    │  │
│  │                                    │  │
│  │ 🔬 Запустить эксперимент? [ДА]   │  │
│  └────────────────────────────────────┘  │
│                           ✓ 14:46        │
│                                          │
└──────────────────────────────────────────┘
```

### Детали анимации

**User message: "Почему я так устаю днем?"**
- slideInRight (300ms)
- Timestamp + checkmarks

**Typing indicator: "⏳ Analyzing your health data..."**
- Appears at 2.5s
- Text in gray, pulsing dots
- Subtitle "контекст: последние 4 недели" — appears below (small, gray, opacity 0.6)

**Bot response: "🧠 Я нашел 3 закономерности: ..."**
- slideInLeft (400ms)

**Internal stagger animation:**

1. **"🧠 Я нашел 3 закономерности:"** — immediate

2. **Empty gap** (20px)

3. **Insight #1 with counter "1️⃣":**
   - Counter "1️⃣" — **zoom-in** (200ms, scale: 0 → 1)
     ```css
     @keyframes zoomIn {
       from {
         transform: scale(0);
         opacity: 0;
       }
       to {
         transform: scale(1);
         opacity: 1;
       }
     }
     ```
   - Text "☕ Кофе после 15:00..." — appears (150ms after counter)
   - Stagger each line of explanation (100ms)

4. **Insight #2 with counter "2️⃣":**
   - Counter zoom-in (200ms) at 200ms after insight #1 complete
   - Text appears (150ms later)

5. **Insight #3 with counter "3️⃣":**
   - Counter zoom-in (200ms) at 200ms after insight #2
   - Text appears (150ms later)

6. **Empty gap** (20px)

7. **💡 Совет (Recommendation):**
   - Appears с **glow effect** (400ms)
   - Box-shadow: `0 0 16px rgba(255, 193, 7, 0.5)` (golden glow)

8. **Button "🔬 Запустить эксперимент? [ДА]":**
   - Appears below (200ms after recommendation)
   - Button itself: **pulse** (scale: 1 → 1.08 → 1, 800ms cycle)
     ```css
     @keyframes buttonPulse {
       0%, 100% { transform: scale(1); }
       50% { transform: scale(1.08); }
     }
     ```

### Temporal Flow

| Time | Event | Animation |
|------|-------|-----------|
| 0.0s | Scene starts | — |
| 0.5s | Bot greeting visible | — |
| 1.0s | User message appears | slideInRight (300ms) |
| 1.5s | Typing indicator | fade-in (200ms) |
| 1.8s | Typing indicator pulses | pulse (repeat) |
| 4.2s | Typing disappears | fade-out (200ms) |
| 4.6s | Bot message starts | slideInLeft (400ms) |
| 4.9s | "🧠 Я нашел 3..." visible | — |
| 5.2s | Counter "1️⃣" appears | zoom-in (200ms) |
| 5.4s | "☕ Кофе после 15:00" | fade-in (150ms) |
| 5.6s | Explanation lines stagger | fade-in (100ms each) |
| 6.1s | Counter "2️⃣" appears | zoom-in (200ms) |
| 6.3s | "🍽️ Поздняя еда" | fade-in (150ms) |
| 6.5s | Explanation stagger | fade-in (100ms each) |
| 7.0s | Counter "3️⃣" appears | zoom-in (200ms) |
| 7.2s | "💼 Стрессовые дни" | fade-in (150ms) |
| 7.4s | Explanation stagger | fade-in (100ms each) |
| 8.0s | "💡 Совет" appears | glow (400ms) |
| 8.5s | Button appears | fade-in (150ms) |
| 8.7s | Button pulses | pulse (repeat) |
| 10.0s | Pause / loop prep | — |

**Loop duration:** 11s

---

## 🎬 Carousel & Layout

### Container specifications
```
Desktop: 400px × 600px (width × height)
Mobile:  100vw × 70vh (full-width, 70% viewport height)
Border:  1px solid #E0E0E0
Border-radius: 12px
Background: #FFFFFF
Box-shadow: 0 4px 12px rgba(0,0,0,0.1)
```

### Header (Telegram-style)
```
┌─────────────────────────────┐
│  Telegram              | X  │  ← закрытие анимации
├─────────────────────────────┤
│  (chat content below)       │
```

- Title: "Telegram", font: 14px, bold, left-aligned
- Close button: `×`, right-aligned, cursor: pointer
- Background: #F8F8F8 (light gray)
- Padding: 12px 16px
- Border-bottom: 1px solid #E0E0E0

### Chat area
```
- Scrollable container
- Padding: 12px 16px
- Background: #FFFFFF
- Messages stack vertically with gaps
```

### Input field (bottom)
```
┌─────────────────────────────────────┐
│ 📎  [Type a message...]      Send  │
└─────────────────────────────────────┘
```
- Input: background #F8F8F8, border 1px #E0E0E0, padding 12px
- Attachment icon: 20px
- Send button: blue (#0084FF), text "Send", or arrow icon
- (Input is non-functional for demo)

### Indicators (dots at bottom)
```
Под чатом:
  • • •
  
- 3 точки (одна per scene)
- Active dot: background #0084FF, opacity 1
- Inactive dot: background #E0E0E0, opacity 0.5
- Cursor: pointer on all dots
- On click: jump to that scene, start animation
```

### Navigation buttons (optional)
```
← Prev  |  1 / 3  |  Next →

- Buttons: text links, color #0084FF, cursor pointer
- Disabled state: opacity 0.3, cursor not-allowed
- On click: fade-out current scene, fade-in next scene, restart animation
```

---

## 🎨 Color Reference (Hex codes)

| Name | Hex | Usage |
|------|-----|-------|
| Telegram Blue | #0084FF | User message bg, active elements, links |
| Bot Gray | #F0F0F0 | Bot message bg |
| Text Primary | #222222 | Chat text, primary labels |
| Text Secondary | #999999 | Timestamps, hints, secondary text |
| Text Tertiary | #CCCCCC | Disabled text |
| Background | #FFFFFF | Chat container bg |
| Divider | #E0E0E0 | Borders, separators |
| Success Green | #31A24C | Checkmarks, ✅ icons |
| Warning Orange | #FFB340 | Processing icon, ⏳ |
| Accent Gold | #FFC107 | Highlights, glow effects |
| Light Gray | #F8F8F8 | Header bg, input bg |

---

## 🎬 Animation Library (CSS + Framer Motion)

### Easing functions
```javascript
// Standard Material Design
const easeOut = "cubic-bezier(0.4, 0, 0.2, 1)";
const easeIn = "cubic-bezier(0.4, 0, 1, 1)";
const easeInOut = "cubic-bezier(0.4, 0, 0.2, 1)";

// Springy (for zoom/bounce)
const spring = "cubic-bezier(0.34, 1.56, 0.64, 1)";

// Counter animation (smooth)
const counterEase = "cubic-bezier(0.42, 0, 0.58, 1)";
```

### Predefined animations

1. **slideInLeft** (400ms, easeOut)
   ```javascript
   initial={{ x: -20, opacity: 0 }}
   animate={{ x: 0, opacity: 1 }}
   transition={{ duration: 0.4, ease: easeOut }}
   ```

2. **slideInRight** (300ms, easeOut)
   ```javascript
   initial={{ x: 20, opacity: 0 }}
   animate={{ x: 0, opacity: 1 }}
   transition={{ duration: 0.3, ease: easeOut }}
   ```

3. **blurIn** (500ms, easeOut)
   ```javascript
   initial={{ filter: "blur(10px)", opacity: 0 }}
   animate={{ filter: "blur(0px)", opacity: 1 }}
   transition={{ duration: 0.5, ease: easeOut }}
   ```

4. **fadeIn** (200–300ms, easeOut)
   ```javascript
   initial={{ opacity: 0 }}
   animate={{ opacity: 1 }}
   transition={{ duration: 0.2 }}
   ```

5. **zoomIn** (200ms, spring)
   ```javascript
   initial={{ scale: 0, opacity: 0 }}
   animate={{ scale: 1, opacity: 1 }}
   transition={{ duration: 0.2, ease: spring }}
   ```

6. **glow** (400ms, easeOut)
   ```javascript
   animate={{ boxShadow: "0 0 12px rgba(49, 162, 76, 0.4)" }}
   transition={{ duration: 0.4 }}
   ```

7. **pulse** (800ms, linear repeat)
   ```javascript
   animate={{ scale: [1, 1.08, 1] }}
   transition={{ duration: 0.8, repeat: Infinity }}
   ```

8. **counterUp** (variable duration, counterEase)
   ```javascript
   // Use <motion.span> with custom onUpdate hook
   // or Framer's AnimatePresence + key change
   ```

9. **typingDots** (600ms, linear repeat)
   ```javascript
   animate={{ opacity: [0.3, 1, 0.3] }}
   transition={{ duration: 0.6, repeat: Infinity }}
   // or pseudo-element content change
   ```

---

## 📋 Component Tree (React)

```jsx
<TelegramDemoCarousel>
  ├─ <Header />
  │  ├─ "Telegram" title
  │  └─ Close button (X)
  │
  ├─ <ChatContainer>
  │  └─ <Scene1 /> | <Scene2 /> | <Scene3 />
  │     ├─ <ChatBubble type="bot" avatar={true} />
  │     ├─ <ChatBubble type="user" />
  │     ├─ <TypingIndicator />
  │     ├─ <PhotoMessage />
  │     ├─ <CounterMessage /> (for metrics)
  │     └─ <ActionButton />
  │
  ├─ <InputField /> (visual only, non-functional)
  │
  ├─ <Indicators>
  │  └─ <Dot /> × 3 (clickable)
  │
  └─ <NavButtons /> (optional)
     ├─ PrevButton
     ├─ PageIndicator
     └─ NextButton
```

---

## 🚀 Implementation Notes

1. **Framer Motion priority:**
   - All animations must be wrapped in `<motion>` components
   - Use `AnimatePresence` for scene transitions
   - Stagger: use `transition={{ staggerChildren }}` for lists

2. **Responsive:**
   - Desktop: 400×600px fixed
   - Tablet: 100% width, max 600px, height auto
   - Mobile: 100vw × 70vh, overflow-y: auto

3. **Performance:**
   - `will-change: transform, opacity` on animated elements
   - `GPU accelerated` transforms only (translate, scale)
   - Avoid animating width/height
   - Debounce on scene switch: min 400ms (button disabled during transition)

4. **Accessibility:**
   - ARIA labels on buttons and indicators
   - Keyboard nav: Tab, Enter (buttons), Arrow Left/Right (scene nav)
   - `prefers-reduced-motion`: all animations disabled, only content shown
   - Focus visible: 2px blue outline on focusable elements

5. **Testing:**
   - Chrome DevTools: throttle to 2G, verify smooth animations
   - Mobile: test on actual device (iPad, iPhone)
   - Firefox: check GPU acceleration (about:home → WebGL)
   - Safari: check shadows, rounded corners

---

## 📸 References

- **Telegram Desktop UI:** https://web.telegram.org
- **Telegram Mobile UI:** iOS App Store / Google Play
- **Design tokens:** Telegram uses 18px border-radius for bubbles, 15px text, Roboto font

