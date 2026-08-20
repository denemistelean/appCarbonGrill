import { Component, inject, Input, OnInit, HostListener, Injectable } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { NgbDatepickerModule, NgbDate, NgbCalendar, NgbDatepickerI18n, NgbDateStruct } from '@ng-bootstrap/ng-bootstrap';

const I18N_VALUES = {
  es: {
    weekdays: ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'],
    months: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    monthsFull: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  }
};

@Injectable()
class CustomI18n extends NgbDatepickerI18n {
  getWeekdayLabel(weekday: number): string { return I18N_VALUES.es.weekdays[weekday - 1]; }
  getWeekdayShortName(weekday: number): string { return I18N_VALUES.es.weekdays[weekday - 1]; }
  getMonthShortName(month: number): string { return I18N_VALUES.es.months[month - 1]; }
  getMonthFullName(month: number): string { return I18N_VALUES.es.monthsFull[month - 1]; }
  getDayAriaLabel(date: NgbDateStruct): string { return `${date.day}-${date.month}-${date.year}`; }
}

@Component({
  selector: 'app-single-date-picker',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbDatepickerModule],
  templateUrl: './single-date-picker.component.html',
  styleUrls: ['./single-date-picker.component.scss'],
  providers: [{ provide: NgbDatepickerI18n, useClass: CustomI18n }]
})
export class SingleDatePickerComponent implements OnInit {
  @Input() formGroup!: FormGroup;
  @Input() controlName: string = 'fecha';
  @Input() label: string = 'Fecha';
  @Input() readonly: boolean = false;

  calendar = inject(NgbCalendar);

  selectedDate: NgbDate | null = null;
  hoveredDate: NgbDate | null = null;
  mesesVisibles: number = 1;

  get ctrl(): AbstractControl | null {
    return this.formGroup?.get(this.controlName) ?? null;
  }

  ngOnInit() {
    this.ajustarTamano();

    const val = this.ctrl?.value;
    if (val) this.selectedDate = this.parseDate(val);

    this.ctrl?.valueChanges.subscribe(val => {
      if (!val) {
        this.selectedDate = null;
        this.hoveredDate = null;
      } else if (typeof val === 'string') {
        this.selectedDate = this.parseDate(val);
      }
    });
  }

  @HostListener('window:resize')
  ajustarTamano() { this.mesesVisibles = 1; }

  onDateSelection(date: NgbDate, dp: any) {
    if (this.readonly) return;
    this.selectedDate = date;
    this.ctrl?.setValue(this.toDateStr(date));
    this.ctrl?.markAsDirty();
    setTimeout(() => dp.close(), 50);
  }

  dateText(): string {
    if (!this.selectedDate) return '';
    return `${this.pad(this.selectedDate.day)}/${this.pad(this.selectedDate.month)}/${this.selectedDate.year}`;
  }

  private parseDate(val: string): NgbDate | null {
    if (!val || typeof val !== 'string') return null;
    const p = val.split('-');
    if (p.length !== 3) return null;
    return new NgbDate(+p[0], +p[1], +p[2]);
  }

  private toDateStr(date: NgbDate): string {
    return `${date.year}-${this.pad(date.month)}-${this.pad(date.day)}`;
  }

  private pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
}
