import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-table-actions',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row-actions">
      @if (showView) {
        <button class="btn-action-view" [title]="viewTitle" (click)="onView($event)">
          <i class="bi" [ngClass]="viewIcon"></i>
        </button>
      }
      @if (showEdit) {
        <button class="btn-action-edit" [title]="editTitle" (click)="onEdit($event)">
          <i class="bi" [ngClass]="editIcon"></i>
        </button>
      }
      @if (showDelete) {
        <button class="btn-action-delete" [title]="deleteTitle" (click)="onDelete($event)">
          <i class="bi" [ngClass]="deleteIcon"></i>
        </button>
      }
    </div>
  `
})
export class TableActionsComponent {
  @Input() showView = false;
  @Input() showEdit = true;
  @Input() showDelete = true;

  @Input() viewTitle = 'Ver detalle';
  @Input() editTitle = 'Editar';
  @Input() deleteTitle = 'Eliminar';

  @Input() viewIcon = 'bi-eye-fill';
  @Input() editIcon = 'bi-pencil';
  @Input() deleteIcon = 'bi-trash';

  @Output() view = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();

  onView(event: Event): void {
    event.stopPropagation();
    this.view.emit();
  }

  onEdit(event: Event): void {
    event.stopPropagation();
    this.edit.emit();
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.delete.emit();
  }
}
