/**
 * Uygulamadaki tüm ECharts grafikleri buradan alınır: tam paket (~1 MB) yerine yalnızca kullanılan
 * grafik türleri ve bileşenler yüklenir. Yeni bir grafik türü / bileşen kullanılırsa buraya eklenmeli;
 * eklenmezse grafik hata vermeden boş kalır.
 */
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, MapChart, PieChart, ScatterChart } from 'echarts/charts';
import { GeoComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { LabelLayout, LegacyGridContainLabel } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  BarChart, HeatmapChart, LineChart, MapChart, PieChart, ScatterChart,
  GeoComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent,
  // grid.containLabel ECharts 6'da ayrı özellik olarak yüklenir
  LabelLayout, LegacyGridContainLabel,
  CanvasRenderer,
]);

export { echarts };
