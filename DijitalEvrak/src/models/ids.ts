/**
 * Birim kimliği: birimler kaynak sistemden (ComDepartment) gelir, kimlikleri sayıdır (ör. 11084875).
 * Kullanıcı, evrak, dış kurum vb. kimlikler Guid (string) olarak kalır.
 */
export type DepartmentId = number;

/**
 * Dış kurum / misyon kimliği: kaynak sistemde (ComAgency) sayı (ör. 1000000001). "Dilekçe / Talep" -1'dir;
 * "seçilmedi" kontrolü 0 / null ile yapılmalı, < 0 ile değil.
 */
export type ExternalInstitutionId = number;

/**
 * Kimliği sözlük anahtarı / karşılaştırma için tek biçime getirir. Guid'ler uç noktaya göre büyük ya da
 * küçük harfli gelebildiği için küçük harfe çevrilir; sayı kimlikler (birim) metne çevrilir. Boşsa null.
 */
export function idKey(id: string | number | null | undefined): string | null {
  if (id === null || id === undefined || id === '') return null;
  return String(id).toLowerCase();
}

/** İki kimlik aynı mı (ikisi de doluysa); Guid'de büyük / küçük harf, birimde sayı / metin farkı gözetilmez */
export function sameId(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  const x = idKey(a);
  return x !== null && x === idKey(b);
}

/** Token claim'i, adres parametresi ya da seçim kutusu değeri gibi metin gelen birim kimliğini sayıya çevirir */
export function toDepartmentId(value: string | number | null | undefined): DepartmentId | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/** Seçim kutusu / adres parametresi gibi metin gelen kurum kimliğini sayıya çevirir (-1: Dilekçe / Talep) */
export function toExternalInstitutionId(value: string | number | null | undefined): ExternalInstitutionId | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n !== 0 ? n : null;
}
