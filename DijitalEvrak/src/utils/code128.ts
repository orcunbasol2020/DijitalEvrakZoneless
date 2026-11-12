/**
 * Code 128 barkod kodlayıcısı (B ve C kümeleri). Evrak numarası (ör. 2026/42910272) için: rakam blokları C
 * kümesinde ikişer ikişer, diğer karakterler B kümesinde kodlanır; böylece barkod Code 39'a göre çok daha
 * kısa olur. Yalnızca ASCII 32–126 kabul edilir.
 *
 * Çıktı modül genişlikleridir: [çubuk, boşluk, çubuk, boşluk, …], ilk ve son eleman çubuktur. Sessiz boşluk
 * (barkodun iki yanında en az 10 modül) eklenmez; çizen taraf bırakır.
 */

/** Her simgenin çubuk / boşluk genişlikleri (değer 0–105; 106 = Stop, 13 modül). */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const CODE_C = 99;
const CODE_B = 100;
const START_B = 104;
const START_C = 105;
const STOP = 106;

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';

/** i konumundan başlayan ardışık rakam sayısı */
function digitRun(text: string, i: number): number {
  let n = 0;
  while (isDigit(text[i + n])) n++;
  return n;
}

/** Simge değerleri: başlangıç, veri, küme geçişleri, sağlama ve Stop dahil. */
export function code128Values(text: string): number[] {
  if (!text) throw new Error('Barkod içeriği boş olamaz.');
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`Barkodda desteklenmeyen karakter: "${ch}"`);
  }

  const values: number[] = [];
  // Baştaki rakam bloğu 4+ (ya da metnin tamamı 2 rakam) ise C ile başlamak daha kısadır
  const leading = digitRun(text, 0);
  let set: 'B' | 'C' = leading >= 4 || (leading === 2 && text.length === 2) ? 'C' : 'B';
  values.push(set === 'C' ? START_C : START_B);

  let i = 0;
  while (i < text.length) {
    if (set === 'C') {
      if (digitRun(text, i) >= 2) {
        values.push(Number(text.substr(i, 2)));
        i += 2;
        continue;
      }
      values.push(CODE_B);
      set = 'B';
    }

    // B kümesi: sondaki 4+ ya da aradaki 6+ rakamlık blok C'ye geçmeye değer (geçiş maliyetini karşılar)
    const run = digitRun(text, i);
    const atEnd = i + run === text.length;
    if (run >= (atEnd ? 4 : 6)) {
      // Tek sayılı blokta ilk rakam B'de kalır, kalan çift sayı C'de ikişer kodlanır
      if (run % 2 === 1) {
        values.push(text.charCodeAt(i) - 32);
        i++;
      }
      values.push(CODE_C);
      set = 'C';
      continue;
    }
    values.push(text.charCodeAt(i) - 32);
    i++;
  }

  // Sağlama: (başlangıç + Σ konum × değer) mod 103; konum 1'den başlar
  const checksum = values.reduce((sum, v, idx) => sum + (idx === 0 ? v : idx * v), 0) % 103;
  values.push(checksum, STOP);
  return values;
}

/** Modül genişlikleri: [çubuk, boşluk, çubuk, …]; toplamı barkodun modül uzunluğudur (sessiz boşluk hariç). */
export function code128Widths(text: string): number[] {
  return code128Values(text).flatMap(v => [...PATTERNS[v]].map(Number));
}

/** Çizim için çubuklar: x ve genişlik modül cinsinden. */
export function code128Bars(text: string): { bars: { x: number; w: number }[]; modules: number } {
  const widths = code128Widths(text);
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  widths.forEach((w, idx) => {
    if (idx % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return { bars, modules: x };
}

/** Testler için: simge tablosu */
export const CODE128_PATTERNS: readonly string[] = PATTERNS;
