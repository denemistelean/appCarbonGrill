import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet], // <--- Necesario para que funcionen las rutas
  templateUrl: './app.html', // (o app.component.html si no lo renombraste)
  styleUrls: ['./app.scss']  // (o app.component.scss si no lo renombraste)
})
export class App {
  title = 'app-minera-yungua';
}