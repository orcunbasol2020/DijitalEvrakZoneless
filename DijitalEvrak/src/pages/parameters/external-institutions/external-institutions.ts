import { ChangeDetectionStrategy, Component, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { httpResource } from '@angular/common/http';
import {
  EXTERNAL_INSTITUTION_TYPE_LABELS,
  ExternalInstitution,
  ExternalInstitutionModel,
  ExternalInstitutionType,
  INSTITUTION_MIN_SEARCH
} from '../../../services/external-institution';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FlexiGridModule } from 'flexi-grid';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

const SEARCH_DEBOUNCE_MS = 300;
/** Kurum (DETSİS) aramasında getirilecek en fazla kayıt (sunucu sınırı 200) */
const SEARCH_TAKE = 200;

/**
 * Dış kurumlar ve yabancı misyonlar kaynak sistemden (ComAgency) gelir; bu sayfa yalnızca arar ve listeler.
 * Misyon, dilekçe ve uluslararası kuruluş listeleri küçüktür, tamamı gelir; ~160.000 DETSİS kurumu aramayla.
 */
@Component({
  imports: [
    GenericModel,
    FlexiGridModule,
    FormsModule,
    CommonModule
  ],
  templateUrl: './external-institutions.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ExternalInstitutions {
  readonly #institutionService = inject(ExternalInstitution);

  readonly typeLabels = EXTERNAL_INSTITUTION_TYPE_LABELS;
  readonly types = [
    ExternalInstitutionType.Misyon,
    ExternalInstitutionType.Kurum,
    ExternalInstitutionType.UluslararasiKurulus,
    ExternalInstitutionType.Dilekce,
  ];
  readonly minSearch = INSTITUTION_MIN_SEARCH;

  readonly type = signal<ExternalInstitutionType>(ExternalInstitutionType.Misyon);
  readonly search = signal('');
  readonly #searchTerm = signal('');
  #searchTimer?: ReturnType<typeof setTimeout>;

  /** DETSİS kurumları yalnızca aramayla listelenir */
  readonly needsSearch = computed(() =>
    this.type() === ExternalInstitutionType.Kurum && this.#searchTerm().length < INSTITUTION_MIN_SEARCH);

  readonly result = httpResource<ExternalInstitutionModel[]>(() => {
    if (this.needsSearch()) return undefined;
    const term = this.#searchTerm();
    return this.#institutionService.listUrl({
      type: this.type(),
      search: term.length >= INSTITUTION_MIN_SEARCH ? term : null,
      take: this.type() === ExternalInstitutionType.Kurum ? SEARCH_TAKE : null,
    });
  });
  readonly data = computed(() => this.needsSearch() ? [] : (this.result.value() ?? []).filter(i => !i.isDeleted));
  readonly loading = computed(() => this.result.isLoading());
  /** Kurum aramasında sunucu sınırına ulaşıldıysa aramanın daraltılması önerilir */
  readonly truncated = computed(() => this.type() === ExternalInstitutionType.Kurum && this.data().length >= SEARCH_TAKE);

  showFilters = false;

  setType(type: ExternalInstitutionType): void {
    this.type.set(type);
  }

  onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.#searchTimer);
    this.#searchTimer = setTimeout(() => this.#searchTerm.set(value.trim()), SEARCH_DEBOUNCE_MS);
  }
}
