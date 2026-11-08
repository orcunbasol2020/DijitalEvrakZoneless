import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ScanFolder, ScanFolderState } from '../../src/models/scan-folder.model';
import { scanSourceLabel } from '../../src/services/scanneddocument';

/** Akış adımını yapan: tarama sistemi / evrak takip kendiliğinden ya da kullanıcı */
type Actor = 'auto' | 'user';

interface FlowStep {
  icon: string;
  /** Dijitalleştirme Takip ekranındaki aşama adlarıyla aynı */
  title: string;
  actor: Actor;
  actorLabel: string;
  text: string;
  /** Tarama Klasörleri ekranında belgenin bu adımda göründüğü yer */
  where?: string;
  /** Bu adımdan sonraki bağlantı çizgisinin üstündeki not */
  next?: string;
}

type Tone = 'info' | 'warn' | 'ok' | 'progress' | 'done' | 'danger';

interface StatusDef {
  tone: Tone;
  icon: string;
  label: string;
  meaning: string;
  action?: string;
}

/** Klasör akışında bir klasör: yolları (kaynak başına) ve içindeki dosya sayısı */
interface FolderNode {
  /** path küçük harfle gösterilir; original ipucunda (title) olduğu gibi durur */
  paths: { source: string; path: string; original: string }[];
  count: number | null;
}

/**
 * Tarama servisine ulaşılamadığında şemada gösterilen klasör adları: ScannedDocumentApi'nin canlı ScanStorage
 * ayarı (gelen kutusu kaynak başına Sources'tan; okunan / processed / hatali altında kaynak klasörü).
 */
const DEFAULT_FOLDERS: ScanFolder[] = [
  ['Inbox', 'evrak', 'TarananKurum'], ['Inbox', 'nota', 'TarananNota'],
  ['Okunan', 'evrak', 'okunan/evrak'], ['Okunan', 'nota', 'okunan/nota'],
  ['Processed', 'evrak', 'processed/evrak'], ['Processed', 'nota', 'processed/nota'],
  ['Failed', 'evrak', 'hatali/evrak'], ['Failed', 'nota', 'hatali/nota']
].map(([state, source, folder]) => ({ state: state as ScanFolderState, source, folder, exists: true, files: [] }));

interface CaseDef {
  icon: string;
  title: string;
  text: string;
}

const STATUSES: readonly StatusDef[] = [
  { tone: 'info', icon: 'qr_code_scanner', label: 'QR kod okundu', meaning: 'Belge havuzda, evraka bağlanmayı bekliyor.', action: 'QR okutun ya da Taranmış Evraklar\'dan seçin.' },
  { tone: 'warn', icon: 'edit_note', label: 'Elle eşleştirme bekliyor', meaning: 'Barkod okunamadı. Bu bir hata değildir, belge yine havuzdadır.', action: 'Taranmış Evraklar\'da belgeyi seçip evrak numarasını yazın.' },
  { tone: 'warn', icon: 'how_to_reg', label: 'Elle eşleştirildi', meaning: 'Barkodu okunamayan belge bir kullanıcı tarafından evraka bağlandı; akış normal devam eder.' },
  { tone: 'ok', icon: 'check_circle', label: 'Evrak takibe aktarıldı', meaning: 'Belge evraka bağlandı ve listeden düştü.', action: 'Evrak bilgilerini tamamlayıp kaydedin.' },
  { tone: 'progress', icon: 'cloud_sync', label: 'Aktarımda', meaning: 'Evrak kaydedildi ve yayınlandı; Atlas\'a gönderilmek üzere sırada.' },
  { tone: 'done', icon: 'cloud_done', label: 'Tamamlandı', meaning: 'Evrak Atlas\'a aktarıldı, akış bitti.' },
  { tone: 'danger', icon: 'cloud_off', label: 'Atlas hatası', meaning: 'Akışta hata gösterilen tek yer: evrak Atlas\'a aktarılamadı.', action: 'Hata notunu kontrol edin; "Yeniden dene" ile tekrar gönderilebilir.' }
];

const CASES: readonly CaseDef[] = [
  {
    icon: 'group',
    title: 'Aynı belgeyi iki kişi seçti',
    text: 'Yalnızca önce kaydeden başarılı olur. Diğer kullanıcı "başka bir kullanıcı tarafından alınmış" mesajını görür ve liste yenilenir.'
  },
  {
    icon: 'link_off',
    title: 'Numaraya daha önce belge bağlanmış',
    text: 'Belge bu numaraya bağlanmaz ve havuzda kalır. Numarayı kontrol edip doğru numarayla tekrar deneyin.'
  },
  {
    icon: 'content_copy',
    title: 'Aynı belge ikinci kez tarandı',
    text: 'Birebir aynı dosya listeye ikinci kez eklenmez; yeni bir kayıt açılmaz.'
  },
  {
    icon: 'inventory_2',
    title: 'Uzun süre bağlanmayan belge',
    text: 'Yönetici ayarı açıksa belirlenen süre (varsayılan 30 gün) sonunda listeden kaldırılıp arşive alınır; silinmez.'
  }
];

