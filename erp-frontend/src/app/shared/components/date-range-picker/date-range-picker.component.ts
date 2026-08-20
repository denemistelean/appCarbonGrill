import { Component, inject, Input, OnInit, HostListener, Injectable } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgbDatepickerModule, NgbDate, NgbCalendar, NgbDateParserFormatter, NgbDatepickerI18n, NgbDateStruct } from '@ng-bootstrap/ng-bootstrap';

const I18N_VALUES = {
  es: {
    weekdays: ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'],
    months: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    monthsFull: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  }
};

@Injectable()
export class CustomDatepickerI18n extends NgbDatepickerI18n {
  getWeekdayLabel(weekday: number): string { return I18N_VALUES.es.weekdays[weekday - 1]; }
  getWeekdayShortName(weekday: number): string { return I18N_VALUES.es.weekdays[weekday - 1]; }
  getMonthShortName(month: number, year?: number): string { return I18N_VALUES.es.months[month - 1]; }
  getMonthFullName(month: number, year?: number): string { return I18N_VALUES.es.monthsFull[month - 1]; }
  getDayAriaLabel(date: NgbDateStruct): string { return `${date.day}-${date.month}-${date.year}`; }
}

@Component({
  selector: 'app-date-range-picker',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbDatepickerModule],
  templateUrl: './date-range-picker.component.html',
  styleUrls: ['./date-range-picker.component.scss'],
  providers: [{ provide: NgbDatepickerI18n, useClass: CustomDatepickerI18n }] 
})
export class DateRangePickerComponent implements OnInit {
  @Input() formGroup!: FormGroup;
  @Input() controlStart: string = 'fecha_inicio';
  @Input() controlEnd: string = 'fecha_fin';
  @Input() label: string = 'Rango de Fechas';

  calendar = inject(NgbCalendar);
  formatter = inject(NgbDateParserFormatter);

  hoveredDate: NgbDate | null = null;
  fromDate: NgbDate | null = null;
  toDate: NgbDate | null = null;
  mesesVisibles: number = 2; 

ngOnInit() {
    this.ajustarTamanoCalendario();

    // 🔥 NUEVO: Escuchamos los cambios del formulario padre
    // Si detectamos que la fecha de inicio se limpia (ej: al usar .reset()), limpiamos el panel visual.
    this.formGroup.get(this.controlStart)?.valueChanges.subscribe(val => {
      if (!val) {
        this.fromDate = null;
        this.toDate = null;
        this.hoveredDate = null;
      }
    });
  }

  @HostListener('window:resize')
  onResize() {
    this.ajustarTamanoCalendario();
  }

  ajustarTamanoCalendario() {
    this.mesesVisibles = window.innerWidth < 768 ? 1 : 2;
  }

  onDateSelection(date: NgbDate, dp: any) {
    if (!this.fromDate && !this.toDate) {
      // 📌 PRIMER CLIC — actualiza el form para que fecha_inicio quede disponible de inmediato
      this.fromDate = date;
      this.actualizarFormulario();
    } else if (this.fromDate && !this.toDate && (date.after(this.fromDate) || date.equals(this.fromDate))) {
      // 📌 SEGUNDO CLIC (Misma fecha o posterior)
      this.toDate = date;
      this.actualizarFormulario();
      
      // 🔥 TRUCO MÁGICO: Un pequeño retraso para asegurar que Bootstrap no cancele el cierre
      if (dp) {
        setTimeout(() => {
          dp.close();
        }, 50); 
      }
    } else {
      // 📌 SI EL SEGUNDO CLIC ES ANTES DEL PRIMERO (Reiniciamos selección)
      this.toDate = null;
      this.fromDate = date;
      this.actualizarFormulario();
    }
  }

  actualizarFormulario() {
    const startStr = this.fromDate ? `${this.fromDate.year}-${this.pad(this.fromDate.month)}-${this.pad(this.fromDate.day)}` : '';
    const endStr = this.toDate ? `${this.toDate.year}-${this.pad(this.toDate.month)}-${this.pad(this.toDate.day)}` : '';
    
    this.formGroup.patchValue({
      [this.controlStart]: startStr,
      [this.controlEnd]: endStr
    });
  }

  private pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

  isHovered(date: NgbDate) { return this.fromDate && !this.toDate && this.hoveredDate && date.after(this.fromDate) && date.before(this.hoveredDate); }
  isInside(date: NgbDate) { return this.toDate && date.after(this.fromDate) && date.before(this.toDate); }
  isRange(date: NgbDate) { return date.equals(this.fromDate) || (this.toDate && date.equals(this.toDate)) || this.isInside(date) || this.isHovered(date); }

  rangoFechasTexto(): string {
    if (this.fromDate && this.toDate) {
      return `${this.pad(this.fromDate.day)}/${this.pad(this.fromDate.month)}/${this.fromDate.year} - ${this.pad(this.toDate.day)}/${this.pad(this.toDate.month)}/${this.toDate.year}`;
    } else if (this.fromDate) {
      return `${this.pad(this.fromDate.day)}/${this.pad(this.fromDate.month)}/${this.fromDate.year} - Seleccionar...`;
    }
    return '';
  }
}