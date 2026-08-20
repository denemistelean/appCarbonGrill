import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ErpTab {
  id: string;
  label: string;
  icon: string;
  visible?: boolean;
}

@Component({
  selector: 'app-erp-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="d-flex flex-wrap gap-2 mb-3 border-bottom-dashed-erp pb-3">
      @for (tab of tabs; track tab.id) {
        @if (tab.visible !== false) {
          <button type="button" class="btn fw-bold px-4 text-nowrap"
              [class.btn-primary]="activeTab === tab.id"
              [class.btn-soft-neutral]="activeTab !== tab.id"
              (click)="tabChange.emit(tab.id)">
              <i class="bi {{ tab.icon }} me-2"></i> {{ tab.label }}
          </button>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErpTabsComponent {
  @Input({ required: true }) tabs: ErpTab[] = [];
  @Input({ required: true }) activeTab = '';
  @Output() tabChange = new EventEmitter<string>();
}
