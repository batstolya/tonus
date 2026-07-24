// Детерминированный прогноз readiness на завтра (SPEC-READINESS-FORECAST §2).
// Логика живёт в ОДНОМ месте — supabase/functions/_shared/forecast.ts (чистый
// модуль, его же импортируют edge-функции). Этот файл — клиентский фасад
// (паттерн scores.ts): re-export, никакой своей логики.
// Копии больше НЕТ — правишь формулу там, и это единственное место.

export { forecastReadiness } from '../../../../supabase/functions/_shared/forecast'
export type {
  FactorId,
  ForecastInput,
  ForecastFactor,
  Forecast,
} from '../../../../supabase/functions/_shared/forecast'
