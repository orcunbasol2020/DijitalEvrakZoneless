import { ChangeDetectionStrategy, Component, computed, signal, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import GenericModel from '../../../components/generic-model/generic-model';

interface FaqItem {
  question: string;
  answer: string;
  icon: string;
}

interface QuickLink {
  title: string;
  url: string;
  icon: string;
}

@Component({
  imports: [
    GenericModel,
    RouterLink,
    FormsModule
  ],
  templateUrl: './support.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Support {
  readonly search = signal<string>('');

  readonly faqs: FaqItem[] = [
    {
      question: 'Bir evrakı nasıl kaydederim?',
      answer: 'Evrak Kayıt ekranından QR kodu okutarak ya da evrak numarasını manuel girerek kayıt işlemini başlatabilirsiniz.',
      icon: 'qr_code'
    },
    {
      question: 'Zimmetimdeki bir evrakı nasıl teslim ederim?',
      answer: 'Zimmetlerim ekranından ilgili evrakı seçip teslim işlemini onaylamanız yeterlidir.',
      icon: 'assignment_turned_in'
    },
    {
      question: 'Şifremi unuttum, ne yapmalıyım?',
      answer: 'Şifre sıfırlama işlemi için biriminizin sistem yöneticisiyle iletişime geçmeniz gerekmektedir.',
      icon: 'lock_reset'
    },
    {
      question: 'Uygulamanın görünümünü (açık/koyu tema) nasıl değiştiririm?',
      answer: 'Sağ üstteki kullanıcı menüsünden Ayarlar sayfasına gidip Görünüm bölümünden tema seçimi yapabilirsiniz.',
      icon: 'palette'
    },
    {
      question: 'OCR Takip ekranı ne işe yarar?',
      answer: 'Taranan evrakların OCR (metin tanıma) işlem durumunu takip etmenizi sağlar.',
      icon: 'document_scanner'
    }
  ];

  readonly filteredFaqs = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('tr');

    if (!term) {
      return this.faqs;
    }

    return this.faqs.filter(faq =>
      faq.question.toLocaleLowerCase('tr').includes(term) ||
      faq.answer.toLocaleLowerCase('tr').includes(term)
    );
  });

  readonly quickLinks: QuickLink[] = [
    { title: 'Ayarlar', url: '/settings', icon: 'settings' },
    { title: 'Kontrol Paneli', url: '/', icon: 'dashboard' },
    { title: 'Zimmetlerim', url: '/zimmetlerim', icon: 'assignment_ind' },
    { title: 'Yetkilerim', url: '/users/profile', icon: 'account_circle' }
  ];
}
