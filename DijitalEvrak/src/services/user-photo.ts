import { inject, Injectable, signal, Signal, WritableSignal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { map, Observable, tap } from 'rxjs';
import { HttpService } from './http';
import { Common } from './common';
import { patchStoredUser } from './login-session';
import { SKIP_ERROR_TOAST } from '../interceptors/error-interceptor';
import { MessageResponse } from '../models/allocationrequest.model';
import { UserModel } from '../pages/users/users';

export interface UserPhotoResult {
  saved: boolean;
  /** Yeni resmin sürümü; kaldırıldıysa null */
  version: string | null;
}

/** Resmi gösterilecek kullanıcı: id ve photoVersion yeterli; userName eski statik resimler için */
export type UserPhotoOwner = Pick<UserModel, 'id' | 'photoVersion'> & Partial<Pick<UserModel, 'userName'>>;

// Profil resmi henüz yüklenmemiş kişilerin eski statik resimleri (kullanıcı adıyla). Yönetici bu resimleri
// Kullanıcılar sayfasından yükleyince bu eşleme ve assets/images/personel/ klasörü silinecek.
const LEGACY_PHOTOS: Record<string, string> = {
  'barslan': 'assets/images/personel/bulent.jpg',
  'tahsin.kuzu': 'assets/images/personel/tahsin.jpg',
  'oral.akcakoyun': 'assets/images/personel/oral.jpg',
  'gokce.gurkas': 'assets/images/personel/gokce.jpg',
  'gizem.ergor': 'assets/images/personel/gizem.jpg',
};

const quiet = () => new HttpContext().set(SKIP_ERROR_TOAST, true);

interface CachedPhoto {
  version: string;
  url: WritableSignal<string | null>;
}

/**
 * Profil resimleri (api/Users/GetPhoto). Uç nokta JWT istediği için resim <img src>'ye adresle verilemez:
 * HttpClient ile blob olarak çekilip (token interceptor'dan geçer) object URL ile gösterilir. Aynı kullanıcı
 * ve sürüm için tek istek atılır; sürüm değişince eski object URL serbest bırakılır. ?v= adresi sürümle
 * değiştiği için tarayıcı önbelleği de kendiliğinden yenilenir.
 */
@Injectable({ providedIn: 'root' })
export class UserPhotoService {
  readonly #http = inject(HttpClient);
  readonly #httpService = inject(HttpService);
  readonly #common = inject(Common);
  readonly #baseUrl = 'api/Users/';

  readonly #cache = new Map<string, CachedPhoto>();
  /** Bu oturumda yüklenen / kaldırılan resimler; listelerden gelen (eski) photoVersion'ın yerine geçer */
  readonly #overrides = signal<Record<string, string | null>>({});

  /** Kullanıcının güncel sürümü: bu oturumda değiştiyse o, değilse sunucudan gelen */
  versionOf(user: UserPhotoOwner | null | undefined): string | null {
    if (!user?.id) return null;
    const overrides = this.#overrides();
    return user.id in overrides ? overrides[user.id] : user.photoVersion ?? null;
  }

  /**
   * Gösterilecek resim adresi; resim yoksa ya da henüz / hiç yüklenemediyse null (çağıran baş harfleri gösterir).
   * Signal okuduğu için computed / şablon içinde çağrılmalı.
   */
  photoUrl(user: UserPhotoOwner | null | undefined): string | null {
    if (!user?.id) return null;
    const version = this.versionOf(user);
    if (!version) {
      return this.#hasOverride(user.id) ? null : LEGACY_PHOTOS[(user.userName ?? '').toLocaleLowerCase('tr')] ?? null;
    }
    return this.#load(user.id, version)();
  }

  /** Resmi ekler ya da değiştirir. self: kendi resmi (userId gönderilmez, token'daki kullanıcı) */
  upload(userId: string, photo: Blob, self: boolean): Observable<MessageResponse<UserPhotoResult>> {
    const form = new FormData();
    form.append('file', photo, 'photo.jpg');
    if (!self) form.append('userId', userId);
    return this.#httpService
      .post<MessageResponse<UserPhotoResult>>(`${this.#baseUrl}UploadPhoto`, form, { context: quiet() })
      .pipe(tap(res => {
        if (res.data?.saved) this.#setVersion(userId, res.data.version);
      }));
  }

  /** Resmi kaldırır. 404 (zaten yok) da kaldırılmış sayılır. */
  delete(userId: string): Observable<void> {
    return this.#http
      .delete<MessageResponse<UserPhotoResult>>(`${this.#baseUrl}DeletePhoto/${encodeURIComponent(userId)}`, { context: quiet() })
      .pipe(map(() => undefined), tap(() => this.#setVersion(userId, null)));
  }

  /** 404 sonrası kaldırılmış sayılması için (çağıran hata durumunda kullanır) */
  markDeleted(userId: string): void {
    this.#setVersion(userId, null);
  }

  #hasOverride(userId: string): boolean {
    return userId in this.#overrides();
  }

  #setVersion(userId: string, version: string | null): void {
    this.#overrides.update(o => ({ ...o, [userId]: version }));

    // Kendi resmi: üst bar ve oturumdaki kullanıcı da güncellenir (yeniden girişe kadar korunur)
    const me = this.#common.user();
    if (me?.id === userId) {
      this.#common.user.set({ ...me, photoVersion: version });
      patchStoredUser({ photoVersion: version });
    }
  }

  #load(userId: string, version: string): Signal<string | null> {
    const cached = this.#cache.get(userId);
    if (cached?.version === version) return cached.url;

    // Sürüm değişti: eski resim serbest bırakılır
    const old = cached?.url();
    if (old) URL.revokeObjectURL(old);

    const url = signal<string | null>(null);
    this.#cache.set(userId, { version, url });
    this.#http
      .get(`${this.#baseUrl}GetPhoto/${encodeURIComponent(userId)}?v=${encodeURIComponent(version)}`,
        { responseType: 'blob', context: quiet() })
      .subscribe({
        next: blob => {
          // Bu arada yeni sürüm istendiyse geç gelen eski cevap kullanılmaz
          if (this.#cache.get(userId)?.url === url) url.set(URL.createObjectURL(blob));
        },
        // 404 / ağ hatası: baş harfler gösterilir; aynı sürüm bu oturumda yeniden denenmez
        error: () => {},
      });
    return url;
  }
}
