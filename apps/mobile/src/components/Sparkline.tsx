import { View } from 'react-native'
import Svg, { Circle, Polyline } from 'react-native-svg'

interface Props {
  /** Значения по дням, старые слева. null — день без данных. */
  points: (number | null)[]
  width: number
  height: number
  color?: string
}

// Спарклайн: ломаная по точкам, без осей, подписей и легенды. На телефоне
// подписи всё равно нечитаемы, а число без тренда не интерпретируется — 62
// после недели пятидесятых и 62 после недели восьмидесятых значат разное.
//
// Пропуски РВУТ линию, а не читаются как ноль: день без данных — это не день
// с готовностью 0, и нарисовать его нулём значило бы показать провал, которого
// не было. Поэтому каждый непрерывный отрезок рисуется своей ломаной.
export function Sparkline({ points, width, height, color = '#111' }: Props) {
  const values = points.filter((v): v is number => v != null)
  if (values.length < 2) return <View style={{ width, height }} />

  const min = Math.min(...values)
  const max = Math.max(...values)
  // Плоский ряд не должен делить на ноль: рисуем его посередине.
  const span = max - min || 1
  const padding = 2
  const usableHeight = height - padding * 2
  const stepX = points.length > 1 ? width / (points.length - 1) : 0

  const x = (i: number) => i * stepX
  const y = (value: number) => padding + usableHeight - ((value - min) / span) * usableHeight

  // Собираем непрерывные отрезки: последовательности подряд идущих не-null.
  const segments: { i: number; value: number }[][] = []
  let current: { i: number; value: number }[] = []
  points.forEach((value, i) => {
    if (value == null) {
      if (current.length) segments.push(current)
      current = []
      return
    }
    current.push({ i, value })
  })
  if (current.length) segments.push(current)

  const lastIndex = points.length - 1
  const lastValue = points[lastIndex]

  return (
    <Svg width={width} height={height}>
      {segments.map((segment, index) => (
        segment.length > 1 ? (
          <Polyline
            key={index}
            points={segment.map(p => `${x(p.i)},${y(p.value)}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          // Одиночная точка между пропусками: линию не построить, но данные
          // за этот день есть, и молча их прятать неправильно.
          <Circle key={index} cx={x(segment[0].i)} cy={y(segment[0].value)} r={2} fill={color} />
        )
      ))}
      {lastValue != null ? (
        <Circle cx={x(lastIndex)} cy={y(lastValue)} r={3.5} fill={color} />
      ) : null}
    </Svg>
  )
}
