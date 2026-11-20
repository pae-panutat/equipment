// The colours that say how urgent something is. One place, so the calendar, its legend and the dashboard always agree:
// anything past its date is red, an unfinished job or something coming up soon is yellow, a plan is purple.
export const TONE = {
  plan: { name: "แผนบำรุงรักษา", chip: "bg-primary-soft text-primary", dot: "bg-primary" },
  overdue: { name: "เกินกำหนด", chip: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300", dot: "bg-red-500" },
  job: { name: "ใบงานที่ยังไม่เสร็จ", chip: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300", dot: "bg-yellow-400" },
  soon: { name: "ใกล้ครบกำหนด", chip: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300", dot: "bg-yellow-400" },
} as const;
