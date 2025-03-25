// Script principal para toda la aplicación

document.addEventListener('DOMContentLoaded', function() {
    // Inicialización de componentes globales
    initMobileMenu();
    initDropdowns();
    initAlerts();
});

// Función para inicializar el menú móvil
function initMobileMenu() {
    const menuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (menuButton && mobileMenu) {
        menuButton.addEventListener('click', () => {
            const expanded = menuButton.getAttribute('aria-expanded') === 'true';
            menuButton.setAttribute('aria-expanded', !expanded);
            mobileMenu.classList.toggle('hidden');
        });
    }
}

// Función para inicializar dropdowns
function initDropdowns() {
    const dropdownButtons = document.querySelectorAll('[data-dropdown-toggle]');
    
    dropdownButtons.forEach(button => {
        const targetId = button.getAttribute('data-dropdown-toggle');
        const target = document.getElementById(targetId);
        
        if (target) {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const expanded = button.getAttribute('aria-expanded') === 'true';
                button.setAttribute('aria-expanded', !expanded);
                target.classList.toggle('hidden');
            });
            
            // Cerrar al hacer clic fuera
            document.addEventListener('click', (e) => {
                if (!target.contains(e.target) && !button.contains(e.target)) {
                    button.setAttribute('aria-expanded', 'false');
                    target.classList.add('hidden');
                }
            });
        }
    });
}

// Función para inicializar alertas descartables
function initAlerts() {
    const closeButtons = document.querySelectorAll('[data-dismiss="alert"]');
    
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const alert = button.closest('.alert');
            if (alert) {
                alert.classList.add('opacity-0');
                setTimeout(() => {
                    alert.remove();
                }, 300);
            }
        });
    });
}

// Función para formatear fechas
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date)) return dateString;
    
    return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Función para formatear números
function formatNumber(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return '';
    
    return Number(value).toLocaleString('es-ES', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}


// Script específico para la página de reportes

document.addEventListener('DOMContentLoaded', function() {
    initDateRangePicker();
    initFiltersToggle();
    initSortableColumns();
    initExportButtons();
});

// Función para inicializar selector de rango de fechas
document.addEventListener('DOMContentLoaded', function() {
    const downloadLinks = document.querySelectorAll('a[href*="/download"]');
    
    downloadLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const clientId = document.querySelector('input[name="client_id"]').value;
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            
            // Construir la URL con los valores actuales
            const downloadUrl = `/ve/reports/users/download?client_id=${clientId}&startDate=${startDate}&endDate=${endDate}`;
            
            // Redirigir
            window.location.href = downloadUrl;
        });
    });
});

// Función para mostrar/ocultar sección de filtros avanzados
function initFiltersToggle() {
    const toggleButton = document.getElementById('toggle-advanced-filters');
    const advancedFilters = document.getElementById('advanced-filters');
    
    if (toggleButton && advancedFilters) {
        toggleButton.addEventListener('click', function() {
            const isHidden = advancedFilters.classList.contains('hidden');
            advancedFilters.classList.toggle('hidden');
            this.textContent = isHidden ? 'Ocultar filtros avanzados' : 'Mostrar filtros avanzados';
        });
    }
}

// Función para hacer columnas ordenables
function initSortableColumns() {
    const sortableHeaders = document.querySelectorAll('th[data-sort]');
    
    sortableHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const sortField = this.getAttribute('data-sort');
            const currentOrder = this.getAttribute('data-order') || 'asc';
            const newOrder = currentOrder === 'asc' ? 'desc' : 'asc';
            
            // Actualizar atributos
            sortableHeaders.forEach(h => h.removeAttribute('data-order'));
            this.setAttribute('data-order', newOrder);
            
            // Actualizar URL con parámetros de ordenación
            const url = new URL(window.location.href);
            url.searchParams.set('sort', sortField);
            url.searchParams.set('order', newOrder);
            window.location.href = url.toString();
        });
    });
}

// Función para los botones de exportación
function initExportButtons() {
    const exportButtons = document.querySelectorAll('[data-export]');
    
    exportButtons.forEach(button => {
        button.addEventListener('click', function() {
            const exportType = this.getAttribute('data-export');
            const currentUrl = new URL(window.location.href);
            
            // Añadir formato de exportación a la URL
            const downloadUrl = new URL(currentUrl.pathname.replace('/preview', '/download'), currentUrl.origin);
            currentUrl.searchParams.forEach((value, key) => {
                downloadUrl.searchParams.append(key, value);
            });
            
            if (exportType) {
                downloadUrl.searchParams.append('format', exportType);
            }
            
            window.location.href = downloadUrl.toString();
        });
    });
}