import { bkkDayAfter, bkkDayEnd, bkkDayStart, bkkMonthKey, bkkMonthStart } from './bangkok';

describe('Bangkok days and months', () => {
  it('a picked day is the whole Bangkok day', () => {
    expect(bkkDayStart('2026-11-05').toISOString()).toBe('2026-11-04T17:00:00.000Z');
    expect(bkkDayAfter('2026-11-05').toISOString()).toBe('2026-11-05T17:00:00.000Z');
    expect(bkkDayEnd('2026-11-05').toISOString()).toBe('2026-11-05T16:59:59.999Z');
  });
  it('a sale at 01:30 Bangkok on the 1st belongs to that month', () => {
    expect(bkkMonthKey(new Date('2026-10-31T18:30:00Z'))).toBe('2026-11');
  });
  it('month starts count back in Bangkok', () => {
    const now = new Date('2026-11-01T02:00:00Z');                 // 09:00 on 1 Nov in Bangkok
    expect(bkkMonthStart(0, now).toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(bkkMonthStart(1, now).toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(bkkMonthStart(-1, now).toISOString()).toBe('2026-11-30T17:00:00.000Z');
  });
});
