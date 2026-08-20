import { inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { BehaviorSubject, catchError, debounceTime, distinctUntilChanged, map, Observable, of, switchMap, tap } from 'rxjs';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { LayoutService } from 'src/app/core/services/layout.service';

// Interfaz que deben cumplir tus servicios (ZonasService, SectoresService, etc.)
export interface ICrudService<T> {
  findAll(page: number, limit: number, search: string): Observable<any>;
  create(data: any): Observable<any>;
  update(id: number, data: any): Observable<any>;
  delete(id: number): Observable<any>;
}

export interface CrudConfig {
  initialPage?: number;
  initialLimit?: number;
  itemName?: string; // Ej: "Zona", "Cliente" (Para los mensajes de alerta)
}

export function useCrud<T>(
  service: ICrudService<T>,
  config: CrudConfig = { initialPage: 1, initialLimit: 10, itemName: 'Registro' }
) {
  // --- INYECCIONES ---
  const alert = inject(AlertService);
  const layout = inject(LayoutService);
  const modalService = inject(NgbModal);
  const destroyRef = inject(DestroyRef);

  // --- ESTADOS (SIGNALS) ---
  const page = signal(config.initialPage || 1);
  const pageSize = signal(config.initialLimit || 10);
  const tableLoading = signal(false);
  const editingId = signal<number | null>(null); 
  const searchControl = new FormControl('');

  // Trigger reactivo
  const params$ = new BehaviorSubject({ 
    page: page(), 
    limit: pageSize(), 
    search: '' 
  });

  // --- BÚSQUEDA AUTOMÁTICA ---
  searchControl.valueChanges.pipe(
    debounceTime(400),
    distinctUntilChanged(),
    takeUntilDestroyed(destroyRef)
  ).subscribe(val => {
    page.set(1);
    refresh();
  });

  // --- TABLA REACTIVA (GOLD STANDARD) ---
  const resource = toSignal(
    params$.pipe(
      tap(() => tableLoading.set(true)),
      switchMap(params => 
        service.findAll(params.page, params.limit, params.search).pipe(
          map((res: any) => {
            // Lógica de desempaquetado universal para tu Backend
            let list = [];
            let meta = { total: 0, page: params.page, limit: params.limit };

            if (res.data?.data && Array.isArray(res.data.data)) {
              list = res.data.data;
              if (res.data.meta) meta = res.data.meta;
            } else if (res.data && Array.isArray(res.data)) {
              list = res.data;
              if (res.meta) meta = res.meta;
            } else if (Array.isArray(res)) {
              list = res;
            }
            
            meta.total = Number(meta.total) || 0;
            if(list.length > 0 && meta.total === 0) meta.total = list.length;

            return { data: list as T[], meta };
          }),
          tap(() => tableLoading.set(false)),
          catchError((err) => {
            console.error(err);
            tableLoading.set(false);
            return of({ data: [] as T[], meta: { total: 0, page: 1, limit: 10 } });
          })
        )
      )
    ),
    { initialValue: { data: [] as T[], meta: { total: 0, page: 1, limit: 10 } } }
  );

  // --- ACCIONES ---

  function cambiarPagina(newPage: number) {
    page.set(newPage);
    refresh();
  }

  function refresh() {
    params$.next({ 
      page: page(), 
      limit: pageSize(), 
      search: searchControl.value || '' 
    });
  }

  function setupModal(id: number | null = null) {
    editingId.set(id);
  }

  function openModal(content: any, options: any = { centered: true, backdrop: 'static' }): NgbModalRef {
    return modalService.open(content, options);
  }

  function closeModal() {
    modalService.dismissAll();
  }

  function save(payload: any, onSuccess?: () => void) {
    layout.showLoader();
    tableLoading.set(true);

    const req$ = editingId()
      ? service.update(editingId()!, payload)
      : service.create(payload);

    req$.pipe(takeUntilDestroyed(destroyRef)).subscribe({
      next: () => {
        layout.hideLoader();
        tableLoading.set(false);
        closeModal();
        alert.success(`${config.itemName || 'Registro'} guardado correctamente`);
        onSuccess?.();

        if (!editingId()) {
            page.set(1);
            if (searchControl.value) searchControl.setValue('', { emitEvent: false });
        }
        refresh();
      },
      error: (err: any) => {
        layout.hideLoader();
        tableLoading.set(false);
        const msg = err.error?.mensaje || err.error?.message || 'Error al procesar';
        if (err.status === 409) {
             alert.error(msg);
             if (msg.toLowerCase().includes('modificado')) { refresh(); closeModal(); }
        } else {
             alert.error(Array.isArray(msg) ? msg[0] : msg);
        }
      }
    });
  }

  function deleteItem(id: number, title: string = '¿Eliminar?', text: string = 'Se perderá el registro.') {
    alert.confirmDelete(title, text).then(ok => {
      if (ok) {
        layout.showLoader();
        tableLoading.set(true);
        service.delete(id).pipe(takeUntilDestroyed(destroyRef)).subscribe({
          next: () => {
            layout.hideLoader();
            tableLoading.set(false);
            alert.success('Eliminado correctamente');
            refresh();
          },
          error: (err: any) => {
            layout.hideLoader();
            tableLoading.set(false);
            const msg = err.error?.mensaje || err.error?.message || 'Error al eliminar';
            // Mensaje amigable para FKs
            if (err.status === 409 || err.status === 400) {
                 alert.error('No se puede eliminar: Tiene registros asociados.');
            } else {
                 alert.error(msg);
            }
          }
        });
      }
    });
  }

  return {
    resource,
    page,
    pageSize,
    tableLoading,
    searchControl,
    editingId,
    cambiarPagina,
    refresh,
    setupModal,
    openModal,
    closeModal,
    save,
    deleteItem
  };
}