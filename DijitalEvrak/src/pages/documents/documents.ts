import { ChangeDetectionStrategy, Component, computed, signal, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';

interface DocGuide {
  title: string;
  description: string;
  icon: string;
  url: string;
  category: string;
}

interface DocCategory {
  name: string;
  icon: string;
}

interface DocGroup extends DocCategory {
  guides: DocGuide[];
}

@Component({
  imports: [
    GenericModel,
    RouterLink,
    FormsModule
  ],
  templateUrl: './documents.html',
  // Kart iskeleti (st-*) Ayarlar, üst kart / arama / bağlantı kartçıkları (sp-*)
  // Destek sayfasıyla ortak; dc-* sınıfları bu ekrana özgü
  styleUrls: ['../settings/settings.css', '../support/support.css', './documents.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Documents {
  readonly search = signal<string>('');
  readonly activeCategory = signal<string | null>(null);

  readonly categories: DocCategory[] = [
    { name: 'Gelen Evrak', icon: 'move_to_inbox' },
    { name: 'Giden Evrak', icon: 'outbox' },
    { name: 'Kullanıcılar', icon: 'group' }
  ];

  readonly guides: DocGuide[] = [
    {
      title: 'Ön Kayıt',
      description: 'Gelen evrak için ön kayıt oluşturarak süreci başlatın.',
      icon: 'app_registration',
      url: '/onkayit',
      category: 'Gelen Evrak'
    },
    {
      title: 'Ön Kayıtlar',
      description: 'Ön kaydı yapılmış, evrak kaydı bekleyen gelen evrakları listeleyin ve işleme alın.',
      icon: 'pending_actions',
      url: '/onkayitlar',
      category: 'Gelen Evrak'
    },
    {
      title: 'Evrak Kayıt',
      description: 'QR kodu okutarak ya da manuel giriş ile yeni bir evrakı sisteme kaydedin.',
      icon: 'qr_code',
      url: '/qrokut',
      category: 'Gelen Evrak'
    },
    {
      title: 'Gelen Evraklar',
      description: 'Kayıt altına alınmış gelen evrakları listeleyin ve inceleyin.',
      icon: 'add_notes',
      url: '/scanlist',
      category: 'Gelen Evrak'
    },
    {
      title: 'Zimmet',
      description: 'Evrakları ilgili personele zimmetleyin.',
      icon: 'contract_edit',
      url: '/zimmet',
      category: 'Gelen Evrak'
    },
    {
      title: 'Zimmetlerim',
      description: 'Üzerinize zimmetli evrakları görüntüleyin ve teslim edin.',
      icon: 'assignment_ind',
      url: '/zimmetlerim',
      category: 'Gelen Evrak'
    },
    {
      title: 'Evrak Eşleştirme',
      description: 'Taranan QR kodlarını ilgili evrak kaydıyla eşleştirin.',
      icon: 'folder_match',
      url: '/scanneddocument',
      category: 'Gelen Evrak'
    },
    {
      title: 'Havale (AI)',
      description: 'Yapay zeka destekli önerilerle evrakı ilgili birime havale edin.',
      icon: 'neurology',
      url: '/havale',
      category: 'Gelen Evrak'
    },
    {
      title: 'OCR Takip',
      description: 'Evrakların OCR (metin tanıma) işlem durumunu takip edin.',
      icon: 'document_scanner',
      url: '/ocrtakip',
      category: 'Gelen Evrak'
    },
    {
      title: 'Dijitalleştirme Takip',
      description: 'Tarama, OCR, kayıt ve Atlas EBYS aktarım sürecini uçtan uca izleyin.',
      icon: 'cloud_sync',
      url: '/dijitallestirme-takip',
      category: 'Gelen Evrak'
    },
    {
      title: 'Giden Evraklar',
      description: 'Kurum dışına gönderilecek evrakları oluşturun ve yönetin.',
      icon: 'local_post_office',
      url: '/gidenevrak/outgoing',
      category: 'Giden Evrak'
    },
    {
      title: 'Zarflar',
      description: 'Giden evrakları zarflara ekleyip gönderime hazırlayın.',
      icon: 'stacked_email',
      url: '/envelope',
      category: 'Giden Evrak'
    },
    {
      title: 'Etiket Oluştur',
      description: 'Zarflar için gönderim etiketi oluşturup yazdırın.',
      icon: 'book',
      url: '/ticket',
      category: 'Giden Evrak'
    },
    {
      title: 'Kullanıcılar',
      description: 'Sistem kullanıcılarını görüntüleyin ve yönetin.',
      icon: 'diversity_3',
      url: '/users',
      category: 'Kullanıcılar'
    },
    {
      title: 'Dış Kurum Kullanıcıları',
      description: 'Dış kurumlara ait kullanıcı hesaplarını yönetin.',
      icon: 'contact_emergency',
      url: '/externaluser',
      category: 'Kullanıcılar'
    },
    {
      title: 'Yetkilerim',
      description: 'Hesabınıza tanımlı rol ve yetkileri görüntüleyin.',
      icon: 'account_circle',
      url: '/users/profile',
      category: 'Kullanıcılar'
    }
  ];

  readonly filteredGuides = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('tr');
    const category = this.activeCategory();

    return this.guides.filter(guide => {
      const matchesCategory = !category || guide.category === category;
      const matchesTerm = !term ||
        guide.title.toLocaleLowerCase('tr').includes(term) ||
        guide.description.toLocaleLowerCase('tr').includes(term);

      return matchesCategory && matchesTerm;
    });
  });

  // Filtrelenmiş modüller kategori sırasına göre gruplanır; boş kategoriler listelenmez
  readonly groupedGuides = computed<DocGroup[]>(() => {
    const guides = this.filteredGuides();

    return this.categories
      .map(category => ({ ...category, guides: guides.filter(g => g.category === category.name) }))
      .filter(group => group.guides.length > 0);
  });

  readonly isFiltering = computed(() => !!this.search().trim() || this.activeCategory() !== null);

  categoryCount(category: string): number {
    return this.guides.filter(g => g.category === category).length;
  }

  toggleCategory(category: string) {
    this.activeCategory.set(this.activeCategory() === category ? null : category);
  }

  clearFilters() {
    this.search.set('');
    this.activeCategory.set(null);
  }
}
