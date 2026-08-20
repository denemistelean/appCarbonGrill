import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="d-flex flex-column align-items-center" [ngClass]="wrapperClass">
      <i class="bi fs-1-erp opacity-50" [ngClass]="icon"></i>
      <h6 class="fw-bold" [ngClass]="titleClass"><ng-content></ng-content></h6>
      <ng-content select="[description]"></ng-content>
    </div>
  `
})
export class EmptyStateComponent {
  @Input() icon: string = 'bi-inboxes floating-icon text-primary-erp';
  @Input() titleClass: string = 'text-erp mt-3 text-uppercase';
  @Input() wrapperClass: string = 'opacity-75';
}
