# Convención ng-select (combobox buscable)

En este stack **no** se usa `<select>` HTML nativo para catálogos.

## Mínimo obligatorio

```html
<ng-select
  class="ng-select-sm"
  [items]="catalogo()"
  bindLabel="nombre"
  bindValue="id"
  formControlName="id_catalogo"
  [searchable]="true"
  [clearable]="true"
  placeholder="Seleccionar..."
  appendTo="body"
  notFoundText="Sin resultados">
</ng-select>
```

En el `.ts` del componente standalone:

```ts
imports: [ReactiveFormsModule, NgSelectModule, /* ... */]
```

## Búsqueda en servidor

```html
<ng-select
  [items]="resultados()"
  bindLabel="etiqueta"
  bindValue="id"
  formControlName="id_x"
  [searchable]="true"
  [minTermLength]="2"
  typeToSearchText="Escribe al menos 2 caracteres"
  (search)="onBuscar($event.term)"
  [loading]="buscando()"
  appendTo="body">
</ng-select>
```

## Por qué `appendTo="body"`

Evita que el dropdown quede recortado dentro de modales Bootstrap / overflow hidden.