/**
 * Tarama Klasörleri → "Nasıl çalışır?" ve "Klasör Akışı" sekmeleri; hangisinin gösterileceğini view seçer,
 * iki sekme aynı görsel dili (sfg-*) paylaşır.
 * - Nasıl çalışır?: taranan belgenin evraka bağlanıp Atlas'a aktarılmasına kadarki akışı son kullanıcının
 *   anlayacağı dille ve simgelerle anlatır. Aşama adları ve simgeleri Dijitalleştirme Takip ekranıyla aynıdır.
 * - Klasör Akışı: tarama paylaşımındaki klasörlerin şeması; yollar ve dosya sayıları ekranın aldığı klasör
 *   listesinden gelir (klasör adları ortama göre değişir).
 * Kaynak: backend docs/taranan-belge-sistemi.md ve ScannedDocumentApi'nin ScanStorage ayarı.
 */
@Component({
  selector: 'app-scan-flow-guide',
  imports: [NgTemplateOutlet],
  templateUrl: './scan-flow-guide.html',
  styleUrl: './scan-flow-guide.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScanFlowGuide {
  /** Önceden çekme tur aralığı (sn); durum alınamadıysa backend varsayılanı */
  /** guide: "Nasıl çalışır?" anlatımı; folders: "Klasör Akışı" sekmesindeki tarama klasörleri şeması */
  readonly view = input<'guide' | 'folders'>('guide');
  readonly intervalSeconds = input(15);
  /** Tarama Klasörleri ekranının aldığı klasörler; yollar ortama göre değiştiği için buradan gösterilir */
  readonly folders = input<ScanFolder[]>([]);
  /** Evrak takibe çekilmiş, kaydı bekleyen belge sayısı */
  readonly pulledCount = input<number | null>(null);

  /** Klasör akışı: durum başına yollar ve dosya sayıları; klasörler alınamadıysa sayı yok */
  readonly folderNodes = computed(() => {
    const nodes = {} as Record<ScanFolderState, FolderNode>;
    for (const state of ['Inbox', 'Okunan', 'Processed', 'Failed'] as ScanFolderState[]) {
      nodes[state] = { paths: [], count: null };
    }
    // Klasörler okunamadıysa (tarama servisine ulaşılamıyor) yollar ayardaki varsayılan adlarla gösterilir
    const folders = this.folders().length ? this.folders() : DEFAULT_FOLDERS;
    for (const folder of folders) {
      const node = nodes[folder.state];
      if (!node) continue;
      // Paylaşım yolları büyük/küçük harf duyarsız; tutarlı görünsün diye küçük harf. toLocaleLowerCase('tr')
      // kullanılmaz: "I" → "ı" olur ve yol yanlış görünür.
      node.paths.push({ source: scanSourceLabel(folder.source), path: folder.folder.toLowerCase(), original: folder.folder });
      if (folders !== DEFAULT_FOLDERS) node.count = (node.count ?? 0) + folder.files.length;
    }
    return nodes;
  });
  /** Yollar gerçek değil, varsayılan adlar mı; şemada soluk gösterilir ve not düşülür */
  readonly defaultPaths = computed(() => !this.folders().length);

  readonly statuses = STATUSES;
  readonly cases = CASES;

  readonly steps = computed<FlowStep[]>(() => {
    const interval = this.intervalSeconds();
    return [
      {
        icon: 'scanner', title: 'Belge tarandı', actor: 'auto', actorLabel: 'Tarayıcı',
        text: 'Belge, üzerindeki evrak numarası etiketiyle birlikte taranır.',
        where: 'Gelen Kutusu'
      },
      {
        icon: 'qr_code_scanner', title: 'QR kod okundu', actor: 'auto', actorLabel: 'Tarama sistemi',
        text: 'Etiketteki evrak numarası okunur ve belge havuza alınır. Okunamazsa belge yine havuza gelir.',
        where: 'Havuz',
        next: `Kendiliğinden · ${interval} sn'de bir`
      },
      {
        icon: 'move_to_inbox', title: 'Evrak takibe aktarıldı', actor: 'user', actorLabel: 'Siz',
        text: 'Taranmış Evraklar\'dan belgeyi seçin ya da Evrak Kayıt\'ta QR okutun. Belge numaradaki evraka bağlanır; numarada evrak yoksa yeni gelen evrak açılır. Evrak kimseye zimmetli değilse size zimmetlenir.',
        where: 'Çekilenler (kaydı bekleyen)'
      },
      {
        icon: 'save', title: 'Kaydedildi', actor: 'user', actorLabel: 'Siz',
        text: 'Evrakın bilgilerini tamamlayıp kaydedin.'
      },
      {
        icon: 'publish', title: 'Yayınlandı – aktarımda', actor: 'user', actorLabel: 'Siz',
        text: 'Yayınla dediğinizde evrak Atlas\'a gönderilmek üzere sıraya girer. Taranmış belge üst yazı olarak kullanılır.',
        next: 'Otomatik'
      },
      {
        icon: 'cloud_done', title: 'Atlas\'a aktarıldı', actor: 'auto', actorLabel: 'Otomatik',
        text: 'Evrak paketi hazırlanıp Atlas\'a gönderilir; akış tamamlanır.'
      }
    ];
  });
}
