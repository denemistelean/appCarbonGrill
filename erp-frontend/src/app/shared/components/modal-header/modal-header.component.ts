
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal-header',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-header border-bottom-dashed-erp pb-3 px-4 pt-4" [ngClass]="headerClass">
      <div class="erp-title-section m-0" [ngClass]="titleClass">
        <div class="icon-badge me-2"><i class="bi" [ngClass]="icon"></i></div>
        <ng-content></ng-content>
      </div>
      <button type="button" class="btn-close shadow-none" (click)="close.emit()"></button>
    </div>
  `
})
export class ModalHeaderComponent {
  @Input() icon: string = 'bi-info-circle';
  @Input() titleClass: string = '';
  @Input() headerClass: string = '';
  @Output() close = new EventEmitter<void>();
}
