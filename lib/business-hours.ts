import type { BusinessHoursConfig, WeekDay, BusinessDaySchedule, SubAgent } from '@/types';

export function getCurrentWeekDay(): WeekDay {
  return new Date().getDay() as WeekDay;
}

export function parseTimeString(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(':').map((n) => parseInt(n, 10));
  return { hours: h || 0, minutes: m || 0 };
}

export function isStoreOpen(config: BusinessHoursConfig, date: Date = new Date()): boolean {
  const day = date.getDay() as WeekDay;
  const schedule = config.days[day];
  if (!schedule || !schedule.enabled) return false;

  const { hours: openH, minutes: openM } = parseTimeString(schedule.openTime);
  const { hours: closeH, minutes: closeM } = parseTimeString(schedule.closeTime);

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  if (closeMinutes <= openMinutes) {
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

export function getNextOpenTime(config: BusinessHoursConfig, from: Date = new Date()): { day: WeekDay; openTime: string } | null {
  for (let i = 0; i < 7; i++) {
    const checkDay = ((from.getDay() + i) % 7) as WeekDay;
    const schedule = config.days[checkDay];
    if (schedule && schedule.enabled) {
      if (i === 0) {
        const { hours: openH, minutes: openM } = parseTimeString(schedule.openTime);
        const currentMinutes = from.getHours() * 60 + from.getMinutes();
        if (currentMinutes < openH * 60 + openM) {
          return { day: checkDay, openTime: schedule.openTime };
        }
      } else {
        return { day: checkDay, openTime: schedule.openTime };
      }
    }
  }
  return null;
}

export const WEEK_DAY_NAMES: Record<WeekDay, string> = {
  0: 'الأحد',
  1: 'الإثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
};

export const WEEK_DAYS: WeekDay[] = [0, 1, 2, 3, 4, 5, 6];

export function isScheduleOpen(schedule: Record<WeekDay, BusinessDaySchedule>, date: Date = new Date()): boolean {
  const day = date.getDay() as WeekDay;
  const daySchedule = schedule[day];
  if (!daySchedule || !daySchedule.enabled) return false;

  const { hours: openH, minutes: openM } = parseTimeString(daySchedule.openTime);
  const { hours: closeH, minutes: closeM } = parseTimeString(daySchedule.closeTime);

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  if (closeMinutes <= openMinutes) {
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

export function isAgentOpen(agent: SubAgent, date: Date = new Date()): boolean {
  if (!agent.scheduleEnabled) return true;
  return isScheduleOpen(agent.schedule, date);
}

export function isSupplierWorkHours(supplier: { workHoursEnabled?: boolean; workHoursStart?: string; workHoursEnd?: string; workDays?: number[] }, date: Date = new Date()): boolean {
  if (!supplier.workHoursEnabled) return true;
  if (!supplier.workHoursStart || !supplier.workHoursEnd) return true;
  if (supplier.workDays && supplier.workDays.length > 0 && !supplier.workDays.includes(date.getDay())) return false;
  const { hours: openH, minutes: openM } = parseTimeString(supplier.workHoursStart);
  const { hours: closeH, minutes: closeM } = parseTimeString(supplier.workHoursEnd);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  if (closeMinutes <= openMinutes) {
    return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

export function getNextScheduleOpenTime(schedule: Record<WeekDay, BusinessDaySchedule>, from: Date = new Date()): { day: WeekDay; openTime: string } | null {
  for (let i = 0; i < 7; i++) {
    const checkDay = ((from.getDay() + i) % 7) as WeekDay;
    const daySchedule = schedule[checkDay];
    if (daySchedule && daySchedule.enabled) {
      if (i === 0) {
        const { hours: openH, minutes: openM } = parseTimeString(daySchedule.openTime);
        const currentMinutes = from.getHours() * 60 + from.getMinutes();
        if (currentMinutes < openH * 60 + openM) {
          return { day: checkDay, openTime: daySchedule.openTime };
        }
      } else {
        return { day: checkDay, openTime: daySchedule.openTime };
      }
    }
  }
  return null;
}

export function getNextAgentOpenTime(agent: SubAgent, from: Date = new Date()): { day: WeekDay; openTime: string } | null {
  if (!agent.scheduleEnabled) return null;
  return getNextScheduleOpenTime(agent.schedule, from);
}

export function createDefaultSchedule(): Record<WeekDay, BusinessDaySchedule> {
  return {
    0: { enabled: false, openTime: '09:00', closeTime: '18:00' },
    1: { enabled: true, openTime: '09:00', closeTime: '18:00' },
    2: { enabled: true, openTime: '09:00', closeTime: '18:00' },
    3: { enabled: true, openTime: '09:00', closeTime: '18:00' },
    4: { enabled: true, openTime: '09:00', closeTime: '18:00' },
    5: { enabled: true, openTime: '09:00', closeTime: '18:00' },
    6: { enabled: true, openTime: '09:00', closeTime: '14:00' },
  };
}
