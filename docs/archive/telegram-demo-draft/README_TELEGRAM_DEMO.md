# Tonus Telegram Demo Component

React компонент с **реальным Telegram UI дизайном** и Framer Motion анимациями для лендинга.

## 📋 Что это?

Три интерактивные сценки, демонстрирующие возможности Telegram бота Tonus:

1. **Scene 1:** Логирование данных (текст) — пишешь в Telegram, бот парсит и записывает
2. **Scene 2:** Анализ еды (фото) — отправляешь фото, бот считает калории и БЖУ
3. **Scene 3:** AI Health Query — спрашиваешь про здоровье, бот анализирует и дает insights

Компонент **автоматически циклится** между сценками с точными Telegram стилями.

---

## 🚀 Быстрый старт

### 1. Установи зависимости

```bash
npm install framer-motion
```

### 2. Импортируй компонент

```jsx
import TelegramDemoCarousel from './TelegramDemo';
import './TelegramDemo.css';

export default function LandingPage() {
  return (
    <div>
      {/* Other content */}
      <TelegramDemoCarousel />
    </div>
  );
}
```

### 3. Размещение на лендинге

**2-колонный лейаут (десктоп):**

```jsx
<section className="hero">
  <div className="left-column">
    <h1>Sign up for Tonus</h1>
    <form>{/* Login form */}</form>
  </div>
  
  <div className="right-column">
    <TelegramDemoCarousel />
  </div>
</section>
```

**Full-width (мобиль):**

```jsx
<section className="hero-mobile">
  <div className="top">
    <h1>Sign up for Tonus</h1>
    <TelegramDemoCarousel />
  </div>
  
  <div className="bottom">
    <form>{/* Login form */}</form>
  </div>
</section>
```

---

## ⚙️ Опции & Кастомизация

### Props (если добавить)

```jsx
<TelegramDemoCarousel
  autoplayDuration={5000}  // ms между сценками
  showNavButtons={true}     // показать ← Prev | Next →
  showAutoplayToggle={true} // чекбокс для автоплея
/>
```

### Кастомизация стилей

Измени переменные в `TelegramDemo.css`:

```css
:root {
  --telegram-blue: #0084FF;      /* юзер-сообщения */
  --bot-gray: #F0F0F0;           /* бот-сообщения */
  --text-primary: #222222;       /* текст */
  --text-secondary: #999999;     /* hints/timestamps */
  /* ... другие переменные */
}
```

### Изменить тексты сценок

Отредактируй компонент `Scene1`, `Scene2`, `Scene3` в `TelegramDemo.jsx`:

```jsx
const Scene1 = () => {
  return (
    <>
      <ChatBubble
        type="bot"
        text="Твой текст здесь 👋"
        timestamp="14:23"
      />
      {/* ... */}
    </>
  );
};
```

---

## 🎨 Дизайн деталями

### Цвета (Telegram Official)

- **User messages (синий):** `#0084FF`
- **Bot messages (серый):** `#F0F0F0`
- **Text:** `#222222` (темный)
- **Hints:** `#999999` (светлый серый)

### Типографика

- **Основной шрифт:** Roboto, 15px
- **Timestamps:** 12px, opacity 0.5
- **Metrics:** Roboto Mono, 16–20px (bold)

### Spacing

- **Bubble padding:** 12px 16px
- **Border-radius:** 18px (стандарт Telegram)
- **Gap между сообщениями:** 8px

---

## ⌨️ Keyboard Navigation

- **← Arrow Left:** Предыдущая сценка
- **→ Arrow Right:** Следующая сценка
- **Tab:** Перемещение между кнопками (dots, nav buttons)
- **Enter:** Активировать кнопку

---

## ♿ Accessibility

✅ **Полная поддержка:**
- ARIA labels на всех кнопках
- Keyboard navigation (Tab, Enter, Arrows)
- Focus visible indicators (2px blue outline)
- `prefers-reduced-motion` поддержка (отключает анимации)
- Semantic HTML

---

## 🎬 Временные параметры

Каждая сценка имеет свою длительность:

