/**
 * NHOM UNIT - Ham chon khoa dem va chuan hoa so dien thoai.
 * Dac ta chi tiet: TESTCASES.md, muc "Nhom UNIT".
 */
import { ExecutionContext } from '@nestjs/common';
import { normalizePhone, trackByAccount, trackByPhone } from '../src/common/trackers';

const ctx = {} as ExecutionContext;

describe('Nhom UNIT - trackers', () => {
  describe('normalizePhone', () => {
    it.each([
      ['TC-UNIT-01', '0912345678', '0912345678'],
      ['TC-UNIT-02', '+84912345678', '0912345678'],
      ['TC-UNIT-03', '84912345678', '0912345678'],
      ['TC-UNIT-04', '+84 912 345 678', '0912345678'],
      ['TC-UNIT-05', '0912-345-678', '0912345678'],
      ['TC-UNIT-06', '(091) 234.5678', '0912345678'],
      ['TC-UNIT-07', '', ''],
      ['TC-UNIT-08', 'abc', ''],
      ['TC-UNIT-09', undefined, ''],
      ['TC-UNIT-10', null, ''],
    ])('%s: normalizePhone(%p) = %p', (_id, input, expected) => {
      expect(normalizePhone(input)).toBe(expected);
    });
  });

  describe('trackByAccount', () => {
    it('TC-UNIT-11: da dang nhap -> "user:<id>"', () => {
      expect(trackByAccount({ user: { id: 'u1' }, ip: '1.2.3.4' }, ctx)).toBe('user:u1');
    });

    it('TC-UNIT-12: chua dang nhap -> "ip:<ip>"', () => {
      expect(trackByAccount({ ip: '1.2.3.4' }, ctx)).toBe('ip:1.2.3.4');
    });

    it('TC-UNIT-13: tien to tach biet - user co id trung voi mot IP khong dung chung bo dem voi IP do', () => {
      expect(trackByAccount({ user: { id: '1.2.3.4' }, ip: '9.9.9.9' }, ctx)).not.toBe(
        trackByAccount({ ip: '1.2.3.4' }, ctx),
      );
    });
  });

  describe('trackByPhone', () => {
    it('TC-UNIT-14: co phone -> "phone:<so da chuan hoa>"', () => {
      expect(trackByPhone({ body: { phone: '+84 912 345 678' }, ip: '1.2.3.4' }, ctx)).toBe('phone:0912345678');
    });

    it('TC-UNIT-15: body rong / phone khong hop le -> roi ve "ip:<ip>"', () => {
      expect(trackByPhone({ body: {}, ip: '1.2.3.4' }, ctx)).toBe('ip:1.2.3.4');
      expect(trackByPhone({ body: { phone: 'abc' }, ip: '1.2.3.4' }, ctx)).toBe('ip:1.2.3.4');
      expect(trackByPhone({ ip: '1.2.3.4' }, ctx)).toBe('ip:1.2.3.4');
    });
  });
});
