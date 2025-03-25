// src/handlebars-helpers.ts
import * as hbs from 'hbs';

/**
 * Registra todos los helpers de Handlebars utilizados en la aplicación
 */
export function registerHandlebarsHelpers() {
  // Helper para obtener el año actual
  hbs.registerHelper('currentYear', () => new Date().getFullYear());

  // Helper para comprobar igualdad (útil para menús activos)
  hbs.registerHelper('eq', function (a, b) {
    return a === b;
  });

  // Helper para comprobar si un valor está en un array
  hbs.registerHelper('includes', function (array, value) {
    return Array.isArray(array) && array.includes(value);
  });

  // Helper para formatear fechas
  hbs.registerHelper('formatDate', function (date, format = 'DD/MM/YYYY') {
    if (!date) return '';
    
    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) return date;
      
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      
      switch (format) {
        case 'DD/MM/YYYY':
          return `${day}/${month}/${year}`;
        case 'YYYY-MM-DD':
          return `${year}-${month}-${day}`;
        case 'DD-MM-YYYY':
          return `${day}-${month}-${year}`;
        default:
          return `${day}/${month}/${year}`;
      }
    } catch (error) {
      return date;
    }
  });

  // Helper para formatear números
  hbs.registerHelper('formatNumber', function (number, decimals = 2) {
    if (number === null || number === undefined || isNaN(number)) {
      return '';
    }
    
    try {
      return parseFloat(number).toLocaleString('es-ES', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      });
    } catch (error) {
      return number;
    }
  });

  // Helper para truncar texto
  hbs.registerHelper('truncate', function (text, length = 100) {
    if (!text) return '';
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
  });

  // Helper para convertir JSON a string
  hbs.registerHelper('json', function (context) {
    return JSON.stringify(context);
  });

  // Helper para condicionales más complejos (if con operadores)
  hbs.registerHelper('ifCond', function (v1, operator, v2, options) {
    switch (operator) {
      case '==':
        return (v1 == v2) ? options.fn(this) : options.inverse(this);
      case '===':
        return (v1 === v2) ? options.fn(this) : options.inverse(this);
      case '!=':
        return (v1 != v2) ? options.fn(this) : options.inverse(this);
      case '!==':
        return (v1 !== v2) ? options.fn(this) : options.inverse(this);
      case '<':
        return (v1 < v2) ? options.fn(this) : options.inverse(this);
      case '<=':
        return (v1 <= v2) ? options.fn(this) : options.inverse(this);
      case '>':
        return (v1 > v2) ? options.fn(this) : options.inverse(this);
      case '>=':
        return (v1 >= v2) ? options.fn(this) : options.inverse(this);
      case '&&':
        return (v1 && v2) ? options.fn(this) : options.inverse(this);
      case '||':
        return (v1 || v2) ? options.fn(this) : options.inverse(this);
      default:
        return options.inverse(this);
    }
  });

  // Helper para obtener un valor de un objeto usando una cadena de propiedades
  hbs.registerHelper('lookup', function (obj, path) {
    if (!obj || !path) return null;
    
    const keys = path.split('.');
    let value = obj;
    
    for (const key of keys) {
      if (value === null || value === undefined) return null;
      value = value[key];
    }
    
    return value;
  });

  // Helper para añadir clases condicionales
  hbs.registerHelper('classNames', function (...args) {
    const classes: any[] = [];
    const options = args.pop();
    
    for (let i = 0; i < args.length; i += 2) {
      const className = args[i];
      const condition = args[i + 1];
      
      if (condition) {
        classes.push(className);
      }
    }
    
    return classes.join(' ');
  });

  // Helper para generar badges de estado
  hbs.registerHelper('statusBadge', function (status) {
    if (!status) return '';
    
    const statusMap = {
      'Activo': 'badge badge-success',
      'Inactivo': 'badge badge-danger',
      'Pendiente': 'badge badge-warning',
      'Completado': 'badge badge-info',
      'Sí': 'badge badge-success',
      'No': 'badge badge-danger',
      'N/A': 'badge badge-secondary',
      'N/ID': 'badge badge-secondary'
    };
    
    const className = statusMap[status] || 'badge badge-secondary';
    return `<span class="${className}">${status}</span>`;
  });
}