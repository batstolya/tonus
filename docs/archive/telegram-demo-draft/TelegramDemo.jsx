import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './TelegramDemo.css';

// ============================================================================
// CHAT BUBBLE COMPONENTS
// ============================================================================

const ChatBubble = ({ 
  text, 
  type = 'bot', // 'bot' or 'user'
  timestamp = '14:25',
  avatar = '🤖',
  delay = 0,
  children = null 
}) => {
  const isUser = type === 'user';
  
  return (
    <motion.div
      className={`chat-message ${type}`}
      initial={{ x: isUser ? 20 : -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, delay }}
      exit={{ x: isUser ? 20 : -20, opacity: 0 }}
    >
      {!isUser && <div className="avatar">{avatar}</div>}
      
      <div className={`bubble ${type}`}>
        {children ? (
          children
        ) : (
          <p className="bubble-text">{text}</p>
        )}
        
        <span className="timestamp">{timestamp}</span>
        <span className="checkmark">
          {isUser ? '✓✓' : '✓'}
        </span>
      </div>
    </motion.div>
  );
};

// ============================================================================
// TYPING INDICATOR
// ============================================================================

const TypingIndicator = ({ delay = 0 }) => {
  return (
    <motion.div
      className="typing-indicator"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, delay }}
    >
      <span className="typing-text">⏳ Analyzing</span>
      <motion.span
        className="typing-dots"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 0.6, repeat: Infinity }}
      >
        ...
      </motion.span>
    </motion.div>
  );
};

// ============================================================================
// COUNTER COMPONENT (for metrics)
// ============================================================================

const Counter = ({ value, delay = 0, duration = 1.2 }) => {
  const [displayValue, setDisplayValue] = React.useState(0);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      let current = 0;
      const increment = value / (duration * 60); // 60fps
      const interval = setInterval(() => {
        current += increment;
        if (current >= value) {
          setDisplayValue(value);
          clearInterval(interval);
        } else {
          setDisplayValue(Math.floor(current));
        }
      }, 1000 / 60);

      return () => clearInterval(interval);
    }, delay * 1000);

    return () => clearTimeout(timer);
  }, [value, delay, duration]);

  return <span className="counter">{displayValue}</span>;
};

// ============================================================================
// SCENE 1: DATA LOGGING (Text)
// ============================================================================

const Scene1 = () => {
  return (
    <AnimatePresence>
      <ChatBubble
        type="bot"
        text="Привет! 👋 Отправь мне что-нибудь интересное"
        timestamp="14:23"
        delay={0}
      />

      <ChatBubble
        type="user"
        text="пил кофе в 14:00 ☕"
        timestamp="14:25"
        delay={0.8}
      />

      <TypingIndicator delay={1.1} />

      <ChatBubble
        type="bot"
        timestamp="14:26"
        delay={1.7}
      >
        <motion.div className="bot-response-content">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            ✅ Записал!
          </motion.p>

          <motion.div
            className="metric-item"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <span>☕ Кофе в 14:00</span>
          </motion.div>

          <motion.div
            className="metric-item"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
          >
            <span>95 mg caffeine</span>
          </motion.div>

          <motion.div
            className="metric-item info"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <span>📊 Added to dashboard</span>
          </motion.div>
        </motion.div>
      </ChatBubble>
    </AnimatePresence>
  );
};

// ============================================================================
// SCENE 2: FOOD PHOTO ANALYSIS
// ============================================================================

const Scene2 = () => {
  const photoUrl = 'data:image/svg+xml,%3Csvg width="200" height="150" xmlns="http://www.w3.org/2000/svg"%3E%3Crect fill="%23ddd" width="200" height="150"/%3E%3Ctext x="50" y="75" font-size="24"%3E🍔🍟%3C/text%3E%3C/svg%3E';

  return (
    <AnimatePresence>
      <ChatBubble
        type="bot"
        text="Покажи мне что ты ешь 🍽️"
        timestamp="14:30"
        delay={0}
      />

      <motion.div
        className="chat-message user"
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        exit={{ x: 20, opacity: 0 }}
      >
        <div className={`bubble user`}>
          <motion.img
            src={photoUrl}
            alt="Food"
            className="food-photo"
            initial={{ filter: 'blur(10px)', opacity: 0 }}
            animate={{ filter: 'blur(0px)', opacity: 1 }}
            transition={{ duration: 0.5 }}
          />
          <span className="timestamp">14:32</span>
          <span className="checkmark">✓✓</span>
        </div>
      </motion.div>

      <TypingIndicator delay={2.2} />

      <ChatBubble
        type="bot"
        timestamp="14:34"
        delay={5.4}
      >
        <motion.div className="bot-response-content">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            🔍 Я вижу:
          </motion.p>

          {['🍔 Big Mac', '🍟 French fries', '🥤 Coca-Cola'].map(
            (item, i) => (
              <motion.div
                key={i}
                className="metric-item"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.15 }}
              >
                <span>{item}</span>
              </motion.div>
            )
          )}

          <motion.p
            className="section-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.75 }}
          >
            📊 Nutrients:
          </motion.p>

          <motion.div
            className="metric-item"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <Counter value={550} delay={0.9} /> kcal | 25g protein
          </motion.div>

          <motion.div
            className="metric-item"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
          >
            30g fat | 45g carbs
          </motion.div>

          <motion.div
            className="metric-item success glow"
            initial={{ opacity: 0, boxShadow: '0 0 0px rgba(49, 162, 76, 0)' }}
            animate={{ 
              opacity: 1,
              boxShadow: '0 0 12px rgba(49, 162, 76, 0.4)'
            }}
            transition={{ delay: 1.3, duration: 0.4 }}
          >
            <span>✅ Saved to Food Diary</span>
          </motion.div>
        </motion.div>
      </ChatBubble>
    </AnimatePresence>
  );
};

