import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'primary' | 'secondary' | 'tertiary' | 'info' | 'neutral' | 'soft-neutral';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge-erp" [ngClass]="'badge-' + variant + '-erp'"><ng-content></ng-content></span>
  `
})
export class StatusBadgeComponent {
  @Input() variant: BadgeVariant = 'neutral';
}
