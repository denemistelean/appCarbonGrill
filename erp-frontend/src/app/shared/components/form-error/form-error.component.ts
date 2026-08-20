import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl } from '@angular/forms';

@Component({
  selector: 'app-form-error',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (control && control.invalid && (control.touched || control.dirty)) {
      <div class="text-danger-erp text-xs-erp mt-1 animate__animated animate__fadeIn">
        <i class="bi bi-exclamation-circle me-1"></i>
        @if (control.hasError('required')) { Requerido. }
        @else if (control.hasError('minlength')) { Mínimo {{ control.errors?.['minlength'].requiredLength }} caracteres. }
        @else if (control.hasError('min')) { Debe ser mayor o igual a {{ control.errors?.['min'].min }}. }
        @else if (control.hasError('email')) { Correo electrónico inválido. }
        @else if (control.hasError('pattern')) { Formato incorrecto o espacios vacíos. }
      </div>
    }
  `
})
export class FormErrorComponent {
  // Recibe el control del formulario reactivo directamente
  @Input() control: AbstractControl | null | undefined = null;
}