// ============================================================================
// SCENE 3: HEALTH QUERY (AI Analysis)
// ============================================================================

const Scene3 = () => {
  const insights = [
    {
      number: '1️⃣',
      title: '☕ Кофе после 15:00',
      text: '→ сон на 1.5ч короче на следующую ночь'
    },
    {
      number: '2️⃣',
      title: '🍽️ Поздняя еда (>21:00)',
      text: '→ HRV падает на 15%'
    },
    {
      number: '3️⃣',
      title: '💼 Стрессовые дни',
      text: '→ пульс покоя поднимается на 8 уд/мин'
    }
  ];

  return (
    <AnimatePresence>
      <ChatBubble
        type="bot"
        text="Как дела? 👋"
        timestamp="14:40"
        delay={0}
      />

      <ChatBubble
        type="user"
        text="Почему я так устаю днем?"
        timestamp="14:42"
        delay={0.8}
      />

      <TypingIndicator delay={1.5} />

      <ChatBubble
        type="bot"
        timestamp="14:46"
        delay={4.6}
      >
        <motion.div className="bot-response-content">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            🧠 Я нашел 3 закономерности:
          </motion.p>

          {insights.map((insight, idx) => (
            <motion.div key={idx} className="insight-block">
              {/* Counter with zoom */}
              <motion.span
                className="insight-number"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  delay: 0.3 + idx * 0.5,
                  duration: 0.2,
                  ease: 'easeOut'
                }}
              >
                {insight.number}
              </motion.span>

              {/* Title */}
              <motion.span
                className="insight-title"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.48 + idx * 0.5, duration: 0.15 }}
              >
                {insight.title}
              </motion.span>

              {/* Explanation */}
              <motion.span
                className="insight-text"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.63 + idx * 0.5, duration: 0.15 }}
              >
                {insight.text}
              </motion.span>
            </motion.div>
          ))}

          {/* Recommendation */}
          <motion.div
            className="recommendation glow"
            initial={{ opacity: 0, boxShadow: '0 0 0px rgba(255, 193, 7, 0)' }}
            animate={{
              opacity: 1,
              boxShadow: '0 0 16px rgba(255, 193, 7, 0.5)'
            }}
            transition={{ delay: 2.3, duration: 0.4 }}
          >
            <span>💡 Совет: спи раньше на 20 мин</span>
          </motion.div>

          {/* Action Button */}
          <motion.button
            className="action-button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.55 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            🔬 Запустить эксперимент? <strong>ДА</strong>
          </motion.button>
        </motion.div>
      </ChatBubble>
    </AnimatePresence>
  );
};

// ============================================================================
// MAIN CAROUSEL COMPONENT
// ============================================================================

const TelegramDemoCarousel = () => {
  const [currentScene, setCurrentScene] = useState(0);
  const [isAutoplay, setIsAutoplay] = useState(true);

  const scenes = [
    { name: 'Scene1', component: Scene1, duration: 4.5 },
    { name: 'Scene2', component: Scene2, duration: 10 },
    { name: 'Scene3', component: Scene3, duration: 11 }
  ];

  // Autoplay logic
  useEffect(() => {
    if (!isAutoplay) return;

    const timer = setTimeout(() => {
      setCurrentScene((prev) => (prev + 1) % scenes.length);
    }, scenes[currentScene].duration * 1000);

    return () => clearTimeout(timer);
  }, [currentScene, isAutoplay, scenes]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        setCurrentScene((prev) => (prev - 1 + scenes.length) % scenes.length);
        setIsAutoplay(false);
      } else if (e.key === 'ArrowRight') {
        setCurrentScene((prev) => (prev + 1) % scenes.length);
        setIsAutoplay(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scenes.length]);

  const CurrentScene = scenes[currentScene].component;

  return (
    <div className="telegram-demo-container">
      {/* Header */}
      <div className="chat-header">
        <span className="header-title">Telegram</span>
        <button className="close-btn" onClick={() => {}}>×</button>
      </div>

      {/* Chat Content */}
      <div className="chat-content">
        <AnimatePresence mode="wait">
          <div key={currentScene}>
            <CurrentScene />
          </div>
        </AnimatePresence>
      </div>

      {/* Input Field (visual only) */}
      <div className="chat-input">
        <span className="input-icon">📎</span>
        <input
          type="text"
          placeholder="Type a message..."
          disabled
          className="input-field"
        />
        <button className="send-btn">Send</button>
      </div>

      {/* Indicators */}
      <div className="indicators">
        {scenes.map((_, idx) => (
          <motion.button
            key={idx}
            className={`dot ${currentScene === idx ? 'active' : ''}`}
            onClick={() => {
              setCurrentScene(idx);
              setIsAutoplay(false);
            }}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
          />
        ))}
      </div>

      {/* Navigation Buttons */}
      <div className="nav-buttons">
        <button
          className="nav-btn"
          onClick={() => {
            setCurrentScene((prev) => (prev - 1 + scenes.length) % scenes.length);
            setIsAutoplay(false);
          }}
        >
          ← Prev
        </button>
        <span className="page-indicator">
          {currentScene + 1} / {scenes.length}
        </span>
        <button
          className="nav-btn"
          onClick={() => {
            setCurrentScene((prev) => (prev + 1) % scenes.length);
            setIsAutoplay(false);
          }}
        >
          Next →
        </button>
      </div>

      {/* Autoplay Toggle (optional) */}
      <div className="autoplay-toggle">
        <label>
          <input
            type="checkbox"
            checked={isAutoplay}
            onChange={(e) => setIsAutoplay(e.target.checked)}
          />
          Autoplay
        </label>
      </div>
    </div>
  );
};

export default TelegramDemoCarousel;
