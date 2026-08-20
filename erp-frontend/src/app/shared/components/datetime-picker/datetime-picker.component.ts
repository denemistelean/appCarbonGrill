import { Component, inject, Input, OnInit, HostListener, Injectable } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
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
  selector: 'app-datetime-picker',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, NgbDatepickerModule],
  templateUrl: './datetime-picker.component.html',
  styleUrls: ['./datetime-picker.component.scss'],
  providers: [{ provide: NgbDatepickerI18n, useClass: CustomI18n }]
})
export class DatetimePickerComponent implements OnInit {
  @Input() formGroup!: FormGroup;
  @Input() controlName: string = 'fecha';
  @Input() label: string = 'Fecha y Hora';
  @Input() readonly: boolean = false;

  calendar = inject(NgbCalendar);

  selectedDate: NgbDate | null = null;
  hoveredDate: NgbDate | null = null;
  timeValue: string = '00:00';
  mesesVisibles: number = 1;

  get ctrl(): AbstractControl | null {
    return this.formGroup?.get(this.controlName) ?? null;
  }

  ngOnInit() {
    const val = this.ctrl?.value;
    if (val) this.parseValue(val);

    this.ctrl?.valueChanges.subscribe(val => {
      if (!val) {
        this.selectedDate = null;
        this.timeValue = '00:00';
      } else {
        this.parseValue(val);
      }
    });
  }

  @HostListener('window:resize')
  ajustarTamano() { this.mesesVisibles = 1; }

  private parseValue(val: string) {
    if (!val || typeof val !== 'string') return;
    const [datePart, timePart] = val.split('T');
    if (datePart) {
      const p = datePart.split('-');
      if (p.length === 3) this.selectedDate = new NgbDate(+p[0], +p[1], +p[2]);
    }
    if (timePart) this.timeValue = timePart.substring(0, 5);
  }

  onDateSelection(date: NgbDate, dp: any) {
    if (this.readonly) return;
    this.selectedDate = date;
    this.emitValue();
    setTimeout(() => dp.close(), 50);
  }

  onTimeChange(newTime: string) {
    this.timeValue = newTime;
    this.emitValue();
  }

  private emitValue() {
    if (!this.selectedDate) return;
    const dateStr = `${this.selectedDate.year}-${this.pad(this.selectedDate.month)}-${this.pad(this.selectedDate.day)}`;
    this.ctrl?.setValue(`${dateStr}T${this.timeValue || '00:00'}`);
    this.ctrl?.markAsDirty();
  }

  dateText(): string {
    if (!this.selectedDate) return '';
    return `${this.pad(this.selectedDate.day)}/${this.pad(this.selectedDate.month)}/${this.selectedDate.year}`;
  }

  private pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
}
