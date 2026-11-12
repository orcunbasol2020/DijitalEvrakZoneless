import { CODE128_PATTERNS, code128Bars, code128Values, code128Widths } from './code128';

describe('code128', () => {
  it('her simge 11 modül (Stop 13), çubuk toplamı çift', () => {
    CODE128_PATTERNS.forEach((p, v) => {
      const widths = [...p].map(Number);
      expect(widths.reduce((a, b) => a + b, 0)).withContext(`simge ${v}`).toBe(v === 106 ? 13 : 11);
      const bars = widths.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
      expect(bars % 2).withContext(`simge ${v}`).toBe(0);
    });
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });

  it('evrak numarası: rakamlar C kümesinde, "/" B kümesinde', () => {
    // Start C, 20, 26, Code B, "/", Code C, 42, 91, 02, 72, sağlama, Stop
    expect(code128Values('2026/42910272')).toEqual([105, 20, 26, 100, 15, 99, 42, 91, 2, 72, 10, 106]);
    expect(code128Widths('2026/42910272').reduce((a, b) => a + b, 0)).toBe(134);
  });

  it('kısa ve karışık metinler B ile başlar', () => {
    expect(code128Values('ABC')[0]).toBe(104);
    expect(code128Values('123')[0]).toBe(104);
    expect(code128Values('1234')[0]).toBe(105);
  });

  it('çubuklar: ilk çubuk 0. modülde, toplam modül genişliklerle aynı', () => {
    const { bars, modules } = code128Bars('2026/42910272');
    expect(bars[0].x).toBe(0);
    expect(modules).toBe(134);
    const last = bars.at(-1)!;
    expect(last.x + last.w).toBe(modules);
  });

  it('desteklenmeyen karakter ve boş metin reddedilir', () => {
    expect(() => code128Values('')).toThrow();
    expect(() => code128Values('2026/ç')).toThrow();
  });
});
