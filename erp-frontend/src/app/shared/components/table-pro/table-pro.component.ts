import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-table-pro',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbPaginationModule],
  templateUrl: './table-pro.component.html',
  styleUrls: ['./table-pro.component.scss']
})
export class TableProComponent {
  // Entradas de Configuración
  @Input() titulo: string = 'Listado';
  @Input() subtitulo: string = '';
  @Input() loading: boolean = false;
  @Input() data: any[] = [];
  @Input() meta: { total: number; page: number; limit: number } = { total: 0, page: 1, limit: 10 };
  
  // Opciones del Buscador y Botones
  @Input() btnText: string = 'NUEVO';
  @Input() searchPlaceholder: string = 'Buscar...';
  @Input() showAddBtn: boolean = true;
  @Input() hideSearch: boolean = false;

  // Eventos de Salida
  @Output() search = new EventEmitter<string>();
  @Output() pageChange = new EventEmitter<number>();
  @Output() add = new EventEmitter<void>();

  searchControl = new FormControl('');

  constructor() {
    this.searchControl.valueChanges.pipe(
      debounceTime(400), 
      distinctUntilChanged(),
      takeUntilDestroyed()
    ).subscribe(val => {
      this.search.emit(val || '');
    });
  }

  clearSearch() {
    this.searchControl.setValue('');
  }

  // 🔥 MAGIA AQUÍ: Quita el foco del botón antes de avisar al padre
  onAddClick(event: Event) {
    if (event && event.currentTarget) {
      (event.currentTarget as HTMLElement).blur();
    }
    this.add.emit();
  }
}