| Сценка | Duration | Описание |
|--------|----------|---------|
| Scene 1 | 4.5s | Логирование, быстро |
| Scene 2 | 10s | Анализ фото, медленнее (счет калорий) |
| Scene 3 | 11s | AI анализ, insights и рекомендация |

Измени в компоненте:

```jsx
const scenes = [
  { name: 'Scene1', component: Scene1, duration: 4.5 },  // ← сюда
  { name: 'Scene2', component: Scene2, duration: 10 },
  { name: 'Scene3', component: Scene3, duration: 11 }
];
```

---

## 📱 Responsive Design

Компонент автоматически адаптируется:

- **Desktop (>768px):** 400px × 600px (fixed)
- **Tablet (481–768px):** 100% width, max 600px height
- **Mobile (<480px):** 100vw × 70vh

---

## 🐛 Troubleshooting

### Анимации не работают

✅ Убедись что Framer Motion установлен:

```bash
npm list framer-motion
```

✅ CSS файл импортирован:

```jsx
import './TelegramDemo.css';
```

### Styling конфликты

✅ Используй CSS Module если есть конфликты:

```jsx
import styles from './TelegramDemo.module.css';

// Обнови className:
<div className={styles['telegram-demo-container']}>
```

### Сценка не переключается

✅ Проверь консоль на ошибки (F12)  
✅ Убедись что `scenes.length` совпадает с числом Scene компонентов

---

## 🚀 Performance Tips

1. **Use React.memo()** для оптимизации:

```jsx
const ChatBubble = React.memo(({ ... }) => {
  return ...
});
```

2. **Lazy load Framer Motion** if needed:

```jsx
const TelegramDemoCarousel = lazy(() => import('./TelegramDemo'));
```

3. **Дебаунс** переключения сценок:

```jsx
const handleSceneChange = debounce((newScene) => {
  setCurrentScene(newScene);
}, 400);
```

---

## 📚 File Structure

```
/project
├── TelegramDemo.jsx        # Main component
├── TelegramDemo.css        # Styles (Telegram UI)
├── TONUS_TELEGRAM_DEMO_SPEC_v2.md  # Full spec
└── README.md               # This file
```

---

## 🎯 Примеры использования

### На landing page

```jsx
import TelegramDemoCarousel from './components/TelegramDemo';

export default function Hero() {
  return (
    <section className="hero">
      <div className="left">
        <h1>Tonus</h1>
        <p>Your personal health hub</p>
        <SignUpForm />
      </div>
      <div className="right">
        <TelegramDemoCarousel />
      </div>
    </section>
  );
}
```

### В отдельном модальном окне

```jsx
import { useState } from 'react';
import TelegramDemoCarousel from './TelegramDemo';

export default function DemoModal() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        See how it works →
      </button>

      {isOpen && (
        <div className="modal">
          <TelegramDemoCarousel />
          <button onClick={() => setIsOpen(false)}>Close</button>
        </div>
      )}
    </>
  );
}
```

---

## 🔧 Advanced Customization

### Добавить свою сценку

1. Создай новый компонент `Scene4`:

```jsx
const Scene4 = () => {
  return (
    <>
      <ChatBubble type="bot" text="Your text" />
      {/* ... */}
    </>
  );
};
```

2. Добавь в массив `scenes`:

```jsx
const scenes = [
  { name: 'Scene1', component: Scene1, duration: 4.5 },
  { name: 'Scene2', component: Scene2, duration: 10 },
  { name: 'Scene3', component: Scene3, duration: 11 },
  { name: 'Scene4', component: Scene4, duration: 8 },  // ← новая
];
```

3. Индикаторы и навигация обновятся автоматически! ✅

---

## 📞 Support

Если что-то не работает:

1. Проверь консоль браузера (F12)
2. Убедись что все зависимости установлены
3. Попробуй очистить кэш (`npm cache clean --force`)
4. Обновись до последней версии Framer Motion

---

## 📄 Лицензия

MIT (используй как угодно)

---

## 🎉 That's it!

Теперь у тебя есть **реальный Telegram-подобный демо компонент** на лендинге! 🚀

Если нужна помощь с интеграцией на сайт — напиши! 💬
