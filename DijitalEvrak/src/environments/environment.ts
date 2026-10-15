// Canlı (production) derleme ayarları. Geliştirmede environment.development.ts kullanılır
// (angular.json → development → fileReplacements).
export const environment = {
  production: true,
  // Backend kök adresi, sonunda "/" ile. "/" : API, uygulamayla aynı sunucuda (IIS / reverse proxy
  // altında /api) yayınlanıyor demektir; farklı sunucudaysa tam adres yazılır (ör. "https://evrak-api.kurum.gov.tr/").
  apiUrl: '/'
};
