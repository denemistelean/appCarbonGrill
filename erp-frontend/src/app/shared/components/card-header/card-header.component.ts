import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-card-header',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card-header-pro" [ngClass]="headerClass">
      <div class="erp-title-section" [ngClass]="titleClass">
        <div [ngClass]="iconBadgeClass"><i class="bi" [ngClass]="icon"></i></div>
        <ng-content></ng-content>
      </div>
      <ng-content select="[actions]"></ng-content>
    </div>
  `
})
export class CardHeaderComponent {
  @Input() icon: string = 'bi-info-circle';
  @Input() titleClass: string = 'm-0';
  @Input() iconBadgeClass: string = 'icon-badge me-2';
  @Input() headerClass: string = '';
}
