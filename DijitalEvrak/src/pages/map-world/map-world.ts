import { Component, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import * as echarts from 'echarts';
import worldMap from '../../assets/maps/world.json' assert { type: 'json' };

@Component({
  selector: 'app-map-world',
  standalone: true,
  templateUrl: './map-world.html'
})
export class MapWorld implements AfterViewInit {

  @ViewChild('chartContainer') chartContainer!: ElementRef;
  chart!: echarts.ECharts;
  private currentZoom = 1.2;

  private getPinColor(count: number): string {
    if (count > 80) return '#900000ff';   // koyu kırmızı
    if (count > 40) return '#ff2200ff';   // turuncu-kırmızı
    if (count > 20) return '#ff6822ff';   // turuncu
    if (count > 10) return '#ff9f51ff';   // açık turuncu
    return '#fdd49e';                   // çok açık turuncu
  }

  // 🔥 ÖRNEK MİSYON VERİLERİ
  private missions = [
    // ABD
    {
      name: "ABD / Washington Büyükelçiliği",
      coords: [-77.0369, 38.9072],
      count: 26,
      code: "US-WAS",
      type: "embassy",
      countryGroup: "america"
    },
    {
      name: "ABD / New York Başkonsolosluğu",
      coords: [-74.0060, 40.7128],
      count: 14,
      code: "US-NYC",
      type: "consulate",
      countryGroup: "america"
    },

    // Almanya
    {
      name: "Almanya / Berlin Büyükelçiliği",
      coords: [13.4050, 52.5200],
      count: 120,
      code: "DE-BER",
      type: "embassy",
      countryGroup: "europe"
    },
    {
      name: "Almanya / Frankfurt Başkonsolosluğu",
      coords: [8.6821, 50.1109],
      count: 55,
      code: "DE-FRA",
      type: "consulate",
      countryGroup: "europe"
    },

    // Fransa
    {
      name: "Fransa / Paris Büyükelçiliği",
      coords: [2.3522, 48.8566],
      count: 42,
      code: "FR-PAR",
      type: "embassy",
      countryGroup: "europe"
    },

    // İngiltere
    {
      name: "Birleşik Krallık / Londra Büyükelçiliği",
      coords: [-0.1276, 51.5074],
      count: 33,
      code: "UK-LON",
      type: "embassy",
      countryGroup: "europe"
    },

    // İtalya
    {
      name: "İtalya / Roma Büyükelçiliği",
      coords: [12.4964, 41.9028],
      count: 20,
      code: "IT-ROM",
      type: "embassy",
      countryGroup: "europe"
    },

    // İspanya
    {
      name: "İspanya / Madrid Büyükelçiliği",
      coords: [-3.7038, 40.4168],
      count: 18,
      code: "ES-MAD",
      type: "embassy",
      countryGroup: "europe"
    },

    // İran
    {
      name: "İran / Tahran Büyükelçiliği",
      coords: [51.3890, 35.6892],
      count: 25,
      code: "IR-TEH",
      type: "embassy",
      countryGroup: "middleeast"
    },

    // Irak
    {
      name: "Irak / Bağdat Büyükelçiliği",
      coords: [44.3661, 33.3152],
      count: 40,
      code: "IQ-BGD",
      type: "embassy",
      countryGroup: "middleeast"
    },

    // Suudi Arabistan
    {
      name: "Suudi Arabistan / Riyad Büyükelçiliği",
      coords: [46.6753, 24.7136],
      count: 22,
      code: "SA-RYD",
      type: "embassy",
      countryGroup: "middleeast"
    },

    // Güney Afrika
    {
      name: "Güney Afrika / Pretoria Büyükelçiliği",
      coords: [28.2293, -25.7479],
      count: 10,
      code: "ZA-PRE",
      type: "embassy",
      countryGroup: "africa"
    },

    // Kenya
    {
      name: "Kenya / Nairobi Büyükelçiliği",
      coords: [36.8219, -1.2921],
      count: 7,
      code: "KE-NBO",
      type: "embassy",
      countryGroup: "africa"
    },

    // Hindistan
    {
      name: "Hindistan / Yeni Delhi Büyükelçiliği",
      coords: [77.2090, 28.6139],
      count: 12,
      code: "IN-DEL",
      type: "embassy",
      countryGroup: "asia"
    },

    // Rusya
    {
      name: "Rusya / Moskova Büyükelçiliği",
      coords: [37.6173, 55.7558],
      count: 19,
      code: "RU-MOW",
      type: "embassy",
      countryGroup: "asia"
    },

    // Çin
    {
      name: "Çin / Pekin Büyükelçiliği",
      coords: [116.4074, 39.9042],
      count: 25,
      code: "CN-BEI",
      type: "embassy",
      countryGroup: "asia"
    },

    // Japonya
    {
      name: "Japonya / Tokyo Büyükelçiliği",
      coords: [139.6917, 35.6895],
      count: 11,
      code: "JP-TYO",
      type: "embassy",
      countryGroup: "asia"
    }
  ];


  ngAfterViewInit() {
    echarts.registerMap('world', worldMap as any);
    this.chart = echarts.init(this.chartContainer.nativeElement);

    // 🔥 SENİN HEAT DATA'N AYNI BIRAKILDI
    const heatData = [
      { name: 'Albania', value: null, tr: 'Arnavutluk' },
      { name: 'Andorra', value: null, tr: 'Andorra' },
      { name: 'Armenia', value: null, tr: 'Ermenistan' },
      { name: 'Avusturya', value: null, tr: 'Avusturya' },
      { name: 'Azerbaycan', value: null, tr: 'Azerbaycan' },
      { name: 'Belarus', value: null, tr: 'Belarus' },
      { name: 'Belçika', value: null, tr: 'Belçika' },
      { name: 'Bosnia and Herzegovina', value: null, tr: 'Bosna-Hersek' },
      { name: 'Bulgaristan', value: null, tr: 'Bulgaristan' },
      { name: 'Croatia', value: null, tr: 'Hırvatistan' },
      { name: 'Cyprus', value: null, tr: 'Güney Kıbrıs' },
      { name: 'N. Cyprus', value: null, tr: 'Kuzey Kıbrıs Türk Cumhuriyeti' },
      { name: 'Czech Rep.', value: null, tr: 'Çekya' },
      { name: 'Denmark', value: null, tr: 'Danimarka' },
      { name: 'Estonya', value: null, tr: 'Estonya' },
      { name: 'Finlandiya', value: null, tr: 'Finlandiya' },
      { name: 'Fransa', value: null, tr: 'Fransa' },
      { name: 'Gürcistan', value: null, tr: 'Gürcistan' },
      { name: 'Almanya', value: null, tr: 'Almanya' },
      { name: 'Yunanistan', value: null, tr: 'Yunanistan' },
      { name: 'Macaristan', value: null, tr: 'Macaristan' },
      { name: 'Iceland', value: null, tr: 'İzlanda' },
      { name: 'Ireland', value: null, tr: 'İrlanda' },
      { name: 'İtalya', value: null, tr: 'İtalya' },
      { name: 'Kazakhstan', value: null, tr: 'Kazakistan' }, // kısmen Avrupa
      { name: 'Kosovo', value: null, tr: 'Kosova' },
      { name: 'Latvia', value: null, tr: 'Letonya' },
      { name: 'Liechtenstein', value: null, tr: 'Lihtenştayn' },
      { name: 'Lithuania', value: null, tr: 'Litvanya' },
      { name: 'Luxembourg', value: null, tr: 'Lüksemburg' },
      { name: 'Malta', value: null, tr: 'Malta' },
      { name: 'Moldova', value: null, tr: 'Moldova' },
      { name: 'Monaco', value: null, tr: 'Monako' },
      { name: 'Montenegro', value: null, tr: 'Karadağ' },
      { name: 'Netherlands', value: null, tr: 'Hollanda' },
      { name: 'North Macedonia', value: null, tr: 'Kuzey Makedonya' },
      { name: 'Norveç', value: null, tr: 'Norveç' },
      { name: 'Polonya', value: null, tr: 'Polonya' },
      { name: 'Portekiz', value: null, tr: 'Portekiz' },
      { name: 'Romanya', value: null, tr: 'Romanya' },
      { name: 'Rusya', value: null, tr: 'Rusya' },
      { name: 'San Marino', value: null, tr: 'San Marino' },
      { name: 'Sırbistan', value: null, tr: 'Sırbistan' },
      { name: 'Slovakya', value: null, tr: 'Slovakya' },
      { name: 'Slovenya', value: null, tr: 'Slovenya' },
      { name: 'İspanya', value: null, tr: 'İspanya' },
      { name: 'İsveç', value: null, tr: 'İsveç' },
      { name: 'İsviçre', value: null, tr: 'İsviçre' },
      { name: 'Türkiye', value: null, tr: 'Türkiye' },
      { name: 'Ukraine', value: null, tr: 'Ukrayna' },
      { name: 'United Kingdom', value: null, tr: 'Birleşik Krallık' },
      { name: 'Vatican City', value: null, tr: 'Vatikan' },
      { name: 'Çin', value: null, tr: 'Çin' },
      { name: 'Iraq', value: null, tr: 'Irak' },
      { name: 'Azerbaijan', value: null, tr: 'Azerbaycan' },
      { name: 'Iran', value: null, tr: 'İran' },
      { name: 'Amerika Birleşik Devletleri', value: null, tr: 'Amerika Birleşik Devletleri' },
      { name: 'Kanada', value: null, tr: 'Kanada' },
      { name: 'Greenland', value: null, tr: 'Grönland' },
      { name: 'Meksika', value: null, tr: 'Meksika' },
      { name: 'Brezilya', value: null, tr: 'Brezilya' },
      { name: 'SSuudi Arabistan', value: null, tr: 'Suudi Arabistan' },
      { name: 'Arjantin', value: null, tr: 'Arjantin' },
      { name: 'Avusturalya', value: null, tr: 'Avusturalya' },
      { name: 'Hindistan', value: null, tr: 'Hindistan' },
      { name: 'Japonya', value: null, tr: 'Japonya' },
      { name: 'Güney Kore', value: null, tr: 'Güney Kore' },
      { name: 'Moğolistan', value: null, tr: 'Moğolistan' },
      { name: 'Algeria', value: null, tr: 'Cezayir' },
      { name: 'Angola', value: null, tr: 'Angola' },
      { name: 'Benin', value: null, tr: 'Benin' },
      { name: 'Botswana', value: null, tr: 'Botsvana' },
      { name: 'Burkina Faso', value: null, tr: 'Burkina Faso' },
      { name: 'Burundi', value: null, tr: 'Burundi' },
      { name: 'Cabo Verde', value: null, tr: 'Yeşil Burun Adaları' },
      { name: 'Cameroon', value: null, tr: 'Kamerun' },
      { name: 'Central African Republic', value: null, tr: 'Orta Afrika Cumhuriyeti' },
      { name: 'Chad', value: null, tr: 'Çad' },
      { name: 'Comoros', value: null, tr: 'Komorlar' },
      { name: 'Democratic Republic of the Congo', value: null, tr: 'Kongo Demokratik Cumhuriyeti' },
      { name: 'Republic of the Congo', value: null, tr: 'Kongo Cumhuriyeti' },
      { name: 'Djibouti', value: null, tr: 'Cibuti' },
      { name: 'Egypt', value: null, tr: 'Mısır' },
      { name: 'Equatorial Guinea', value: null, tr: 'Ekvator Ginesi' },
      { name: 'Eritrea', value: null, tr: 'Eritre' },
      { name: 'Eswatini', value: null, tr: 'Esvatini' },
      { name: 'Ethiopia', value: null, tr: 'Etiyopya' },
      { name: 'Gabon', value: null, tr: 'Gabon' },
      { name: 'Gambia', value: null, tr: 'Gambiya' },
      { name: 'Ghana', value: null, tr: 'Gana' },
      { name: 'Guinea', value: null, tr: 'Gine' },
      { name: 'Guinea-Bissau', value: null, tr: 'Gine-Bissau' },
      { name: 'Kenya', value: null, tr: 'Kenya' },
      { name: 'Lesotho', value: null, tr: 'Lesotho' },
      { name: 'Liberia', value: null, tr: 'Liberya' },
      { name: 'Libya', value: null, tr: 'Libya' },
      { name: 'Madagascar', value: null, tr: 'Madagaskar' },
      { name: 'Malawi', value: null, tr: 'Malavi' },
      { name: 'Mali', value: null, tr: 'Mali' },
      { name: 'Mauritania', value: null, tr: 'Moritanya' },
      { name: 'Mauritius', value: null, tr: 'Mauritius' },
      { name: 'Fas', value: null, tr: 'Fas' },
      { name: 'Mozabik', value: null, tr: 'Mozambik' },
      { name: 'Namibya', value: null, tr: 'Namibya' },
      { name: 'Nijer', value: null, tr: 'Nijer' },
      { name: 'Nigeria', value: null, tr: 'Nijerya' },
      { name: 'Rwanda', value: null, tr: 'Ruanda' },
      { name: 'Sao Tome and Principe', value: null, tr: 'São Tomé ve Príncipe' },
      { name: 'Senegal', value: null, tr: 'Senegal' },
      { name: 'Seychelles', value: null, tr: 'Seyşeller' },
      { name: 'Sierra Leone', value: null, tr: 'Sierra Leone' },
      { name: 'Somalia', value: null, tr: 'Somali' },
      { name: 'South Africa', value: null, tr: 'Güney Afrika' },
      { name: 'South Sudan', value: null, tr: 'Güney Sudan' },
      { name: 'Sudan', value: null, tr: 'Sudan' },
      { name: 'Tanzania', value: null, tr: 'Tanzanya' },
      { name: 'Togo', value: null, tr: 'Togo' },
      { name: 'Tunisia', value: null, tr: 'Tunus' },
      { name: 'Uganda', value: null, tr: 'Uganda' },
      { name: 'Zambia', value: null, tr: 'Zambiya' },
      { name: 'Zimbabwe', value: null, tr: 'Zimbabve' },
      { name: 'Avustralya', value: null, tr: 'Avustralya' },
      { name: 'Birleşik Krallık', value: null, tr: 'Birleşik Krallık' },
      { name: 'Hollanda', value: null, tr: 'Hollanda' },
      { name: 'Suudi Arabistan', value: null, tr: 'Suudi Arabistan' },
      { name: 'İran', value: null, tr: 'İran' },
      { name: 'Irak', value: null, tr: 'Irak' },
      { name: 'Güney Afrika', value: null, tr: 'Güney Afrika' },
      { name: 'Mısır', value: null, tr: 'Mısır' },
      { name: 'Kazakistan', value: null, tr: 'Kazakistan' },
      { name: 'Grönland', value: null, tr: 'Grönland' },
      { name: 'Cezayir', value: null, tr: 'Cezayir' },
      { name: 'Afganistan', value: null, tr: 'Afganistan' }
    ];

    this.chart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          // 📌 Scatter (misyon) tooltip
          if (p.seriesType === 'scatter') {
            return `
              <b>${p.name}</b><br/>
              Evrak: ${p.value[2]}
            `;
          }
          return p.name;
        }
      },

      visualMap: {
        min: 0,
        max: 150,
        text: ['Yüksek', 'Düşük'],
        calculable: true,
        inRange: {
          color: ['#ffecb3ff', '#e97730ff', '#76d600ff', '#088abdff', '#01355fff']
        }
      },

      geo: {
        map: 'world',
        roam: true,
        scaleLimit: { min: 0.5, max: 10 },
        zoom: this.currentZoom,
  itemStyle: {
    areaColor: '#e1f7fdff', 
    borderColor: '#96a6adff',
    borderWidth: 0.5
  },
        label: {
          show: true,
          fontSize: 10,
          color: '#000',
          formatter: (p: any) => {
            return p.data && p.data.value != null
              ? (p.data.tr ?? p.name)
              : '';
          }
        },
        nameMap: {
          "Germany": "Almanya",
          "United States": "Amerika Birleşik Devletleri",
          "France": "Fransa",
          "Italy": "İtalya",
          "Spain": "İspanya",
          "United Kingdom": "Birleşik Krallık",
          "China": "Çin",
          "Japan": "Japonya",
          "Russia": "Rusya",
          "Turkey": "Türkiye",
          "Iran": "İran",
          "Iraq": "Irak",
          "Saudi Arabia": "Suudi Arabistan",
          "South Africa": "Güney Afrika",
          "Kenya": "Kenya",
          "India": "Hindistan",
          "Brazil": "Brezilya",
          "Argentina": "Arjantin",
          "Mexico": "Meksika",
          "Canada": "Kanada",
          "Australia": "Avustralya",
          "Egypt": "Mısır",
          "Greece": "Yunanistan",
          "Netherlands": "Hollanda",
          "Belgium": "Belçika",
          "Portugal": "Portekiz",
          "Sweden": "İsveç",
          "Norway": "Norveç",
          "Poland": "Polonya",
          "Kazakhstan": "Kazakistan",
          "Mongolia": "Moğolistan",
          "Korea": "Güney Kore",
          "Greenland": "Grönland",
          "Algeria": "Cezayir",
          "Morocco": "Fas",
          "Afghanistan": "Afganistan",
          // gerekirse tüm dünyayı eklerim
        }
      },

      series: [
        // 1️⃣ ÜLKELERİN HEATMAP KATMANI
        {
          type: 'map',
          geoIndex: 0,
          data: heatData
        },

        // 2️⃣ MİSYONLARIN SCATTER (PIN) KATMANI
        {
          name: "Missions",
          type: "scatter",
          coordinateSystem: "geo",
          symbol: "pin",
          symbolSize: 32,
          itemStyle: {
            color: "#ff0400ff"
          },
          emphasis: {
            itemStyle: {
              color: "#e6000fff"
            }
          },
          data: this.missions.map(m => ({
            name: m.name,
            value: [...m.coords, m.count],
            code: m.code
          }))
        }
      ]
    });

    // 📌 Tıklama ile misyon detayına yönlendirme
    this.chart.on('click', (params: any) => {
      if (params.seriesType === 'scatter') {
        console.log("Tıklanan misyon:", params.data.code);
        // burada route atayabilirsin → this.router.navigate(['/misyon', params.data.code])
      }
    });

    window.addEventListener('resize', () => this.chart.resize());
  }

  zoomIn() {
    this.currentZoom = Math.min(this.currentZoom * 1.2, 10);
    this.applyZoom();
  }

  zoomOut() {
    this.currentZoom = Math.max(this.currentZoom * 0.8, 0.5);
    this.applyZoom();
  }

  private applyZoom() {
    this.chart.setOption({
      geo: { zoom: this.currentZoom }
    });
  }

  private defaultCenter = [0, 15];
  private defaultZoom = 1.2;

  resetZoom() {
    this.currentZoom = this.defaultZoom;

    this.chart.setOption({
      geo: {
        zoom: this.currentZoom,
        center: this.defaultCenter
      }
    });
  }

  centerMap() {
    this.chart.setOption({
      geo: { center: this.defaultCenter }
    });
  }
}
