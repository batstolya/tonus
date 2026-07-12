// Дробные часы → целые часы и минуты с переносом.
// Баг был: 6.993ч → floor=6, round(0.993*60)=60 → «6ч 60м». Минуты,
// округлившиеся до 60, должны переноситься в час: → «7ч 0м».
export function hoursToHM(h: number): { hrs: number; mins: number } {
  let hrs = Math.floor(h)
  let mins = Math.round((h - hrs) * 60)
  if (mins === 60) { hrs += 1; mins = 0 }
  return { hrs, mins }
}
