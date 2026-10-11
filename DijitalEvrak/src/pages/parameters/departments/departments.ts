import { ChangeDetectionStrategy, Component, computed, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../../components/generic-model/generic-model';
import { httpResource } from '@angular/common/http';
import { compareDepartments, DepartmentModel, DepartmentType, MINISTER_DEPARTMENT_ID } from '../../../services/department';
import { DepartmentId } from '../../../models/ids';
import { downloadCsv } from '../../reports/report-csv';

const TYPE_LABELS: Record<number, string> = {
  [DepartmentType.Merkez]: 'Merkez',
  [DepartmentType.Buyukelcilik]: 'Büyükelçilik',
  [DepartmentType.Baskonsolosluk]: 'Başkonsolosluk',
  [DepartmentType.DaimiTemsilcilik]: 'Daimi Temsilcilik',
  [DepartmentType.TicaretOfisi]: 'Ticaret Ofisi',
  [DepartmentType.FahriKonsolosluk]: 'Fahri Konsolosluk',
};

const SEARCH_DEBOUNCE_MS = 250;
const lower = (s: string | null | undefined) => (s ?? '').toLocaleLowerCase('tr');
// Makam sırası (level, sortOrder, ad); ad sırası değil
const byRank = (a: TreeNode, b: TreeNode) => compareDepartments(a.dept, b.dept);

interface TreeNode {
  dept: DepartmentModel;
  children: TreeNode[];
  /** Tüm alt birimlerin sayısı (torunlar dahil) */
  descendantCount: number;
  /** Arama için ad + kısa ad, küçük harf */
  haystack: string;
}

/** Ekranda çizilen satır: yalnızca açık dalların birimleri */
interface TreeRow {
  node: TreeNode;
  level: number;
  expanded: boolean;
  match: boolean;
}

/**
 * Birimler kaynak sistemden (ComDepartment) gelir; bu sayfa yalnızca listeler. parentId ile ağaç kurulur:
 * parentId boş olanlar köktür, dolu olanların üst birimi her zaman aynı listededir (backend kopuk / silinmiş üst
 * birimi en yakın geçerli üste bağlar ya da kökü yapar). Tepede "Bakan" birimi vardır (Bakan Yardımcılıkları, makam
 * birimleri ve altlarındaki GM'ler); üst birimi kaynakta eksik bazı birimler ve eski / dış kayıtlar onun yanında ayrı
 * köktür. Varsayılan liste merkez birimlerdir; temsilcilikler eklenince çoğu kök olur. Her seviye makam sırasıyla dizilir.
 */
@Component({
  imports: [GenericModel],
  templateUrl: './departments.html',
  styleUrls: ['../../settings/settings.css', '../../zimmetlerim/zimmetlerim.css', './departments.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Departments {
  readonly includeMissions = signal(false);
  readonly result = httpResource<DepartmentModel[]>(
    () => `api/Departments/GetAll${this.includeMissions() ? '?includeMissions=true' : ''}`);
  readonly loading = computed(() => this.result.isLoading());

  readonly search = signal('');
  readonly #term = signal('');
  #searchTimer?: ReturnType<typeof setTimeout>;

  /** Açık düğümler (aramada eşleşmelere giden yol ayrıca otomatik açılır); ilk açılışta Bakan altı görünür */
  readonly expanded = signal(new Set<DepartmentId>([MINISTER_DEPARTMENT_ID]));
  /** Aramada otomatik açılan yoldan kullanıcının kapattıkları; arama değişince sıfırlanır */
  readonly #collapsedInSearch = signal(new Set<DepartmentId>());

  // ---- Ağaç ----
  readonly tree = computed(() => {
    const list = this.result.value() ?? [];
    const nodes = new Map<DepartmentId, TreeNode>();
    for (const dept of list) {
      nodes.set(dept.id, { dept, children: [], descendantCount: 0, haystack: lower(`${dept.name} ${dept.shortName ?? ''}`) });
    }

    const roots: TreeNode[] = [];
    for (const node of nodes.values()) {
      const parentId = node.dept.parentId;
      const parent = parentId !== null && parentId !== undefined && parentId !== node.dept.id ? nodes.get(parentId) : undefined;
      // Üst birimi listede olmayan (ör. temsilcilikler kapalıyken) birim köke alınır
      (parent ? parent.children : roots).push(node);
    }

    // Sıralama ve alt birim sayıları; döngüye karşı ziyaret edilenler tutulur (veri doğruysa döngü olmaz)
    const visited = new Set<TreeNode>();
    const finish = (node: TreeNode): number => {
      if (visited.has(node)) return 0;
      visited.add(node);
      node.children.sort(byRank);
      node.descendantCount = node.children.reduce((sum, c) => sum + 1 + finish(c), 0);
      return node.descendantCount;
    };
    roots.sort(byRank);
    roots.forEach(finish);
    // Döngü yüzünden köke hiç bağlanamayan birimler kaybolmasın
    for (const node of nodes.values()) if (!visited.has(node)) { roots.push(node); finish(node); }

    return { roots, nodes, total: nodes.size };
  });

  /** Aramaya uyan birimler ve onları gösterebilmek için açılması gereken üst birimler */
  readonly searchState = computed(() => {
    const term = lower(this.#term().trim());
    if (!term) return null;
    const matches = new Set<TreeNode>();
    const open = new Set<TreeNode>();
    const visit = (node: TreeNode): boolean => {
      let below = false;
      for (const child of node.children) if (visit(child)) below = true;
      const self = node.haystack.includes(term);
      if (self) matches.add(node);
      if (below) open.add(node);
      return self || below;
    };
    this.tree().roots.forEach(visit);
    return { matches, open };
  });

  readonly rows = computed<TreeRow[]>(() => {
    const expanded = this.expanded();
    const collapsed = this.#collapsedInSearch();
    const search = this.searchState();
    const rows: TreeRow[] = [];
    // filtered: aramada yalnızca eşleşenler ve onlara giden yol gösterilir; eşleşen bir birim elle açılırsa
    // altındaki tüm birimler (aramaya uymasalar da) görünür
    const walk = (nodes: TreeNode[], level: number, filtered: boolean) => {
      for (const node of nodes) {
        const match = !!search?.matches.has(node);
        if (filtered && !match && !search!.open.has(node)) continue;
        const pathOpen = filtered && search!.open.has(node) && !collapsed.has(node.dept.id);
        const userOpen = expanded.has(node.dept.id);
        const isOpen = pathOpen || userOpen;
        rows.push({ node, level, expanded: isOpen && node.children.length > 0, match });
        if (isOpen) walk(node.children, level + 1, filtered && !(match && userOpen));
      }
    };
    walk(this.tree().roots, 1, !!search);
    return rows;
  });

  readonly matchCount = computed(() => this.searchState()?.matches.size ?? null);
  readonly allExpanded = computed(() => {
    const withChildren = [...this.tree().nodes.values()].filter(n => n.children.length);
    return withChildren.length > 0 && withChildren.every(n => this.expanded().has(n.dept.id));
  });

  typeLabel(dept: DepartmentModel): string | null {
    return dept.type != null && dept.type !== DepartmentType.Merkez ? TYPE_LABELS[dept.type] ?? null : null;
  }

  toggle(row: TreeRow): void {
    if (!row.node.children.length) return;
    const id = row.node.dept.id;
    const searching = !!this.searchState();
    this.expanded.update(set => {
      const next = new Set(set);
      if (row.expanded) next.delete(id); else next.add(id);
      return next;
    });
    if (searching) {
      this.#collapsedInSearch.update(set => {
        const next = new Set(set);
        if (row.expanded) next.add(id); else next.delete(id);
        return next;
      });
    }
  }

  toggleAll(): void {
    this.expanded.set(this.allExpanded()
      ? new Set()
      : new Set([...this.tree().nodes.values()].filter(n => n.children.length).map(n => n.dept.id)));
  }

  setIncludeMissions(value: boolean): void {
    this.includeMissions.set(value);
  }

  onSearch(value: string): void {
    this.search.set(value);
    clearTimeout(this.#searchTimer);
    this.#searchTimer = setTimeout(() => {
      this.#term.set(value);
      this.#collapsedInSearch.set(new Set());
    }, SEARCH_DEBOUNCE_MS);
  }

  clearSearch(): void {
    clearTimeout(this.#searchTimer);
    this.search.set('');
    this.#term.set('');
    this.#collapsedInSearch.set(new Set());
  }

  /** Ok tuşlarıyla açma / kapama (ağaç gezinme deseni) */
  onKeydown(event: KeyboardEvent, row: TreeRow): void {
    if (event.key === 'ArrowRight' && !row.expanded && row.node.children.length) {
      event.preventDefault();
      this.toggle(row);
    } else if (event.key === 'ArrowLeft' && row.expanded) {
      event.preventDefault();
      this.toggle(row);
    }
  }

  /** Tüm ağaç, hiyerarşi yoluyla birlikte (Excel) */
  exportCsv(): void {
    const rows: unknown[][] = [];
    const walk = (nodes: TreeNode[], path: string[]) => {
      for (const node of nodes) {
        const d = node.dept;
        rows.push([d.name, d.shortName ?? '', TYPE_LABELS[d.type ?? -1] ?? '', path.at(-1) ?? '', [...path, d.name].join(' / '), path.length + 1]);
        walk(node.children, [...path, d.name]);
      }
    };
    walk(this.tree().roots, []);
    downloadCsv(`Birimler${this.includeMissions() ? ' (temsilcilikler dahil)' : ''}.csv`,
      ['Birim', 'Kısa Ad', 'Tür', 'Üst Birim', 'Yol', 'Seviye'], rows);
  }
}
