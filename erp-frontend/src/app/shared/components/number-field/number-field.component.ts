import { CommonModule } from '@angular/common';
import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

export type NumberFieldMode = 'price' | 'quantity' | 'money';

@Component({
  selector: 'app-number-field',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (allowDecimals && mode === 'quantity') {
      <div class="nf-stepper" [class.nf-stepper-sm]="size === 'sm'">
        <button type="button" class="btn btn-outline-secondary nf-stepper-btn" tabindex="-1"
                [disabled]="disabled" (click)="stepBy(-1)" aria-label="Disminuir">−</button>
        <input
          type="number"
          class="form-control nf-stepper-input no-spinner text-end"
          [class.form-control-sm]="size === 'sm'"
          [attr.min]="min"
          [attr.max]="max ?? null"
          step="any"
          [disabled]="disabled"
          [ngModel]="innerValue"
          (ngModelChange)="onChangeInput($event)"
          (blur)="onBlur()" />
        <button type="button" class="btn btn-outline-secondary nf-stepper-btn" tabindex="-1"
                [disabled]="disabled" (click)="stepBy(1)" aria-label="Aumentar">+</button>
      </div>
    } @else {
      <input
        type="number"
        class="form-control"
        [class.form-control-sm]="size === 'sm'"
        [class.text-end]="alignEnd"
        [attr.min]="min"
        [attr.max]="max ?? null"
        [attr.step]="step"
        [disabled]="disabled"
        [ngModel]="innerValue"
        (ngModelChange)="onChangeInput($event)"
        (blur)="onBlur()" />
    }
  `,
  styles: [`
    :host {
      display: inline-block;
      width: auto;
      max-width: 100%;
    }

    input.no-spinner::-webkit-outer-spin-button,
    input.no-spinner::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    input.no-spinner {
      -moz-appearance: textfield;
      appearance: textfield;
    }

    .nf-stepper {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      width: max-content;
    }

    .nf-stepper-btn {
      flex: 0 0 2rem;
      width: 2rem !important;
      min-width: 2rem !important;
      height: var(--h-base, 2.375rem) !important;
      padding: 0 !important;
      line-height: 1;
      font-size: 1.1rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--rad-md, 0.375rem) !important;
    }

    .nf-stepper-input.form-control {
      flex: 0 0 3.5rem;
      width: 3.5rem !important;
      min-width: 3.5rem !important;
      max-width: 3.5rem !important;
      padding-left: 0.35rem !important;
      padding-right: 0.35rem !important;
    }

    .nf-stepper-sm .nf-stepper-btn {
      flex: 0 0 1.85rem;
      width: 1.85rem !important;
      min-width: 1.85rem !important;
      height: calc(1.5em + 0.5rem + 2px) !important;
      font-size: 1rem;
    }

    .nf-stepper-sm .nf-stepper-input.form-control {
      flex: 0 0 3rem;
      width: 3rem !important;
      min-width: 3rem !important;
      max-width: 3rem !important;
    }
  `],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => NumberFieldComponent),
      multi: true,
    },
  ],
})
export class NumberFieldComponent implements ControlValueAccessor {
  @Input() mode: NumberFieldMode = 'price';
  @Input() size: 'sm' | 'md' = 'md';
  @Input() min = 0;
  @Input() max?: number;
  @Input() alignEnd = false;
  /** Con mode=quantity: botones ± en enteros; decimales solo al digitar. */
  @Input() allowDecimals = false;

  innerValue: number | null = null;
  disabled = false;

  private onChange: (v: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  get step(): number {
    if (this.mode === 'quantity') return 1;
    if (this.mode === 'money') return 0.01;
    return 0.5;
  }

  writeValue(value: number | null): void {
    if (value == null || value === ('' as any)) {
      this.innerValue = null;
      return;
    }
    const n = Number(value);
    if (Number.isNaN(n)) {
      this.innerValue = null;
      return;
    }
    let normalized = n;
    if (this.mode === 'quantity' && this.allowDecimals && Math.abs(normalized - Math.round(normalized)) < 0.001) {
      normalized = Math.round(normalized);
    }
    if (this.mode === 'quantity' && this.isWholeNumber(normalized)) {
      this.innerValue = Math.round(normalized);
      return;
    }
    this.innerValue = normalized;
  }

  registerOnChange(fn: (v: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  stepBy(delta: number): void {
    if (this.disabled) return;
    const current = this.innerValue ?? this.integerFloor();
    const base = this.isWholeNumber(current) ? Math.round(current) : Math.round(current);
    let next = base + delta;
    next = this.clamp(next);
    this.innerValue = next;
    this.onChange(next);
  }

  onChangeInput(raw: number | string | null): void {
    const normalized = this.normalize(raw, false);
    this.innerValue = normalized;
    this.onChange(normalized);
  }

  onBlur(): void {
    const normalized = this.normalize(this.innerValue, true);
    this.innerValue = normalized;
    this.onChange(normalized);
    this.onTouched();
  }

  private normalize(raw: number | string | null | undefined, snap: boolean): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    let n = Number(raw);
    if (Number.isNaN(n)) return null;

    if (this.mode === 'quantity') {
      if (!this.allowDecimals) {
        n = Math.round(n);
      } else if (snap) {
        n = this.isWholeNumber(n) ? Math.round(n) : Math.round(n * 10000) / 10000;
      }
      return this.clamp(n);
    }

    if (snap && this.mode === 'price') {
      n = Math.round(n / 0.5) * 0.5;
    } else if (snap && this.mode === 'money') {
      n = Math.round(n * 100) / 100;
    }

    return this.clamp(Math.round(n * 100) / 100);
  }

  private clamp(n: number): number {
    if (n < this.min) n = this.min;
    if (this.max != null && n > this.max) n = this.max;
    return n;
  }

  private integerFloor(): number {
    return Math.max(1, Math.ceil(this.min));
  }

  private isWholeNumber(n: number): boolean {
    return Math.abs(n - Math.round(n)) < 1e-9;
  }
}
