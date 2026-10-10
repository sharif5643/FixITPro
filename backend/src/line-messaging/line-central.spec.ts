import { followLink, ticketFromMessage } from './line-central';

describe('LINE follow by ticket', () => {
  it('reads the ticket from the prefilled message, the ticket alone, or lower case', () => {
    expect(ticketFromMessage('ติดตามงาน REP-20261002-A1B2C3')).toBe('REP-20261002-A1B2C3');
    expect(ticketFromMessage('rep-20261002-a1b2c3')).toBe('REP-20261002-A1B2C3');
    expect(ticketFromMessage('สวัสดีครับ')).toBeNull();
    expect(ticketFromMessage('0812345678')).toBeNull();
  });

  it('builds the LINE link that opens the chat with the message typed in', () => {
    const url = followLink('fixitpro', 'REP-20261002-A1B2C3');
    expect(url.startsWith('https://line.me/R/oaMessage/%40fixitpro/?')).toBe(true);
    expect(decodeURIComponent(url.split('?')[1])).toBe('ติดตามงาน REP-20261002-A1B2C3');
  });
});
