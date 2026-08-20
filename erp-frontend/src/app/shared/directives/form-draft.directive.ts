import { Directive, Input, OnInit, OnDestroy, inject } from '@angular/core';
import { FormGroupDirective } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';

@Directive({
  selector: '[appFormDraft]',
  standalone: true
})
export class FormDraftDirective implements OnInit, OnDestroy {
  @Input('appFormDraft') draftKey!: string;
  
  private formGroupDir = inject(FormGroupDirective);
  private destroy$ = new Subject<void>();

  ngOnInit() {
    if (!this.draftKey) return;
    
    // 1. Obtener el formulario al que está adjunta esta directiva
    const form = this.formGroupDir.form;
    
    // 2. Recuperar datos si existen
    const saved = localStorage.getItem(this.draftKey);
    if (saved) {
      try {
        form.patchValue(JSON.parse(saved), { emitEvent: false });
        form.markAsDirty(); // Lo marcamos como "tocado" para que el botón Guardar se habilite
      } catch (e) {
        localStorage.removeItem(this.draftKey);
      }
    }

    // 3. Escuchar cambios y guardar automáticamente cada 500ms
    form.valueChanges.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(val => {
      localStorage.setItem(this.draftKey, JSON.stringify(val));
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Método estático global para limpiar el draft después de un guardado exitoso
  static clear(key: string) {
    localStorage.removeItem(key);
  }
}