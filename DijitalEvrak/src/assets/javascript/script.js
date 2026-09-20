// Started script
document.addEventListener('DOMContentLoaded', function () {
    // NOT: Sol menü aç/kapat butonu (#sidebarToggle) artık Angular tarafında
    // (layouts.ts -> toggleSidebar()) yönetiliyor. Burada ikinci bir click
    // listener eklemeyin; aynı butona iki listener bağlanırsa "sb-toggled"
    // sınıfı art arda iki kez toggle'lanıp birbirini götürür ve menü hiç
    // açılmıyormuş gibi görünür.

    // Update time in footer
    function updateTime() {
        const now = new Date();
        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        };
        const timeString = now.toLocaleDateString('tr-TR', options).replace(',', '');

        const timeElement = document.querySelector('.footer-left');
        if (timeElement) {
            timeElement.innerHTML = '<span class="material-symbols-outlined">schedule</span> ' + timeString;
        }
    }

    // Update time every second
    setInterval(updateTime, 1000);

    // Initial time update
    updateTime();

    // Handle submenu toggle
    const menuItems = document.querySelectorAll('.nav-link.has-submenu, .nav-link.has-sub-submenu');

    menuItems.forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();

            // Toggle the chevron icon rotation
            const chevron = this.querySelector('.chevron-icon');
            if (chevron) {
                chevron.classList.toggle('rotated');
            }

            // Find the submenu based on the clicked item
            let submenu;
            if (this.classList.contains('has-submenu')) {
                submenu = this.parentElement.querySelector('.submenu');
            } else if (this.classList.contains('has-sub-submenu')) {
                submenu = this.parentElement.querySelector('.sub-submenu');
            }

            if (submenu) {
                submenu.classList.toggle('show');

                // If submenu is being opened, make sure parent menu is also open
                if (submenu.classList.contains('show') && submenu.classList.contains('sub-submenu')) {
                    const parentSubmenu = submenu.parentElement.parentElement;
                    if (parentSubmenu && parentSubmenu.classList.contains('submenu')) {
                        parentSubmenu.classList.add('show');

                        // Also rotate parent chevron
                        const parentMenuItem = parentSubmenu.parentElement.querySelector('.has-submenu');
                        if (parentMenuItem) {
                            const parentChevron = parentMenuItem.querySelector('.chevron-icon');
                            if (parentChevron) {
                                parentChevron.classList.add('rotated');
                            }
                        }
                    }
                }
            }

            // If it's a main menu item, close other main menu items
            if (this.classList.contains('has-submenu')) {
                const otherSubmenus = document.querySelectorAll('.submenu.show');
                otherSubmenus.forEach(menu => {
                    if (menu !== submenu && !menu.contains(submenu) && !submenu?.contains(menu)) {
                        menu.classList.remove('show');
                        // Find the parent menu item and reset its chevron
                        const parentItem = menu.parentElement.querySelector('.has-submenu');
                        if (parentItem) {
                            const parentChevron = parentItem.querySelector('.chevron-icon');
                            if (parentChevron) {
                                parentChevron.classList.remove('rotated');
                            }
                        }

                        // Also close any sub-submenus within this submenu
                        const childSubSubmenus = menu.querySelectorAll('.sub-submenu.show');
                        childSubSubmenus.forEach(subSubmenu => {
                            subSubmenu.classList.remove('show');
                            const subParentItem = subSubmenu.parentElement.querySelector('.has-sub-submenu');
                            if (subParentItem) {
                                const subParentChevron = subParentItem.querySelector('.chevron-icon');
                                if (subParentChevron) {
                                    subParentChevron.classList.remove('rotated');
                                }
                            }
                        });
                    }
                });
            }

            // If it's a submenu item, close other sub-submenus at the same level
            if (this.classList.contains('has-sub-submenu')) {
                const parentSubMenu = this.closest('.submenu');
                if (parentSubMenu) {
                    const otherSubSubmenus = parentSubMenu.querySelectorAll('.sub-submenu.show');
                    otherSubSubmenus.forEach(menu => {
                        if (menu !== submenu) {
                            menu.classList.remove('show');
                            // Find the parent menu item and reset its chevron
                            const parentItem = menu.parentElement.querySelector('.has-sub-submenu');
                            if (parentItem) {
                                const parentChevron = parentItem.querySelector('.chevron-icon');
                                if (parentChevron) {
                                    parentChevron.classList.remove('rotated');
                                }
                            }
                        }
                    });
                }
            }
        });
    });

    // Handle responsive behavior
    function checkScreenSize() {
        if (window.innerWidth < 768) {
            document.body.classList.add('sb-toggled');
        } else {
            document.body.classList.remove('sb-toggled');
        }
    }

    // Initial check
    checkScreenSize();

    // Listen for window resize
    window.addEventListener('resize', checkScreenSize);

    const clearButtons = document.querySelectorAll('.input-clear');
    clearButtons.forEach(button => {
        button.addEventListener('click', function () {
            const input = this.previousElementSibling;
            input.value = '';
            input.focus();
        });
    });

    const btnCloseSidebar = document.querySelector('.btn-close-sidebar');
    const sidebarToggleBtn = document.getElementById('sidebarToggle');
    if (btnCloseSidebar && sidebarToggleBtn) {
        btnCloseSidebar.addEventListener('click', function () {
            // Mevcut sidebarToggle butonunun tıklama olayını tetikleyelim
            sidebarToggleBtn.click();
        });
    }
    // Back button functionality
    const backButton = document.querySelector('.btn-back');
    if (backButton) {
        backButton.addEventListener('click', function () {
            // You can replace this with your own navigation logic
            window.history.back();
        });
    }

    // Form submission (prevent default for demo)
    const form = document.querySelector('form');
    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            // Here you would normally handle the form submission
            alert('Form submitted successfully!');
        });
    }

    const submenuLinks = document.querySelectorAll('.submenu .nav-link');

    submenuLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            // Remove active class from all submenu links
            submenuLinks.forEach(otherLink => {
                otherLink.classList.remove('active');
            });

            // Add active class to clicked link
            this.classList.add('active');

            // Find parent menu item and add "has-active-submenu" class
            const allMenuItems = document.querySelectorAll('.nav-item');
            allMenuItems.forEach(item => {
                item.classList.remove('has-active-submenu');
            });

            let parentMenuItem = this.closest('.submenu').parentElement;
            parentMenuItem.classList.add('has-active-submenu');

            // Ensure parent submenu stays open
            const parentSubmenu = this.closest('.submenu');
            if (parentSubmenu) {
                parentSubmenu.classList.add('show');
                const parentMenuLink = parentMenuItem.querySelector('.has-submenu');
                if (parentMenuLink) {
                    const chevron = parentMenuLink.querySelector('.chevron-icon');
                    if (chevron) {
                        chevron.classList.add('rotated');
                    }
                }
            }

            // If this is inside a nested submenu, ensure grandparent menu stays open too
            const parentOfSubmenu = parentSubmenu.parentElement;
            if (parentOfSubmenu && parentOfSubmenu.classList.contains('submenu')) {
                parentOfSubmenu.classList.add('show');
                const grandparentMenuItem = parentOfSubmenu.parentElement;
                if (grandparentMenuItem) {
                    grandparentMenuItem.classList.add('has-active-submenu');
                    const grandparentMenuLink = grandparentMenuItem.querySelector('.has-submenu');
                    if (grandparentMenuLink) {
                        const chevron = grandparentMenuLink.querySelector('.chevron-icon');
                        if (chevron) {
                            chevron.classList.add('rotated');
                        }
                    }
                }
            }
        });
    });

    // Dark Mode/Light Mode Toggle
    const themeToggleBtn = document.getElementById('themeToggle');
    const lightIcon = document.querySelector('.theme-icon-light');
    const darkIcon = document.querySelector('.theme-icon-dark');

    // Kullanıcının tercihini localStorage'da saklama
    const currentTheme = localStorage.getItem('theme') || 'light';

    // Sayfa yüklendiğinde tema ayarını uygula
    if (currentTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        lightIcon.classList.add('d-none');
        darkIcon.classList.remove('d-none');
    }

    // Tema değiştirme işlevi
    themeToggleBtn.addEventListener('click', function () {
        let theme = 'light';

        if (document.documentElement.getAttribute('data-theme') !== 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            theme = 'dark';
            lightIcon.classList.add('d-none');
            darkIcon.classList.remove('d-none');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            lightIcon.classList.remove('d-none');
            darkIcon.classList.add('d-none');
        }

        // Kullanıcı tercihini kaydet
        localStorage.setItem('theme', theme);
    });

    const lightThemeBtn = document.getElementById('lightThemeChange');
    // Light Tema değiştirme işlevi
    lightThemeBtn.addEventListener('click', function () {
        document.documentElement.setAttribute('data-theme', 'light');
        lightIcon.classList.remove('d-none');
        darkIcon.classList.add('d-none');

        // Kullanıcı tercihini kaydet
        localStorage.setItem('theme', "light");
    });

    const darkThemeBtn = document.getElementById('darkThemeChange');
    // Dark Tema değiştirme işlevi
    darkThemeBtn.addEventListener('click', function () {
        document.documentElement.setAttribute('data-theme', 'dark');
        lightIcon.classList.remove('d-none');
        darkIcon.classList.add('d-none');

        // Kullanıcı tercihini kaydet
        localStorage.setItem('theme', "dark");
    });

    // Dil değiştirme işlevi
    const languageItems = document.querySelectorAll('.dropdown-menu .dropdown-item');
    const languageBtn = document.querySelector('.language-btn img');

    languageItems.forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            const flagSrc = this.querySelector('img').src;
            languageBtn.src = flagSrc;

            // Burada dil değiştirme mantığını ekleyebilirsiniz
            // Örneğin: window.location.href = this.getAttribute('href');
        });
    });

    // Bildirimleri okundu olarak işaretleme
    const notificationItems = document.querySelectorAll('.notification-item');
    const notificationBadge = document.querySelector('.notification-badge');

    notificationItems.forEach(item => {
        item.addEventListener('click', function (e) {
            // Burada bildirim işleme mantığı eklenebilir

            // Örnek: Bildirim sayısını azaltma
            const currentCount = parseInt(notificationBadge.textContent);
            if (currentCount > 0) {
                notificationBadge.textContent = currentCount - 1;

                // Eğer bildirim kalmadıysa badge'i gizle
                if (currentCount - 1 === 0) {
                    notificationBadge.style.display = 'none';
                }
            }

            // Tıklanan bildirimi vurgulama veya kaldırma
            this.style.backgroundColor = 'rgba(0,0,0,0.05)';
            setTimeout(() => {
                this.style.backgroundColor = '';
            }, 300);
        });
    });
});

// Sidebar Menu Search Functionality
document.addEventListener('DOMContentLoaded', function () {
    const sidebarSearchInput = document.querySelector('.sidebar-search-input');
    const navMenuItems = document.querySelectorAll('.nav-menu .nav-link');

    if (sidebarSearchInput) {
        sidebarSearchInput.addEventListener('input', function () {
            const searchTerm = this.value.toLowerCase().trim();

            navMenuItems.forEach(item => {
                const text = item.textContent.toLowerCase();
                const menuItem = item.closest('.nav-item');
                const submenu = menuItem.querySelector('.submenu');
                const subSubmenu = menuItem.querySelector('.sub-submenu');

                if (text.includes(searchTerm)) {
                    // Show the item and its parent menus
                    menuItem.style.display = '';

                    // Expand parent menus if needed
                    if (submenu) {
                        submenu.classList.add('show');
                        const parentChevron = menuItem.querySelector('.chevron-icon');
                        if (parentChevron) {
                            parentChevron.classList.add('rotated');
                        }
                    }

                    if (subSubmenu) {
                        subSubmenu.classList.add('show');
                        const parentChevron = menuItem.querySelector('.chevron-icon');
                        if (parentChevron) {
                            parentChevron.classList.add('rotated');
                        }
                    }
                } else {
                    menuItem.style.display = 'none';
                }
            });

            // If search is empty, reset all menus
            if (searchTerm === '') {
                navMenuItems.forEach(item => {
                    const menuItem = item.closest('.nav-item');
                    menuItem.style.display = '';

                    const submenus = menuItem.querySelectorAll('.submenu, .sub-submenu');
                    submenus.forEach(submenu => {
                        submenu.classList.remove('show');
                    });

                    const chevrons = menuItem.querySelectorAll('.chevron-icon');
                    chevrons.forEach(chevron => {
                        chevron.classList.remove('rotated');
                    });
                });
            }
        });
    }
});

// Content Scroll Top Button Functionality
document.addEventListener('DOMContentLoaded', function () {
    const contentScrollTop = document.getElementById('contentScrollTop');

    if (contentScrollTop) {
        // Sayfa scroll olayını dinle
        window.addEventListener('scroll', function () {
            // Eğer 400px'den fazla aşağı kaydıysa butonu göster
            if (window.scrollY > 400) {
                contentScrollTop.classList.add('show');
            } else {
                contentScrollTop.classList.remove('show');
            }
        });

        // Butona tıklama olayı
        contentScrollTop.addEventListener('click', function () {
            // Smooth scroll ile yukarı çık
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
});

// Dashboard
function initializeDashboard() {
    // Sales Chart
    const salesChartCtx = document.getElementById('salesChart');
    if (salesChartCtx) {
        const salesChart = new Chart(salesChartCtx, {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Sales',
                    data: [12500, 11000, 12000, 15000, 14000, 16500, 17500, 18000, 17000, 19500, 21000, 24500],
                    borderColor: '#4361ee',
                    backgroundColor: 'rgba(67, 97, 238, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }, {
                    label: 'Revenue',
                    data: [7500, 6000, 7000, 9000, 8500, 10500, 11500, 12000, 11000, 13000, 14500, 18000],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            boxWidth: 12,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            callback: function (value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                }
            }
        });
    }

    // Distribution Chart
    const distributionChartCtx = document.getElementById('distributionChart');
    if (distributionChartCtx) {
        const distributionChart = new Chart(distributionChartCtx, {
            type: 'doughnut',
            data: {
                labels: ['Electronics', 'Clothing', 'Food', 'Home & Garden', 'Others'],
                datasets: [{
                    data: [35, 25, 20, 15, 5],
                    backgroundColor: [
                        '#4361ee',
                        '#10b981',
                        '#f59e0b',
                        '#06b6d4',
                        '#8b5cf6'
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 12,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 15
                        }
                    }
                },
                cutout: '70%'
            }
        });
    }

    // Handle theme switching for charts
    const themeToggleBtn = document.getElementById('themeToggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', function () {
            // Update chart colors based on theme
            setTimeout(() => {
                const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';

                if (salesChart) {
                    try {
                        salesChart.options.scales.x.grid.color = isDarkTheme ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
                        salesChart.options.scales.y.grid.color = isDarkTheme ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
                        salesChart.update();
                    } catch (error) {
                    }
                }

                if (distributionChart) {
                    // Update legend colors if needed
                    distributionChart.update();
                }
            }, 100);
        });
    }
};

// Code part toggle
function initializaCodeToggle() {
    // Show/hide code examples
    const codeTogglers = document.querySelectorAll('.code-toggler');

    codeTogglers.forEach(toggler => {
        toggler.addEventListener('click', function () {
            const targetId = this.getAttribute('data-target');
            const codeExample = document.getElementById(targetId);

            if (codeExample.classList.contains('d-none')) {
                codeExample.classList.remove('d-none');
                this.classList.add('active');
            } else {
                codeExample.classList.add('d-none');
                this.classList.remove('active');
            }
        });
    });
};

// Select Page
function initializeSelect() {
    // Form validation
    const forms = document.querySelectorAll('.needs-validation');

    Array.prototype.slice.call(forms).forEach(function (form) {
        form.addEventListener('submit', function (event) {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }

            form.classList.add('was-validated');
        }, false);
    });

    // Dependent/Cascading Select data and logic
    const locationData = {
        'africa': {
            'egypt': ['Cairo', 'Alexandria', 'Luxor'],
            'kenya': ['Nairobi', 'Mombasa', 'Kisumu'],
            'south-africa': ['Johannesburg', 'Cape Town', 'Durban']
        },
        'asia': {
            'china': ['Beijing', 'Shanghai', 'Guangzhou'],
            'japan': ['Tokyo', 'Osaka', 'Kyoto'],
            'india': ['Mumbai', 'Delhi', 'Bangalore']
        },
        'europe': {
            'france': ['Paris', 'Lyon', 'Marseille'],
            'germany': ['Berlin', 'Munich', 'Hamburg'],
            'italy': ['Rome', 'Milan', 'Florence']
        },
        'north-america': {
            'usa': ['New York', 'Los Angeles', 'Chicago'],
            'canada': ['Toronto', 'Vancouver', 'Montreal'],
            'mexico': ['Mexico City', 'Guadalajara', 'Monterrey']
        },
        'south-america': {
            'brazil': ['São Paulo', 'Rio de Janeiro', 'Brasília'],
            'argentina': ['Buenos Aires', 'Córdoba', 'Rosario'],
            'colombia': ['Bogotá', 'Medellín', 'Cali']
        },
        'oceania': {
            'australia': ['Sydney', 'Melbourne', 'Brisbane'],
            'new-zealand': ['Auckland', 'Wellington', 'Christchurch'],
            'fiji': ['Suva', 'Lautoka', 'Nadi']
        }
    };

    // Get select elements
    const continentSelect = document.getElementById('continentSelect');
    const countrySelect = document.getElementById('countrySelect');
    const citySelect = document.getElementById('citySelect');

    if (continentSelect && countrySelect && citySelect) {
        // Event listener for continent selection
        continentSelect.addEventListener('change', function () {
            const selectedContinent = this.value;

            // Reset country and city selects
            countrySelect.innerHTML = '<option value="" selected>Select a country</option>';
            citySelect.innerHTML = '<option value="" selected>Select a city</option>';

            // Disable country and city selects if no continent is selected
            if (!selectedContinent) {
                countrySelect.disabled = true;
                citySelect.disabled = true;
                return;
            }

            // Enable country select and populate options
            countrySelect.disabled = false;
            const countries = Object.keys(locationData[selectedContinent]);

            countries.forEach(country => {
                const option = document.createElement('option');
                option.value = country;
                option.textContent = country.charAt(0).toUpperCase() + country.slice(1).replace('-', ' ');
                countrySelect.appendChild(option);
            });

            // Keep city select disabled
            citySelect.disabled = true;
        });

        // Event listener for country selection
        countrySelect.addEventListener('change', function () {
            const selectedContinent = continentSelect.value;
            const selectedCountry = this.value;

            // Reset city select
            citySelect.innerHTML = '<option value="" selected>Select a city</option>';

            // Disable city select if no country is selected
            if (!selectedCountry) {
                citySelect.disabled = true;
                return;
            }

            // Enable city select and populate options
            citySelect.disabled = false;
            const cities = locationData[selectedContinent][selectedCountry];

            cities.forEach(city => {
                const option = document.createElement('option');
                option.value = city.toLowerCase().replace(' ', '-');
                option.textContent = city;
                citySelect.appendChild(option);
            });
        });
    }

    // Initialize Select2 if the library is available
    if (typeof $ !== 'undefined' && $.fn.select2) {
        $('.select2').select2({
            placeholder: "Select an option",
            allowClear: true
        });

        $('.select2-multiple').select2({
            placeholder: "Select options",
            tags: true
        });
    } else {
        // Display a message when Select2 is not available
        const enhancedSelects = document.querySelectorAll('.select2, .select2-multiple');
        if (enhancedSelects.length > 0) {
            const warningEl = document.createElement('div');
            warningEl.className = 'alert alert-warning mt-3';
            warningEl.innerHTML = '<strong>Note:</strong> Select2 library is not loaded. Enhanced select examples are displayed as regular selects.';

            const enhancedSelectSection = document.querySelector('.select2, .select2-multiple').closest('.card');
            if (enhancedSelectSection) {
                enhancedSelectSection.querySelector('.card-body').appendChild(warningEl);
            }
        }
    }
};

// Inputs
function initializeInput() {
    // Form validation
    const forms = document.querySelectorAll('.needs-validation');

    Array.prototype.slice.call(forms).forEach(function (form) {
        form.addEventListener('submit', function (event) {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }

            form.classList.add('was-validated');
        }, false);
    });

    // Password toggle functionality
    const passwordToggle = document.querySelector('.password-toggle');
    if (passwordToggle) {
        passwordToggle.addEventListener('click', function () {
            const passwordInput = document.getElementById('passwordToggle');
            const visibleIcon = this.querySelector('.toggle-visible');
            const hiddenIcon = this.querySelector('.toggle-hidden');

            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                visibleIcon.classList.add('d-none');
                hiddenIcon.classList.remove('d-none');
            } else {
                passwordInput.type = 'password';
                visibleIcon.classList.remove('d-none');
                hiddenIcon.classList.add('d-none');
            }
        });
    }

    // Copy button functionality
    const copyButtons = document.querySelectorAll('.btn-copy');
    if (copyButtons.length > 0) {
        copyButtons.forEach(button => {
            button.addEventListener('click', function () {
                const targetId = this.getAttribute('data-target');
                const inputElement = document.getElementById(targetId);

                inputElement.select();
                document.execCommand('copy');

                // Show feedback
                const originalText = this.innerHTML;
                this.innerHTML = '<span class="material-symbols-outlined">check</span>';

                setTimeout(() => {
                    this.innerHTML = originalText;
                }, 2000);
            });
        });
    }

    // Character counter for textarea
    const charCountTextarea = document.getElementById('characterCountTextarea');
    if (charCountTextarea) {
        charCountTextarea.addEventListener('input', function () {
            const maxLength = this.getAttribute('maxlength');
            const currentLength = this.value.length;
            document.querySelector('.character-count').textContent = currentLength + '/' + maxLength;
        });
    }

    // Character counter for input
    const charCountInput = document.getElementById('charCountInput');
    if (charCountInput) {
        charCountInput.addEventListener('input', function () {
            const maxLength = this.getAttribute('maxlength');
            const currentLength = this.value.length;
            document.querySelector('.input-char-count').textContent = currentLength + '/' + maxLength;
        });
    }

    // Auto-resize textarea
    const autoResizeTextareas = document.querySelectorAll('.auto-resize');
    if (autoResizeTextareas.length > 0) {
        autoResizeTextareas.forEach(textarea => {
            textarea.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
            });
        });
    }

    // Initialize tooltips if Bootstrap JS is loaded
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }

    // Clear button for search input
    const clearButtons = document.querySelectorAll('.input-clear');
    if (clearButtons.length > 0) {
        clearButtons.forEach(button => {
            button.addEventListener('click', function () {
                const input = this.closest('.input-group').querySelector('input');
                input.value = '';
                input.focus();
            });
        });
    }
};

// Checkbox
function initializeCheckbox() {
    // Set indeterminate checkbox state
    const indeterminateCheck = document.getElementById('indeterminateCheck');
    if (indeterminateCheck) {
        indeterminateCheck.indeterminate = true;
    }

    // Form validation
    const forms = document.querySelectorAll('.needs-validation');

    Array.prototype.slice.call(forms).forEach(function (form) {
        form.addEventListener('submit', function (event) {
            // Minimum checkbox validation
            const featureCheckboxes = form.querySelectorAll('.feature-checkbox:checked');
            const minSelectionError = form.querySelector('.min-selection-error');

            if (minSelectionError && featureCheckboxes) {
                if (featureCheckboxes.length < 2) {
                    event.preventDefault();
                    event.stopPropagation();
                    minSelectionError.classList.remove('d-none');
                } else {
                    minSelectionError.classList.add('d-none');
                }
            }

            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }

            form.classList.add('was-validated');
        }, false);
    });

    // Toggle additional fields
    const customizationCheck = document.getElementById('customizationCheck');
    const additionalFields = document.querySelector('.additional-fields');

    if (customizationCheck && additionalFields) {
        customizationCheck.addEventListener('change', function () {
            if (this.checked) {
                additionalFields.classList.remove('d-none');
            } else {
                additionalFields.classList.add('d-none');
            }
        });
    }

    // Status badge toggle with switches
    const maintenanceMode = document.getElementById('maintenanceMode');
    if (maintenanceMode) {
        const statusBadge = maintenanceMode.closest('.d-flex').querySelector('.status-badge');

        maintenanceMode.addEventListener('change', function () {
            if (this.checked) {
                statusBadge.textContent = 'Maintenance';
                statusBadge.classList.remove('bg-success');
                statusBadge.classList.add('bg-warning');
            } else {
                statusBadge.textContent = 'Online';
                statusBadge.classList.remove('bg-warning');
                statusBadge.classList.add('bg-success');
            }
        });
    }

    const developerMode = document.getElementById('developerMode');
    if (developerMode) {
        const statusBadge = developerMode.closest('.d-flex').querySelector('.status-badge');

        developerMode.addEventListener('change', function () {
            if (this.checked) {
                statusBadge.textContent = 'Enabled';
                statusBadge.classList.remove('bg-secondary');
                statusBadge.classList.add('bg-info');
            } else {
                statusBadge.textContent = 'Disabled';
                statusBadge.classList.remove('bg-info');
                statusBadge.classList.add('bg-secondary');
            }
        });
    }
};

// Validation
function initializeValidation() {
    // Basic HTML5 validation form
    const html5Form = document.getElementById('html5ValidationForm');
    if (html5Form) {
        html5Form.addEventListener('submit', function (e) {
            e.preventDefault();
            alert('Form validated and would be submitted!');
        });
    }

    // Bootstrap validation form
    const forms = document.querySelectorAll('.needs-validation');
    Array.prototype.slice.call(forms).forEach(function (form) {
        form.addEventListener('submit', function (event) {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            } else {
                event.preventDefault(); // For demo purposes
                alert('Form is valid! Submitting...');
            }

            form.classList.add('was-validated');
        }, false);
    });

    // Validate Now button
    const validateNowBtn = document.getElementById('validateNow');
    if (validateNowBtn) {
        validateNowBtn.addEventListener('click', function () {
            document.getElementById('bootstrapValidationForm').classList.add('was-validated');
        });
    }

    // Real-time validation

    // Password strength meter
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirmPassword');
    const progressBar = document.querySelector('.progress-bar');
    const strengthText = document.querySelector('.password-strength-text');
    const matchFeedback = document.querySelector('.password-match-feedback');

    if (password) {
        password.addEventListener('input', function () {
            // Check password strength
            const strength = checkPasswordStrength(this.value);
            progressBar.style.width = strength.score + '%';
            progressBar.className = 'progress-bar ' + strength.class;
            progressBar.setAttribute('aria-valuenow', strength.score);
            strengthText.textContent = 'Password strength: ' + strength.message;

            // Check if passwords match
            if (confirmPassword && confirmPassword.value) {
                checkPasswordsMatch();
            }
        });
    }

    if (confirmPassword) {
        confirmPassword.addEventListener('input', checkPasswordsMatch);
    }

    function checkPasswordStrength(password) {
        // Simple password strength checker
        let score = 0;
        let message = 'Very weak';
        let colorClass = 'bg-danger';

        if (password.length > 0) score += 10;
        if (password.length >= 8) score += 20;
        if (/[A-Z]/.test(password)) score += 20;
        if (/[0-9]/.test(password)) score += 20;
        if (/[^A-Za-z0-9]/.test(password)) score += 20;

        if (score >= 80) {
            message = 'Very strong';
            colorClass = 'bg-success';
        } else if (score >= 60) {
            message = 'Strong';
            colorClass = 'bg-info';
        } else if (score >= 40) {
            message = 'Medium';
            colorClass = 'bg-warning';
        } else if (score >= 20) {
            message = 'Weak';
            colorClass = 'bg-danger';
        }

        return { score, message, class: colorClass };
    }

    function checkPasswordsMatch() {
        if (password.value === confirmPassword.value) {
            matchFeedback.classList.add('text-success');
            matchFeedback.classList.remove('text-danger');
            matchFeedback.textContent = 'Passwords match!';
            confirmPassword.classList.add('is-valid');
            confirmPassword.classList.remove('is-invalid');
        } else {
            matchFeedback.classList.add('text-danger');
            matchFeedback.classList.remove('text-success');
            matchFeedback.textContent = 'Passwords do not match!';
            confirmPassword.classList.add('is-invalid');
            confirmPassword.classList.remove('is-valid');
        }
    }

    // Character counter
    const bioTextarea = document.getElementById('bio');
    const charCount = document.querySelector('.char-count');

    if (bioTextarea && charCount) {
        bioTextarea.addEventListener('input', function () {
            const currentLength = this.value.length;
            const maxLength = this.getAttribute('maxlength');
            charCount.textContent = currentLength + '/' + maxLength;

            // Optional: Change color when approaching limit
            if (currentLength > maxLength * 0.8) {
                charCount.classList.add('text-warning');
            } else {
                charCount.classList.remove('text-warning');
            }
        });
    }

    // Username availability check (simulated)
    const username = document.getElementById('username');
    const usernameStatus = document.querySelector('.username-status');
    const usernameFeedback = document.querySelector('.username-feedback');

    if (username && usernameStatus && usernameFeedback) {
        const takenUsernames = ['admin', 'user', 'moderator', 'test'];

        username.addEventListener('input', function () {
            const value = this.value.trim();

            if (value.length === 0) {
                username.classList.remove('is-valid', 'is-invalid');
                usernameStatus.textContent = '';
                usernameFeedback.textContent = 'Choose a username (min. 4 characters).';
                usernameFeedback.className = 'form-text username-feedback';
                return;
            }

            if (value.length < 4) {
                username.classList.add('is-invalid');
                username.classList.remove('is-valid');
                usernameStatus.textContent = '✗';
                usernameFeedback.textContent = 'Username must be at least 4 characters.';
                usernameFeedback.className = 'form-text username-feedback text-danger';
                return;
            }

            // Simulate checking if username is taken
            if (takenUsernames.includes(value.toLowerCase())) {
                username.classList.add('is-invalid');
                username.classList.remove('is-valid');
                usernameStatus.textContent = '✗';
                usernameFeedback.textContent = 'Username is already taken.';
                usernameFeedback.className = 'form-text username-feedback text-danger';
            } else {
                username.classList.add('is-valid');
                username.classList.remove('is-invalid');
                usernameStatus.textContent = '✓';
                usernameFeedback.textContent = 'Username is available!';
                usernameFeedback.className = 'form-text username-feedback text-success';
            }
        });
    }

    // Custom Validation

    // Credit Card Validation
    const creditCardInput = document.getElementById('creditCardNumber');
    const ccFeedback = document.querySelector('.credit-card-feedback');

    if (creditCardInput && ccFeedback) {
        creditCardInput.addEventListener('input', function (e) {
            // Format the credit card number as the user types
            let value = this.value.replace(/\D/g, '');
            if (value.length > 16) value = value.slice(0, 16);

            // Add spaces for readability
            let formattedValue = '';
            for (let i = 0; i < value.length; i++) {
                if (i > 0 && i % 4 === 0) {
                    formattedValue += ' ';
                }
                formattedValue += value[i];
            }

            this.value = formattedValue;

            // Validate using Luhn algorithm
            if (value.length === 16) {
                if (validateCreditCard(value)) {
                    this.classList.add('is-valid');
                    this.classList.remove('is-invalid');
                    ccFeedback.textContent = 'Valid credit card number!';
                    ccFeedback.classList.add('text-success');
                    ccFeedback.classList.remove('text-danger');
                } else {
                    this.classList.add('is-invalid');
                    this.classList.remove('is-valid');
                    ccFeedback.textContent = 'Invalid credit card number!';
                    ccFeedback.classList.add('text-danger');
                    ccFeedback.classList.remove('text-success');
                }
            } else {
                this.classList.remove('is-valid', 'is-invalid');
                ccFeedback.textContent = 'Enter a valid credit card number.';
                ccFeedback.classList.remove('text-success', 'text-danger');
            }
        });
    }

    function validateCreditCard(cardNumber) {
        // Luhn algorithm for credit card validation
        let sum = 0;
        let shouldDouble = false;

        // Loop from right to left
        for (let i = cardNumber.length - 1; i >= 0; i--) {
            let digit = parseInt(cardNumber.charAt(i));

            if (shouldDouble) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }

            sum += digit;
            shouldDouble = !shouldDouble;
        }

        return sum % 10 === 0;
    }

    // Complex Password Validation
    const customPassword = document.getElementById('customPassword');
    if (customPassword) {
        const lengthCheck = document.getElementById('length-check');
        const uppercaseCheck = document.getElementById('uppercase-check');
        const lowercaseCheck = document.getElementById('lowercase-check');
        const numberCheck = document.getElementById('number-check');
        const specialCheck = document.getElementById('special-check');

        customPassword.addEventListener('input', function () {
            const value = this.value;

            // Check each requirement
            const lengthValid = value.length >= 8 && value.length <= 20;
            const uppercaseValid = /[A-Z]/.test(value);
            const lowercaseValid = /[a-z]/.test(value);
            const numberValid = /[0-9]/.test(value);
            const specialValid = /[^A-Za-z0-9]/.test(value);

            // Update visual indicators
            updateRequirement(lengthCheck, lengthValid);
            updateRequirement(uppercaseCheck, uppercaseValid);
            updateRequirement(lowercaseCheck, lowercaseValid);
            updateRequirement(numberCheck, numberValid);
            updateRequirement(specialCheck, specialValid);

            // Overall validation
            if (lengthValid && uppercaseValid && lowercaseValid && numberValid && specialValid) {
                this.classList.add('is-valid');
                this.classList.remove('is-invalid');
            } else if (value.length > 0) {
                this.classList.add('is-invalid');
                this.classList.remove('is-valid');
            } else {
                this.classList.remove('is-valid', 'is-invalid');
            }
        });

        function updateRequirement(element, isValid) {
            const checkIcon = element.querySelector('.check-icon');

            if (isValid) {
                checkIcon.textContent = '✓';
                element.classList.add('text-success');
                element.classList.remove('text-danger', 'text-muted');
            } else {
                checkIcon.textContent = '○';
                element.classList.remove('text-success');
            }
        }
    }

    // API Validation Examples

    // Email Verification API (Simulated)
    const emailVerifyBtn = document.getElementById('emailVerifyBtn');
    if (emailVerifyBtn) {
        emailVerifyBtn.addEventListener('click', function () {
            const emailInput = document.getElementById('emailVerify');
            const feedback = document.querySelector('.email-verify-feedback');
            const email = emailInput.value.trim();

            if (!email) {
                feedback.textContent = 'Please enter an email address.';
                feedback.className = 'form-text email-verify-feedback text-danger';
                return;
            }

            // Validate email format first
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                feedback.textContent = 'Invalid email format.';
                feedback.className = 'form-text email-verify-feedback text-danger';
                emailInput.classList.add('is-invalid');
                emailInput.classList.remove('is-valid');
                return;
            }

            // Show loading state
            this.disabled = true;
            this.textContent = 'Verifying...';
            feedback.textContent = 'Checking email validity...';
            feedback.className = 'form-text email-verify-feedback';

            // Simulate API call with setTimeout
            setTimeout(() => {
                // Simulate API validation (random result for demo)
                const validDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'example.com'];
                const domain = email.split('@')[1];
                const isValid = validDomains.includes(domain);

                if (isValid) {
                    feedback.textContent = 'Email is valid and exists!';
                    feedback.className = 'form-text email-verify-feedback text-success';
                    emailInput.classList.add('is-valid');
                    emailInput.classList.remove('is-invalid');
                } else {
                    feedback.textContent = 'Email domain appears to be invalid or email does not exist.';
                    feedback.className = 'form-text email-verify-feedback text-danger';
                    emailInput.classList.add('is-invalid');
                    emailInput.classList.remove('is-valid');
                }

                // Reset button
                this.disabled = false;
                this.textContent = 'Verify';
            }, 1500);
        });
    }

    // Date Range Validation
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    const dateRangeFeedback = document.querySelector('.date-range-feedback');

    if (startDate && endDate && dateRangeFeedback) {
        function validateDateRange() {
            if (startDate.value && endDate.value) {
                const start = new Date(startDate.value);
                const end = new Date(endDate.value);

                if (end < start) {
                    endDate.classList.add('is-invalid');
                    endDate.classList.remove('is-valid');
                    dateRangeFeedback.textContent = 'End date must be after start date!';
                    dateRangeFeedback.classList.add('text-danger');
                    return false;
                } else {
                    startDate.classList.add('is-valid');
                    endDate.classList.add('is-valid');
                    startDate.classList.remove('is-invalid');
                    endDate.classList.remove('is-invalid');
                    dateRangeFeedback.textContent = 'Valid date range!';
                    dateRangeFeedback.classList.add('text-success');
                    dateRangeFeedback.classList.remove('text-danger');
                    return true;
                }
            }
            return true; // If one or both dates are not selected, don't validate
        }

        startDate.addEventListener('change', validateDateRange);
        endDate.addEventListener('change', validateDateRange);
    }
};

// Basic Editor
function initializeBasicEditor() {
    // Basic Editor Functionality
    const editorButtons = document.querySelectorAll('.editor-toolbar button[data-command]');
    const editorContent = document.querySelector('.editor-content');
    const wordCounter = document.querySelector('.word-counter');
    const htmlOutput = document.getElementById('htmlOutput');
    const copyHtmlBtn = document.getElementById('copyHtmlBtn');

    // Initialize editor
    if (editorContent) {
        // Add some default content
        editorContent.innerHTML = '<p>This is a <strong>basic text editor</strong> with essential formatting options.</p><p>Try out the toolbar buttons to format your text.</p>';

        // Execute command for each button
        editorButtons.forEach(button => {
            button.addEventListener('click', function () {
                const command = this.getAttribute('data-command');
                document.execCommand(command, false, null);
                editorContent.focus();
                updateWordCount();
                updateHtmlOutput();

                // Toggle active state for certain commands
                if (['bold', 'italic', 'underline', 'strikeThrough',
                    'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(command)) {
                    toggleActiveState(this, command);
                }
            });
        });

        // Update word count
        function updateWordCount() {
            const text = editorContent.innerText || '';
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            const chars = text.length;
            wordCounter.textContent = `${words} words, ${chars} characters`;
        }

        // Update HTML output
        function updateHtmlOutput() {
            htmlOutput.value = editorContent.innerHTML;
        }

        // Toggle active state for format buttons
        function toggleActiveState(button, command) {
            if (['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(command)) {
                // Remove active state from all alignment buttons
                document.querySelectorAll('.editor-toolbar button[data-command^="justify"]').forEach(btn => {
                    btn.classList.remove('btn-active');
                });

                // Add active state to clicked button
                button.classList.add('btn-active');
            } else {
                // Toggle active state for other format buttons
                button.classList.toggle('btn-active', document.queryCommandState(command));
            }
        }

        // Handle link insertion
        const linkButton = document.getElementById('linkButton');
        const linkModal = new bootstrap.Modal(document.getElementById('linkModal'), {});
        const insertLinkBtn = document.getElementById('insertLinkBtn');

        if (linkButton && insertLinkBtn) {
            let savedSelection = null;

            linkButton.addEventListener('click', function () {
                // Save the current selection
                savedSelection = saveSelection();

                // Get selected text for link text field
                const selectedText = getSelectedText();
                if (selectedText) {
                    document.getElementById('linkText').value = selectedText;
                } else {
                    document.getElementById('linkText').value = '';
                }

                // Clear URL field
                document.getElementById('linkUrl').value = '';

                // Show the modal
                linkModal.show();
            });

            insertLinkBtn.addEventListener('click', function () {
                const url = document.getElementById('linkUrl').value.trim();
                const text = document.getElementById('linkText').value.trim();

                if (url && text) {
                    // Restore the selection
                    restoreSelection(savedSelection);

                    // Create link
                    document.execCommand('insertHTML', false, `<a href="${url}" target="_blank">${text}</a>`);

                    // Update counters and output
                    updateWordCount();
                    updateHtmlOutput();

                    // Hide the modal
                    linkModal.hide();
                }
            });
        }

        // Helper function to save current selection
        function saveSelection() {
            if (window.getSelection) {
                const sel = window.getSelection();
                if (sel.getRangeAt && sel.rangeCount) {
                    return sel.getRangeAt(0);
                }
            }
            return null;
        }

        // Helper function to restore selection
        function restoreSelection(range) {
            if (range) {
                if (window.getSelection) {
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        }

        // Helper function to get selected text
        function getSelectedText() {
            if (window.getSelection) {
                return window.getSelection().toString();
            }
            return '';
        }

        // Copy HTML output
        if (copyHtmlBtn) {
            copyHtmlBtn.addEventListener('click', function () {
                htmlOutput.select();
                document.execCommand('copy');

                // Show feedback
                const originalText = this.innerHTML;
                this.innerHTML = '<span class="material-symbols-outlined fs-6 me-1">check</span> Copied!';

                setTimeout(() => {
                    this.innerHTML = originalText;
                }, 2000);
            });
        }

        // Handle content changes
        editorContent.addEventListener('input', function () {
            updateWordCount();
            updateHtmlOutput();

            // Update active states
            editorButtons.forEach(button => {
                const command = button.getAttribute('data-command');
                if (['bold', 'italic', 'underline', 'strikeThrough'].includes(command)) {
                    button.classList.toggle('btn-active', document.queryCommandState(command));
                }
            });
        });

        // Handle keydown events
        editorContent.addEventListener('keydown', function (e) {
            // Ctrl+B: Bold
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault();
                document.execCommand('bold', false, null);
                updateHtmlOutput();
            }

            // Ctrl+I: Italic
            if (e.ctrlKey && e.key === 'i') {
                e.preventDefault();
                document.execCommand('italic', false, null);
                updateHtmlOutput();
            }

            // Ctrl+U: Underline
            if (e.ctrlKey && e.key === 'u') {
                e.preventDefault();
                document.execCommand('underline', false, null);
                updateHtmlOutput();
            }
        });

        // Initialize
        updateWordCount();
        updateHtmlOutput();
    }

    // Customizable Editor Functionality
    const customEditorButtons = document.querySelectorAll('.custom-editor-toolbar button[data-custom-command]');
    const customEditorContent = document.querySelector('.custom-editor-content');
    const customWordCounter = document.querySelector('.custom-word-counter');
    const customHtmlOutput = document.getElementById('customHtmlOutput');
    const copyCustomHtmlBtn = document.getElementById('copyCustomHtmlBtn');

    if (customEditorContent) {
        // Add some default content
        customEditorContent.innerHTML = '<p>This is a <strong>customizable text editor</strong> with more formatting options.</p><p>Try toggling different toolbar sections using the checkboxes above.</p>';

        // Toggle toolbar sections
        document.getElementById('toggleTextStyle').addEventListener('change', function () {
            document.querySelector('.toolbar-text-style').classList.toggle('d-none', !this.checked);
        });

        document.getElementById('toggleAlignment').addEventListener('change', function () {
            document.querySelector('.toolbar-alignment').classList.toggle('d-none', !this.checked);
        });

        document.getElementById('toggleLists').addEventListener('change', function () {
            document.querySelector('.toolbar-lists').classList.toggle('d-none', !this.checked);
        });

        document.getElementById('toggleIndent').addEventListener('change', function () {
            document.querySelector('.toolbar-indent').classList.toggle('d-none', !this.checked);
        });

        document.getElementById('toggleFormatting').addEventListener('change', function () {
            document.querySelector('.toolbar-formatting').classList.toggle('d-none', !this.checked);
        });

        document.getElementById('toggleLink').addEventListener('change', function () {
            document.querySelector('.toolbar-link').classList.toggle('d-none', !this.checked);
        });

        document.getElementById('toggleColors').addEventListener('change', function () {
            document.querySelector('.toolbar-colors').classList.toggle('d-none', !this.checked);
        });

        // Execute command for each button
        customEditorButtons.forEach(button => {
            button.addEventListener('click', function () {
                const command = this.getAttribute('data-custom-command');
                document.execCommand(command, false, null);
                customEditorContent.focus();
                updateCustomWordCount();
                updateCustomHtmlOutput();

                // Toggle active state for certain commands
                if (['bold', 'italic', 'underline', 'strikeThrough',
                    'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(command)) {
                    toggleCustomActiveState(this, command);
                }
            });
        });

        // Handle text color buttons
        const textColorButtons = document.querySelectorAll('.text-color-dropdown .color-btn');
        textColorButtons.forEach(button => {
            button.addEventListener('click', function () {
                const color = this.getAttribute('data-color');
                document.execCommand('foreColor', false, color);
                customEditorContent.focus();
                updateCustomHtmlOutput();
            });
        });

        // Handle background color buttons
        const bgColorButtons = document.querySelectorAll('.background-color-dropdown .color-btn');
        bgColorButtons.forEach(button => {
            button.addEventListener('click', function () {
                const color = this.getAttribute('data-color');
                document.execCommand('hiliteColor', false, color);
                customEditorContent.focus();
                updateCustomHtmlOutput();
            });
        });

        // Update word count
        function updateCustomWordCount() {
            const text = customEditorContent.innerText || '';
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            const chars = text.length;
            customWordCounter.textContent = `${words} words, ${chars} characters`;
        }

        // Update HTML output
        function updateCustomHtmlOutput() {
            customHtmlOutput.value = customEditorContent.innerHTML;
        }

        // Toggle active state for format buttons
        function toggleCustomActiveState(button, command) {
            if (['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(command)) {
                // Remove active state from all alignment buttons
                document.querySelectorAll('.custom-editor-toolbar button[data-custom-command^="justify"]').forEach(btn => {
                    btn.classList.remove('btn-active');
                });

                // Add active state to clicked button
                button.classList.add('btn-active');
            } else {
                // Toggle active state for other format buttons
                button.classList.toggle('btn-active', document.queryCommandState(command));
            }
        }

        // Handle custom link insertion
        const customLinkButton = document.getElementById('customLinkButton');
        const customLinkModal = new bootstrap.Modal(document.getElementById('customLinkModal'), {});
        const insertCustomLinkBtn = document.getElementById('insertCustomLinkBtn');

        if (customLinkButton && insertCustomLinkBtn) {
            let savedCustomSelection = null;

            customLinkButton.addEventListener('click', function () {
                // Save the current selection
                savedCustomSelection = saveCustomSelection();

                // Get selected text for link text field
                const selectedText = getCustomSelectedText();
                if (selectedText) {
                    document.getElementById('customLinkText').value = selectedText;
                } else {
                    document.getElementById('customLinkText').value = '';
                }

                // Clear URL field and checkbox
                document.getElementById('customLinkUrl').value = '';
                document.getElementById('openInNewTab').checked = true;

                // Show the modal
                customLinkModal.show();
            });

            insertCustomLinkBtn.addEventListener('click', function () {
                const url = document.getElementById('customLinkUrl').value.trim();
                const text = document.getElementById('customLinkText').value.trim();
                const openInNewTab = document.getElementById('openInNewTab').checked;

                if (url && text) {
                    // Restore the selection
                    restoreCustomSelection(savedCustomSelection);

                    // Create link with target attribute if needed
                    const target = openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : '';
                    document.execCommand('insertHTML', false, `<a href="${url}"${target}>${text}</a>`);

                    // Update counters and output
                    updateCustomWordCount();
                    updateCustomHtmlOutput();

                    // Hide the modal
                    customLinkModal.hide();
                }
            });
        }

        // Helper function to save current selection
        function saveCustomSelection() {
            if (window.getSelection) {
                const sel = window.getSelection();
                if (sel.getRangeAt && sel.rangeCount) {
                    return sel.getRangeAt(0);
                }
            }
            return null;
        }

        // Helper function to restore selection
        function restoreCustomSelection(range) {
            if (range) {
                if (window.getSelection) {
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        }

        // Helper function to get selected text
        function getCustomSelectedText() {
            if (window.getSelection) {
                return window.getSelection().toString();
            }
            return '';
        }

        // Copy HTML output
        if (copyCustomHtmlBtn) {
            copyCustomHtmlBtn.addEventListener('click', function () {
                customHtmlOutput.select();
                document.execCommand('copy');

                // Show feedback
                const originalText = this.innerHTML;
                this.innerHTML = '<span class="material-symbols-outlined fs-6 me-1">check</span> Copied!';

                setTimeout(() => {
                    this.innerHTML = originalText;
                }, 2000);
            });
        }

        // Handle content changes
        customEditorContent.addEventListener('input', function () {
            updateCustomWordCount();
            updateCustomHtmlOutput();

            // Update active states
            customEditorButtons.forEach(button => {
                const command = button.getAttribute('data-custom-command');
                if (['bold', 'italic', 'underline', 'strikeThrough'].includes(command)) {
                    button.classList.toggle('btn-active', document.queryCommandState(command));
                }
            });
        });

        // Initialize
        updateCustomWordCount();
        updateCustomHtmlOutput();
    }
};

// Advanced Editor
function initializeAdvancedEditor() {
    // Advanced Editor Initialization
    const editorContent = document.querySelector('.advanced-editor-content');
    const editorButtons = document.querySelectorAll('[data-command]');
    const wordCounter = document.querySelector('.advanced-word-counter');

    if (editorContent) {
        // Add sample content
        editorContent.innerHTML = '<h1>Advanced Text Editor</h1><p>This is a <strong>rich text editor</strong> with advanced formatting options.</p><p>Use the toolbar above to format text, insert media, and more.</p>';

        // Basic command execution
        editorButtons.forEach(button => {
            button.addEventListener('click', function () {
                const command = this.getAttribute('data-command');
                const value = this.getAttribute('data-value') || null;
                document.execCommand(command, false, value);
                editorContent.focus();
                updateWordCount();

                // Toggle active state for certain commands
                if (['bold', 'italic', 'underline', 'strikeThrough',
                    'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(command)) {
                    toggleActiveState(this, command);
                }
            });
        });

        // Handle dropdown menu items
        document.querySelectorAll('.dropdown-item[data-command]').forEach(item => {
            item.addEventListener('click', function (e) {
                e.preventDefault();
                const command = this.getAttribute('data-command');
                const value = this.getAttribute('data-value') || null;
                document.execCommand(command, false, value);
                editorContent.focus();
                updateWordCount();
            });
        });

        // Handle format dropdown items
        document.querySelectorAll('[data-command="formatBlock"]').forEach(item => {
            item.addEventListener('click', function (e) {
                e.preventDefault();
                const blockType = this.getAttribute('data-value');
                document.execCommand('formatBlock', false, blockType);
                editorContent.focus();
            });
        });

        // Color buttons
        document.querySelectorAll('.text-color-dropdown .color-btn').forEach(button => {
            button.addEventListener('click', function () {
                const color = this.getAttribute('data-color');
                document.execCommand('foreColor', false, color);
                editorContent.focus();
            });
        });

        document.querySelectorAll('.bg-color-dropdown .color-btn').forEach(button => {
            button.addEventListener('click', function () {
                const color = this.getAttribute('data-color');
                document.execCommand('hiliteColor', false, color);
                editorContent.focus();
            });
        });

        // Update word count
        function updateWordCount() {
            const text = editorContent.innerText || '';
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            const chars = text.length;
            wordCounter.textContent = `${words} words, ${chars} characters`;
        }

        // Toggle active state for format buttons
        function toggleActiveState(button, command) {
            if (['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(command)) {
                // Remove active state from all alignment buttons
                document.querySelectorAll('[data-command^="justify"]').forEach(btn => {
                    btn.classList.remove('btn-active');
                });

                // Add active state to clicked button
                button.classList.add('btn-active');
            } else {
                // Toggle active state for other format buttons
                button.classList.toggle('btn-active', document.queryCommandState(command));
            }
        }

        // Links
        const insertLinkBtn = document.getElementById('insertLinkBtn');
        const linkModal = new bootstrap.Modal(document.getElementById('linkModal'), {});
        const insertLinkBtnConfirm = document.getElementById('insertLinkBtnConfirm');

        if (insertLinkBtn && insertLinkBtnConfirm) {
            let savedSelection = null;

            insertLinkBtn.addEventListener('click', function () {
                // Save the current selection
                savedSelection = saveSelection();

                // Get selected text for link text field
                const selectedText = getSelectedText();
                if (selectedText) {
                    document.getElementById('linkText').value = selectedText;
                } else {
                    document.getElementById('linkText').value = '';
                }

                // Clear URL and title fields
                document.getElementById('linkUrl').value = '';
                document.getElementById('linkTitle').value = '';

                // Show the modal
                linkModal.show();
            });

            insertLinkBtnConfirm.addEventListener('click', function () {
                const url = document.getElementById('linkUrl').value.trim();
                const text = document.getElementById('linkText').value.trim() || url;
                const title = document.getElementById('linkTitle').value.trim();
                const target = document.getElementById('linkTargetBlank').checked ? ' target="_blank" rel="noopener noreferrer"' : '';

                if (url) {
                    // Restore the selection
                    restoreSelection(savedSelection);

                    // Create link
                    const titleAttr = title ? ` title="${title}"` : '';
                    document.execCommand('insertHTML', false, `<a href="${url}"${titleAttr}${target}>${text}</a>`);

                    // Update word count
                    updateWordCount();

                    // Hide the modal
                    linkModal.hide();
                }
            });
        }

        // Images
        const insertImageBtn = document.getElementById('insertImageBtn');
        const imageModal = new bootstrap.Modal(document.getElementById('imageModal'), {});
        const insertImageBtnConfirm = document.getElementById('insertImageBtnConfirm');

        if (insertImageBtn && insertImageBtnConfirm) {
            insertImageBtn.addEventListener('click', function () {
                // Clear image fields
                document.getElementById('imageUrl').value = '';
                document.getElementById('imageUpload').value = '';
                document.getElementById('imageAlt').value = '';
                document.getElementById('imageWidth').value = '';
                document.getElementById('imageHeight').value = '';

                // Show the modal
                imageModal.show();
            });

            insertImageBtnConfirm.addEventListener('click', function () {
                let imageUrl = '';
                const activeTab = document.querySelector('.nav-link.active').getAttribute('id');

                if (activeTab === 'url-tab') {
                    imageUrl = document.getElementById('imageUrl').value.trim();
                } else {
                    // For demo, we'll use a placeholder image
                    // In a real implementation, this would involve file upload
                    const fileInput = document.getElementById('imageUpload');
                    if (fileInput.files.length > 0) {
                        // Use a placeholder for demo purposes
                        imageUrl = 'https://via.placeholder.com/400x300?text=Uploaded+Image';
                    }
                }

                const altText = document.getElementById('imageAlt').value.trim();
                const width = document.getElementById('imageWidth').value.trim();
                const height = document.getElementById('imageHeight').value.trim();

                if (imageUrl) {
                    // Build image tag
                    let imgHtml = `<img src="${imageUrl}" alt="${altText}"`;
                    if (width) imgHtml += ` width="${width}"`;
                    if (height) imgHtml += ` height="${height}"`;
                    imgHtml += ` style="max-width: 100%">`;

                    // Insert the image
                    document.execCommand('insertHTML', false, imgHtml);

                    // Hide the modal
                    imageModal.hide();
                }
            });
        }

        // Tables
        const insertTableBtn = document.getElementById('insertTableBtn');
        const tableModal = new bootstrap.Modal(document.getElementById('tableModal'), {});
        const insertTableBtnConfirm = document.getElementById('insertTableBtnConfirm');

        if (insertTableBtn && insertTableBtnConfirm) {
            insertTableBtn.addEventListener('click', function () {
                // Reset form values
                document.getElementById('tableRows').value = '3';
                document.getElementById('tableCols').value = '3';
                document.getElementById('tableHeader').checked = true;
                document.getElementById('tableStyle').value = 'table table-bordered table-striped';

                // Show the modal
                tableModal.show();
            });

            insertTableBtnConfirm.addEventListener('click', function () {
                const rows = parseInt(document.getElementById('tableRows').value) || 3;
                const cols = parseInt(document.getElementById('tableCols').value) || 3;
                const hasHeader = document.getElementById('tableHeader').checked;
                const tableStyle = document.getElementById('tableStyle').value;

                // Generate table HTML
                let tableHtml = `<table class="${tableStyle}" style="width: 100%;">`;

                // Add header row if selected
                if (hasHeader) {
                    tableHtml += '<thead><tr>';
                    for (let j = 0; j < cols; j++) {
                        tableHtml += `<th scope="col">Header ${j + 1}</th>`;
                    }
                    tableHtml += '</tr></thead>';
                }

                // Add body rows
                tableHtml += '<tbody>';
                for (let i = 0; i < rows; i++) {
                    tableHtml += '<tr>';
                    for (let j = 0; j < cols; j++) {
                        tableHtml += `<td>Cell ${i + 1}-${j + 1}</td>`;
                    }
                    tableHtml += '</tr>';
                }
                tableHtml += '</tbody></table>';

                // Insert the table
                document.execCommand('insertHTML', false, tableHtml);

                // Hide the modal
                tableModal.hide();
            });
        }

        // Code Blocks
        const insertCodeBtn = document.getElementById('insertCodeBtn');
        const codeBlockModal = new bootstrap.Modal(document.getElementById('codeBlockModal'), {});
        const insertCodeBlockBtnConfirm = document.getElementById('insertCodeBlockBtnConfirm');

        if (insertCodeBtn && insertCodeBlockBtnConfirm) {
            insertCodeBtn.addEventListener('click', function () {
                // Reset form values
                document.getElementById('codeLanguage').value = '';
                document.getElementById('codeContent').value = '';

                // Show the modal
                codeBlockModal.show();
            });

            insertCodeBlockBtnConfirm.addEventListener('click', function () {
                const language = document.getElementById('codeLanguage').value;
                const code = document.getElementById('codeContent').value;

                if (code) {
                    // Escape HTML entities
                    const escapedCode = code
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#039;');

                    // Generate code block HTML
                    const codeClass = language ? ` class="language-${language}"` : '';
                    const codeHtml = `<pre><code${codeClass}>${escapedCode}</code></pre>`;

                    // Insert the code block
                    document.execCommand('insertHTML', false, codeHtml);

                    // Hide the modal
                    codeBlockModal.hide();
                }
            });
        }

        // Source View
        const viewSourceBtn = document.getElementById('viewSourceBtn');
        const sourceModal = new bootstrap.Modal(document.getElementById('sourceModal'), {});
        const updateSourceBtn = document.getElementById('updateSourceBtn');

        if (viewSourceBtn && updateSourceBtn) {
            viewSourceBtn.addEventListener('click', function () {
                // Get current HTML
                const html = editorContent.innerHTML;

                // Populate source textarea
                document.getElementById('htmlSource').value = html;

                // Show the modal
                sourceModal.show();
            });

            updateSourceBtn.addEventListener('click', function () {
                // Get updated HTML
                const html = document.getElementById('htmlSource').value;

                // Update editor content
                editorContent.innerHTML = html;

                // Hide the modal
                sourceModal.hide();

                // Update word count
                updateWordCount();
            });
        }

        // Helper function to save current selection
        function saveSelection() {
            if (window.getSelection) {
                const sel = window.getSelection();
                if (sel.getRangeAt && sel.rangeCount) {
                    return sel.getRangeAt(0);
                }
            }
            return null;
        }

        // Helper function to restore selection
        function restoreSelection(range) {
            if (range) {
                if (window.getSelection) {
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        }

        // Helper function to get selected text
        function getSelectedText() {
            if (window.getSelection) {
                return window.getSelection().toString();
            }
            return '';
        }

        // Initialize horizontal rule button
        const insertHorizontalRuleBtn = document.getElementById('insertHorizontalRuleBtn');
        if (insertHorizontalRuleBtn) {
            insertHorizontalRuleBtn.addEventListener('click', function () {
                document.execCommand('insertHorizontalRule', false, null);
                editorContent.focus();
            });
        }

        // Initialize word counter
        updateWordCount();

        // Update counter on input
        editorContent.addEventListener('input', function () {
            updateWordCount();

            // Update button active states
            editorButtons.forEach(button => {
                const command = button.getAttribute('data-command');
                if (['bold', 'italic', 'underline', 'strikeThrough'].includes(command)) {
                    button.classList.toggle('btn-active', document.queryCommandState(command));
                }
            });
        });
    }

    // Real-time Preview Editor
    const previewEditor = document.getElementById('previewEditor');
    const previewOutput = document.getElementById('previewOutput');

    if (previewEditor && previewOutput) {
        // Initialize with sample content
        previewEditor.value = '<h1>Hello, World!</h1>\n<p>This is a <strong>real-time</strong> preview editor.</p>\n<p>Edit the content on the left to see it rendered on the right.</p>';
        previewOutput.innerHTML = previewEditor.value;

        // Update preview on input
        previewEditor.addEventListener('input', function () {
            previewOutput.innerHTML = this.value;
            updatePreviewWordCount();
        });

        // Format toggle buttons
        const htmlFormatBtn = document.getElementById('htmlFormatBtn');
        const markdownFormatBtn = document.getElementById('markdownFormatBtn');

        if (htmlFormatBtn && markdownFormatBtn) {
            let isMarkdown = false;

            htmlFormatBtn.addEventListener('click', function () {
                if (isMarkdown) {
                    isMarkdown = false;
                    htmlFormatBtn.classList.add('active');
                    markdownFormatBtn.classList.remove('active');
                    // Convert markdown to HTML (simplified for demo)
                    convertMarkdownToHtml();
                }
            });

            markdownFormatBtn.addEventListener('click', function () {
                if (!isMarkdown) {
                    isMarkdown = true;
                    markdownFormatBtn.classList.add('active');
                    htmlFormatBtn.classList.remove('active');
                    // Convert HTML to markdown (simplified for demo)
                    convertHtmlToMarkdown();
                }
            });

            function convertHtmlToMarkdown() {
                // This is a very simplified example
                // For production use, consider libraries like Turndown
                let html = previewEditor.value;
                let markdown = html
                    // Headers
                    .replace(/<h1>(.*?)<\/h1>/g, '# $1\n\n')
                    .replace(/<h2>(.*?)<\/h2>/g, '## $1\n\n')
                    .replace(/<h3>(.*?)<\/h3>/g, '### $1\n\n')
                    // Bold
                    .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
                    .replace(/<b>(.*?)<\/b>/g, '**$1**')
                    // Italic
                    .replace(/<em>(.*?)<\/em>/g, '*$1*')
                    .replace(/<i>(.*?)<\/i>/g, '*$1*')
                    // Links
                    .replace(/<a href="(.*?)">(.*?)<\/a>/g, '[$2]($1)')
                    // Lists
                    .replace(/<ul><li>(.*?)<\/li><\/ul>/g, '* $1\n')
                    // Paragraphs
                    .replace(/<p>(.*?)<\/p>/g, '$1\n\n');

                // Clean up extra newlines
                markdown = markdown.replace(/\n\n\n+/g, '\n\n');

                previewEditor.value = markdown;
                previewOutput.innerHTML = parseMarkdown(markdown);
            }

            function convertMarkdownToHtml() {
                previewOutput.innerHTML = parseMarkdown(previewEditor.value);
                previewEditor.value = previewOutput.innerHTML;
            }

            function parseMarkdown(markdown) {
                // This is a very simplified markdown parser for demonstration
                // For production use, consider libraries like Marked.js
                return markdown
                    // Headers
                    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                    // Bold
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    // Italic
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    // Links
                    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
                    // Unordered lists
                    .replace(/^\* (.*$)/gm, '<ul><li>$1</li></ul>')
                    // Paragraphs
                    .replace(/^(?!<h|<ul|<li)(.+)$/gm, '<p>$1</p>');
            }
        }

        // Toggle preview
        const previewToggleBtn = document.getElementById('previewToggleBtn');
        const editorCol = document.querySelector('.preview-editor-col');
        const previewCol = document.querySelector('.preview-preview-col');

        if (previewToggleBtn && editorCol && previewCol) {
            let previewVisible = true;

            previewToggleBtn.addEventListener('click', function () {
                previewVisible = !previewVisible;
                if (previewVisible) {
                    previewCol.classList.remove('d-none');
                    editorCol.classList.remove('col-md-12');
                    editorCol.classList.add('col-md-6');
                    this.innerHTML = '<span class="material-symbols-outlined fs-6 me-1">visibility</span> Hide Preview';
                } else {
                    previewCol.classList.add('d-none');
                    editorCol.classList.remove('col-md-6');
                    editorCol.classList.add('col-md-12');
                    this.innerHTML = '<span class="material-symbols-outlined fs-6 me-1">visibility</span> Show Preview';
                }
            });
        }

        // Word counter for preview editor
        const previewWordCounter = document.querySelector('.preview-editor-word-counter');

        function updatePreviewWordCount() {
            if (previewWordCounter) {
                const text = previewEditor.value.replace(/<[^>]*>/g, ''); // Strip HTML tags
                const words = text.trim() ? text.trim().split(/\s+/).length : 0;
                const chars = previewEditor.value.length;
                previewWordCounter.textContent = `${words} words, ${chars} characters`;
            }
        }

        // Initialize preview word counter
        updatePreviewWordCount();
    }

    // Collaborative Editor Simulation
    const collaborativeEditor = document.querySelector('.collaborative-editor-content');
    const collaborativeButtons = document.querySelectorAll('[data-collab-command]');

    if (collaborativeEditor && collaborativeButtons.length > 0) {
        // Simulated users
        const users = [
            { name: 'Anna Smith', initials: 'AS', color: 'success' },
            { name: 'John Doe', initials: 'JD', color: 'danger' },
            { name: 'Maria Garcia', initials: 'MG', color: 'info' }
        ];

        // Activity log
        const activityLog = document.querySelector('.activity-log');

        // Add sample content
        collaborativeEditor.innerHTML = '<p>This is a <strong>collaborative</strong> editor demonstration.</p><p>Multiple users can edit the document simultaneously.</p>';

        // Initialize buttons
        collaborativeButtons.forEach(button => {
            button.addEventListener('click', function () {
                const command = this.getAttribute('data-collab-command');
                document.execCommand(command, false, null);
                collaborativeEditor.focus();

                // Log the action
                logActivity('You', 'primary', `applied ${command} formatting`);
            });
        });

        // Simulate collaborative activities
        function simulateCollaboration() {
            const actions = [
                'edited the document',
                'added new content',
                'removed some text',
                'applied formatting',
                'suggested a change'
            ];

            // Randomly select a user and action
            const user = users[Math.floor(Math.random() * users.length)];
            const action = actions[Math.floor(Math.random() * actions.length)];

            // Log the activity
            logActivity(user.name, user.color, action);

            // Schedule next activity
            setTimeout(simulateCollaboration, Math.random() * 10000 + 5000);
        }

        // Helper function to log activities
        function logActivity(username, color, action) {
            if (activityLog) {
                const activityItem = document.createElement('div');
                activityItem.className = 'activity-item';
                activityItem.innerHTML = `<small><span class="text-${color}">${username}</span> ${action}</small>`;

                activityLog.appendChild(activityItem);
                activityLog.scrollTop = activityLog.scrollHeight;
            }
        }

        // Start simulation
        setTimeout(simulateCollaboration, 3000);

        // Handle user edits
        collaborativeEditor.addEventListener('input', function () {
            // Log the action
            logActivity('You', 'primary', 'edited the document');
        });
    }

    // Content Templates
    const templateBtns = document.querySelectorAll('.template-btn');
    const templatePreview = document.getElementById('templatePreview');
    const templateEditor = document.getElementById('templateEditor');
    const insertTemplateBtn = document.getElementById('insertTemplateBtn');

    if (templateBtns.length > 0 && templatePreview && templateEditor && insertTemplateBtn) {
        // Template content
        const templates = {
            blog: `<h1>Blog Post Title</h1>
<p class="lead">A brief introduction to your topic. Explain what readers will learn or gain from reading this post.</p>
<h2>First Section Heading</h2>
<p>Main content paragraphs go here. Explain your first main point with supporting details.</p>
<h2>Second Section Heading</h2>
<p>Continue with additional main points and supporting content.</p>
<h2>Conclusion</h2>
<p>Summarize the key takeaways and possibly include a call to action.</p>`,

            product: `<h1>Product Name</h1>
<p class="lead">Brief product description highlighting its main benefit.</p>
<h2>Key Features</h2>
<ul>
    <li><strong>Feature 1:</strong> Description of the feature and its benefit.</li>
    <li><strong>Feature 2:</strong> Description of the feature and its benefit.</li>
    <li><strong>Feature 3:</strong> Description of the feature and its benefit.</li>
</ul>
<h2>Technical Specifications</h2>
<p>Include detailed specifications here.</p>
<h2>Call to Action</h2>
<p>Encourage the customer to make a purchase or learn more.</p>`,

            faq: `<h1>Frequently Asked Questions</h1>
<div class="faq-item">
    <h3>Question 1?</h3>
    <p>Detailed answer to the first question. Provide clear and concise information.</p>
</div>
<div class="faq-item">
    <h3>Question 2?</h3>
    <p>Detailed answer to the second question. Provide clear and concise information.</p>
</div>
<div class="faq-item">
    <h3>Question 3?</h3>
    <p>Detailed answer to the third question. Provide clear and concise information.</p>
</div>`,

            bio: `<div class="team-member">
    <h2>Full Name</h2>
    <p class="position">Job Title / Position</p>
    <p class="intro">A brief introduction to the team member, highlighting their expertise and background.</p>
    <h3>Professional Background</h3>
    <p>Details about their professional experience, achievements, and specializations.</p>
    <h3>Education</h3>
    <p>Information about their educational background and relevant qualifications.</p>
    <h3>Skills</h3>
    <ul>
        <li>Skill 1</li>
        <li>Skill 2</li>
        <li>Skill 3</li>
    </ul>
</div>`
        };

        // Handle template selection
        templateBtns.forEach(btn => {
            btn.addEventListener('click', function () {
                const templateType = this.getAttribute('data-template');
                const templateContent = templates[templateType];

                // Update preview
                templatePreview.innerHTML = templateContent;

                // Update editor
                templateEditor.innerHTML = templateContent;

                // Enable insert button
                insertTemplateBtn.disabled = false;
            });
        });

        // Handle template insertion into main editor
        insertTemplateBtn.addEventListener('click', function () {
            // Get the edited template
            const editedTemplate = templateEditor.innerHTML;

            // Insert in main editor if it exists
            if (editorContent) {
                // Insert at cursor position or append to end
                insertAtCursor(editorContent, editedTemplate);

                // Focus back on main editor
                editorContent.focus();
            }
        });

        // Helper function to insert content at cursor position
        function insertAtCursor(element, html) {
            let selection, range;

            if (window.getSelection) {
                selection = window.getSelection();
                if (selection.getRangeAt && selection.rangeCount) {
                    range = selection.getRangeAt(0);

                    // Check if selection is inside the element
                    if (element.contains(range.commonAncestorContainer)) {
                        range.deleteContents();

                        // Create a div with the HTML content
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = html;

                        // Insert each node from the div
                        const fragment = document.createDocumentFragment();
                        let node, lastNode;
                        while ((node = tempDiv.firstChild)) {
                            lastNode = fragment.appendChild(node);
                        }

                        range.insertNode(fragment);

                        // Move caret to the end
                        if (lastNode) {
                            range = range.cloneRange();
                            range.setStartAfter(lastNode);
                            range.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }

                        return;
                    }
                }
            }

            // If selection is not in editor or something went wrong, append to end
            element.innerHTML += html;
        }
    }
};

// Time Picker JavaScript
function initializeTimePicker() {
    // Basic time pickers
    if (typeof flatpickr !== 'undefined') {
        // Basic time picker (12hr format)
        flatpickr('.flatpickr-time-basic', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K", // 12-hour format with AM/PM
            time_24hr: false
        });

        // 24-hour format time picker
        flatpickr('.flatpickr-time-24hr', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "H:i", // 24-hour format
            time_24hr: true
        });

        // Time picker with seconds
        flatpickr('.flatpickr-time-seconds', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i:S K", // With seconds
            time_24hr: false,
            enableSeconds: true
        });

        // Time range picker
        flatpickr('.flatpickr-time-range', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            mode: "range",
            time_24hr: false
        });

        // Time picker with icon
        flatpickr('.flatpickr-time-icon', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            time_24hr: false
        });

        // Time picker with clear button
        const timeWithClearPicker = flatpickr('.flatpickr-time-clear', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            time_24hr: false
        });

        // Clear button functionality
        document.querySelectorAll('.input-clear').forEach(btn => {
            btn.addEventListener('click', function () {
                const inputElement = this.closest('.input-group').querySelector('input');
                const flatpickrInstance = inputElement._flatpickr;
                if (flatpickrInstance) {
                    flatpickrInstance.clear();
                } else {
                    inputElement.value = '';
                }
                inputElement.focus();
            });
        });

        // Time picker with presets
        flatpickr('.flatpickr-time-presets', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            time_24hr: false
        });

        // Preset dropdown functionality
        document.querySelectorAll('.time-preset').forEach(preset => {
            preset.addEventListener('click', function (e) {
                e.preventDefault();
                const timeValue = this.getAttribute('data-value');
                const inputElement = this.closest('.input-group').querySelector('input');
                const flatpickrInstance = inputElement._flatpickr;

                if (flatpickrInstance) {
                    // Parse the time value (format: HH:MM)
                    const [hours, minutes] = timeValue.split(':').map(Number);

                    // Create a date object with the current date but custom time
                    const date = new Date();
                    date.setHours(hours, minutes, 0, 0);

                    // Set the time in flatpickr
                    flatpickrInstance.setDate(date);
                }
            });
        });

        // Time picker with increment/decrement buttons
        const timeIncrementPicker = flatpickr('.flatpickr-time-increment', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            time_24hr: false,
            minuteIncrement: 15
        });

        // Increment/decrement functionality
        document.querySelectorAll('.time-increment').forEach(btn => {
            btn.addEventListener('click', function () {
                const inputElement = this.closest('.input-group').querySelector('input');
                const flatpickrInstance = inputElement._flatpickr;

                if (flatpickrInstance && flatpickrInstance.selectedDates.length > 0) {
                    const currentDate = flatpickrInstance.selectedDates[0];
                    // Add 15 minutes
                    currentDate.setMinutes(currentDate.getMinutes() + 15);
                    flatpickrInstance.setDate(currentDate);
                } else {
                    // If no date is selected, start from current time
                    const now = new Date();
                    flatpickrInstance.setDate(now);
                }
            });
        });

        document.querySelectorAll('.time-decrement').forEach(btn => {
            btn.addEventListener('click', function () {
                const inputElement = this.closest('.input-group').querySelector('input');
                const flatpickrInstance = inputElement._flatpickr;

                if (flatpickrInstance && flatpickrInstance.selectedDates.length > 0) {
                    const currentDate = flatpickrInstance.selectedDates[0];
                    // Subtract 15 minutes
                    currentDate.setMinutes(currentDate.getMinutes() - 15);
                    flatpickrInstance.setDate(currentDate);
                } else {
                    // If no date is selected, start from current time
                    const now = new Date();
                    flatpickrInstance.setDate(now);
                }
            });
        });

        // Themed time picker
        flatpickr('.flatpickr-time-themed', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            time_24hr: false
        });

        // Limited time picker (business hours)
        flatpickr('.flatpickr-time-limited', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            time_24hr: false,
            minTime: "09:00",
            maxTime: "17:00"
        });

        // Time picker with intervals
        flatpickr('.flatpickr-time-interval', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            time_24hr: false,
            minuteIncrement: 30 // 30-minute intervals
        });

        // Custom format time picker
        const customFormatPicker = flatpickr('.flatpickr-time-format', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            time_24hr: false,
            onClose: function (selectedDates, dateStr, instance) {
                if (selectedDates.length > 0) {
                    const date = selectedDates[0];
                    const hours = date.getHours();
                    const minutes = date.getMinutes();
                    const period = hours >= 12 ? 'PM' : 'AM';
                    const displayHours = hours % 12 || 12;

                    const formattedStr = `${displayHours} hour${displayHours !== 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''} ${period}`;
                    instance.element.value = formattedStr;
                }
            }
        });

        // Appointment time picker
        flatpickr('.flatpickr-appointment-time', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            minTime: "09:00",
            maxTime: "17:00",
            minuteIncrement: 30,
            time_24hr: false
        });

        // Work schedule time pickers
        flatpickr('.flatpickr-work-start', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            defaultDate: "09:00",
            time_24hr: false
        });

        flatpickr('.flatpickr-work-end', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            defaultDate: "17:00",
            time_24hr: false
        });

        flatpickr('.flatpickr-break-start', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            defaultDate: "12:00",
            time_24hr: false
        });

        flatpickr('.flatpickr-break-end', {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            defaultDate: "13:00",
            time_24hr: false
        });
    } else {
        console.warn("Flatpickr library is not loaded. Time pickers will not function properly.");

        // Add warning for users
        const timePickerCards = document.querySelectorAll('.card:has(flatpickr-time)');
        timePickerCards.forEach(card => {
            const warning = document.createElement('div');
            warning.className = 'alert alert-warning mt-3';
            warning.innerHTML = '<strong>Note:</strong> Flatpickr library is not loaded. Time pickers require the Flatpickr library to function properly.';
            card.querySelector('.card-body').appendChild(warning);
        });
    }

    // Custom visual time blocks implementation
    if (document.querySelector('.visual-time-blocks')) {
        const timeBlocksContainer = document.querySelector('.visual-time-blocks');
        const timeBlocksInput = document.querySelector('#visualTimeBlocksInput');

        // Generate time blocks from 8:00 AM to 8:00 PM in 30-minute intervals
        const generateTimeBlocks = () => {
            timeBlocksContainer.innerHTML = '';

            // Create a date object for today
            const date = new Date();
            date.setHours(8, 0, 0, 0); // Start at 8:00 AM

            // End time is 8:00 PM (20:00)
            const endTime = new Date(date);
            endTime.setHours(20, 0, 0, 0);

            // Sample unavailable times (for demonstration)
            const unavailableTimes = ['10:00', '10:30', '12:30', '13:00', '17:00'];

            // Generate time blocks in 30-minute intervals
            while (date < endTime) {
                const hours = date.getHours();
                const minutes = date.getMinutes();

                // Format time as HH:MM
                const timeValue = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

                // Format display time in 12-hour format
                const displayHours = hours % 12 || 12;
                const period = hours >= 12 ? 'PM' : 'AM';
                const displayTime = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;

                // Create time block element
                const timeBlock = document.createElement('div');
                timeBlock.className = 'time-block';
                timeBlock.textContent = displayTime;
                timeBlock.setAttribute('data-value', timeValue);

                // Check if this time is unavailable
                if (unavailableTimes.includes(timeValue)) {
                    timeBlock.classList.add('disabled');
                } else {
                    // Add click event for available time blocks
                    timeBlock.addEventListener('click', function () {
                        // Remove selected class from all blocks
                        document.querySelectorAll('.time-block').forEach(block => {
                            block.classList.remove('selected');
                        });

                        // Add selected class to clicked block
                        this.classList.add('selected');

                        // Update hidden input value
                        if (timeBlocksInput) {
                            timeBlocksInput.value = this.getAttribute('data-value');
                        }
                    });
                }

                timeBlocksContainer.appendChild(timeBlock);

                // Increment by 30 minutes
                date.setMinutes(date.getMinutes() + 30);
            }
        };

        // Initialize time blocks
        generateTimeBlocks();
    }

    // Slider time picker implementation
    if (document.querySelector('.slider-time-picker')) {
        const timeSlider = document.querySelector('.time-slider');
        const timeDisplay = document.querySelector('.time-display');

        if (timeSlider && timeDisplay) {
            // Convert slider value (0-144) to time string (00:00 - 24:00 in 10-min increments)
            const sliderValueToTime = (value) => {
                // Each step is 10 minutes (144 steps in 24 hours)
                const totalMinutes = value * 10;
                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;

                // Format hours and minutes
                const formattedHours = hours.toString().padStart(2, '0');
                const formattedMinutes = minutes.toString().padStart(2, '0');

                // Determine period (AM/PM)
                const period = hours >= 12 ? 'PM' : 'AM';
                const displayHours = hours % 12 || 12;

                return `${displayHours}:${formattedMinutes} ${period}`;
            };

            // Update displayed time when slider value changes
            timeSlider.addEventListener('input', function () {
                const timeString = sliderValueToTime(this.value);
                timeDisplay.textContent = timeString;
            });

            // Initialize with default value
            timeDisplay.textContent = sliderValueToTime(timeSlider.value);
        }
    }
};

// Calculate duration between two times
function calculateTimeDuration(startTimeStr, endTimeStr) {
    // Parse time strings (expected format: HH:MM or H:MM)
    const parseTimeStr = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return { hours, minutes };
    };

    const startTime = parseTimeStr(startTimeStr);
    const endTime = parseTimeStr(endTimeStr);

    // Convert to minutes since midnight
    const startMinutes = startTime.hours * 60 + startTime.minutes;
    let endMinutes = endTime.hours * 60 + endTime.minutes;

    // Handle times spanning midnight
    if (endMinutes < startMinutes) {
        endMinutes += 24 * 60; // Add 24 hours worth of minutes
    }

    // Calculate duration in minutes
    const durationMinutes = endMinutes - startMinutes;

    // Convert back to hours and minutes
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    return { hours, minutes };
}

// Format duration as readable string
function formatDuration(duration) {
    if (duration.hours === 0 && duration.minutes === 0) return "0 minutes";

    const parts = [];
    if (duration.hours > 0) {
        parts.push(`${duration.hours} hour${duration.hours !== 1 ? 's' : ''}`);
    }
    if (duration.minutes > 0) {
        parts.push(`${duration.minutes} minute${duration.minutes !== 1 ? 's' : ''}`);
    }

    return parts.join(' and ');
}

// Color Picker
function initializeColorPicker() {
    // Basic Color Picker
    if (document.getElementById('basicColorPicker')) {
        document.getElementById('basicColorPicker').addEventListener('input', function () {
            document.getElementById('basicColorValue').value = this.value;
        });
    }

    // Color Picker with Presets
    if (document.getElementById('presetColorPicker')) {
        // Update color value when color picker changes
        document.getElementById('presetColorPicker').addEventListener('input', function () {
            document.getElementById('presetColorValue').value = this.value;
            updateSelectedPreset(this.value);
        });

        // Update color picker when text input changes
        document.getElementById('presetColorValue').addEventListener('change', function () {
            document.getElementById('presetColorPicker').value = this.value;
            updateSelectedPreset(this.value);
        });

        // Handle preset color clicks
        document.querySelectorAll('.preset-color').forEach(button => {
            button.addEventListener('click', function () {
                const color = this.getAttribute('data-color');
                document.getElementById('presetColorPicker').value = color;
                document.getElementById('presetColorValue').value = color;
                updateSelectedPreset(color);
            });
        });

        // Update which preset is selected
        function updateSelectedPreset(color) {
            document.querySelectorAll('.preset-color').forEach(button => {
                button.classList.remove('selected');
                if (button.getAttribute('data-color').toLowerCase() === color.toLowerCase()) {
                    button.classList.add('selected');
                }
            });
        }
    }

    // RGB Color Picker
    if (document.getElementById('rgbPreview')) {
        // Get all slider elements
        const redSlider = document.getElementById('redSlider');
        const greenSlider = document.getElementById('greenSlider');
        const blueSlider = document.getElementById('blueSlider');

        // Get all value display elements
        const redValue = document.getElementById('redValue');
        const greenValue = document.getElementById('greenValue');
        const blueValue = document.getElementById('blueValue');

        // Get preview and code elements
        const rgbPreview = document.getElementById('rgbPreview');
        const rgbColorCode = document.getElementById('rgbColorCode');
        const hexColorCode = document.getElementById('hexColorCode');

        // Function to update color preview and values
        function updateColorPreview() {
            const r = redSlider.value;
            const g = greenSlider.value;
            const b = blueSlider.value;

            // Update value displays
            redValue.textContent = r;
            greenValue.textContent = g;
            blueValue.textContent = b;

            // Update preview background
            const rgbColor = `rgb(${r}, ${g}, ${b})`;
            rgbPreview.style.backgroundColor = rgbColor;
            rgbColorCode.value = rgbColor;

            // Convert to hex and update hex code
            const hexColor = rgbToHex(parseInt(r), parseInt(g), parseInt(b));
            hexColorCode.value = hexColor;
        }

        // Helper function to convert RGB to Hex
        function rgbToHex(r, g, b) {
            return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }

        // Add event listeners to sliders
        if (redSlider && greenSlider && blueSlider) {
            redSlider.addEventListener('input', updateColorPreview);
            greenSlider.addEventListener('input', updateColorPreview);
            blueSlider.addEventListener('input', updateColorPreview);

            // Initialize on page load
            updateColorPreview();
        }
    }

    // RGBA Color Picker
    if (document.getElementById('rgbaPreview')) {
        // Get all slider elements
        const redAlphaSlider = document.getElementById('redAlphaSlider');
        const greenAlphaSlider = document.getElementById('greenAlphaSlider');
        const blueAlphaSlider = document.getElementById('blueAlphaSlider');
        const alphaSlider = document.getElementById('alphaSlider');

        // Get all value display elements
        const redAlphaValue = document.getElementById('redAlphaValue');
        const greenAlphaValue = document.getElementById('greenAlphaValue');
        const blueAlphaValue = document.getElementById('blueAlphaValue');
        const alphaValue = document.getElementById('alphaValue');

        // Get preview and code elements
        const rgbaPreview = document.getElementById('rgbaPreview');
        const rgbaColorCode = document.getElementById('rgbaColorCode');

        // Function to update color preview and values
        function updateRGBAColorPreview() {
            const r = redAlphaSlider.value;
            const g = greenAlphaSlider.value;
            const b = blueAlphaSlider.value;
            const a = (alphaSlider.value / 100).toFixed(2);

            // Update value displays
            redAlphaValue.textContent = r;
            greenAlphaValue.textContent = g;
            blueAlphaValue.textContent = b;
            alphaValue.textContent = a;

            // Update preview background
            const rgbaColor = `rgba(${r}, ${g}, ${b}, ${a})`;
            rgbaPreview.style.backgroundColor = rgbaColor;
            rgbaColorCode.value = rgbaColor;
        }

        // Add event listeners to sliders if they exist
        if (redAlphaSlider && greenAlphaSlider && blueAlphaSlider && alphaSlider) {
            redAlphaSlider.addEventListener('input', updateRGBAColorPreview);
            greenAlphaSlider.addEventListener('input', updateRGBAColorPreview);
            blueAlphaSlider.addEventListener('input', updateRGBAColorPreview);
            alphaSlider.addEventListener('input', updateRGBAColorPreview);

            // Initialize on page load
            updateRGBAColorPreview();
        }
    }

    // Color Swatches
    if (document.querySelector('.color-swatch')) {
        // Get all color swatches
        const colorSwatches = document.querySelectorAll('.color-swatch');

        // Get preview and value elements
        const selectedColorPreview = document.getElementById('selectedColorPreview');
        const selectedColorValue = document.getElementById('selectedColorValue');
        const copyColorBtn = document.getElementById('copyColorBtn');

        // Function to select a color
        function selectColor(swatch) {
            // Remove selected class from all swatches
            colorSwatches.forEach(s => s.classList.remove('selected'));

            // Add selected class to clicked swatch
            swatch.classList.add('selected');

            // Get selected color
            const color = swatch.getAttribute('data-color');

            // Update preview and value
            if (selectedColorPreview && selectedColorValue) {
                selectedColorPreview.style.backgroundColor = color;
                selectedColorValue.value = color;
            }
        }

        // Add click event listener to each swatch
        colorSwatches.forEach(swatch => {
            swatch.addEventListener('click', function () {
                selectColor(this);
            });
        });

        // Copy color value to clipboard
        if (copyColorBtn && selectedColorValue) {
            copyColorBtn.addEventListener('click', function () {
                selectedColorValue.select();
                document.execCommand('copy');

                // Show feedback
                const originalText = this.innerHTML;
                this.innerHTML = '<span class="material-symbols-outlined">check</span>';

                setTimeout(() => {
                    this.innerHTML = originalText;
                }, 1500);
            });
        }
    }

    // Eye Dropper Color Picker
    if (document.getElementById('eyeDropperBtn')) {
        const eyeDropperBtn = document.getElementById('eyeDropperBtn');
        const eyeDropperPreview = document.getElementById('eyeDropperPreview');
        const eyeDropperValue = document.getElementById('eyeDropperValue');
        const eyeDropperNotSupported = document.getElementById('eyeDropperNotSupported');

        // Check if EyeDropper API is supported
        if (window.EyeDropper) {
            const eyeDropper = new EyeDropper();

            eyeDropperBtn.addEventListener('click', function () {
                eyeDropper.open()
                    .then(result => {
                        // Update preview and value with selected color
                        eyeDropperPreview.style.backgroundColor = result.sRGBHex;
                        eyeDropperValue.value = result.sRGBHex;
                    })
                    .catch(error => {
                        console.error('Eye dropper error:', error);
                    });
            });

            // Update color when input value changes
            eyeDropperValue.addEventListener('change', function () {
                eyeDropperPreview.style.backgroundColor = this.value;
            });
        } else {
            // EyeDropper API not supported
            eyeDropperBtn.disabled = true;
            if (eyeDropperNotSupported) {
                eyeDropperNotSupported.style.display = 'block';
            }
        }
    }

    // Initialize tooltips if Bootstrap is available
    if (typeof bootstrap !== 'undefined' && typeof bootstrap.Tooltip !== 'undefined') {
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }
};

// Alert
function initializeAlert() {
    // Animated Alerts
    const alertContainer = document.getElementById('animatedAlertContainer');

    if (alertContainer) {
        // Success Alert
        document.getElementById('showSuccessAlert').addEventListener('click', function () {
            showAnimatedAlert('success', 'Success!', 'Your action was completed successfully.');
        });

        // Error Alert
        document.getElementById('showErrorAlert').addEventListener('click', function () {
            showAnimatedAlert('danger', 'Error!', 'There was a problem with your request.');
        });

        // Warning Alert
        document.getElementById('showWarningAlert').addEventListener('click', function () {
            showAnimatedAlert('warning', 'Warning!', 'Please be careful with this action.');
        });

        function showAnimatedAlert(type, title, message) {
            // Create alert element
            const alert = document.createElement('div');
            alert.className = `alert alert-${type} alert-dismissible fade show animated-alert`;
            alert.setAttribute('role', 'alert');

            // Add content
            alert.innerHTML = `
                <strong>${title}</strong> ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            `;

            // Add to container
            alertContainer.prepend(alert);

            // Remove after animation completes
            setTimeout(() => {
                alert.remove();
            }, 5000);
        }
    }

    // Toast Notifications
    if (document.querySelector('.toast')) {
        // Initialize all toasts
        var toastElList = [].slice.call(document.querySelectorAll('.toast'));
        var toastList = toastElList.map(function (toastEl) {
            return new bootstrap.Toast(toastEl, {
                autohide: true,
                delay: 5000
            });
        });

        // Show info toast
        document.getElementById('showInfoToast')?.addEventListener('click', function () {
            var toast = bootstrap.Toast.getInstance(document.getElementById('infoToast'));
            toast.show();
        });

        // Show success toast
        document.getElementById('showSuccessToast')?.addEventListener('click', function () {
            var toast = bootstrap.Toast.getInstance(document.getElementById('successToast'));
            toast.show();
        });

        // Show error toast
        document.getElementById('showErrorToast')?.addEventListener('click', function () {
            var toast = bootstrap.Toast.getInstance(document.getElementById('errorToast'));
            toast.show();
        });
    }
};

// Badge
function initializeBadge() {
    // Dismissible badges
    document.querySelectorAll('.badge-close-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const badge = this.closest('.dismiss-badge');
            if (badge) {
                badge.style.display = 'none';
            }
        });
    });

    // Badge counter controls
    document.querySelectorAll('.badge-counter-decrease').forEach(btn => {
        btn.addEventListener('click', function () {
            const valueEl = this.parentElement.querySelector('.badge-counter-value');
            let value = parseInt(valueEl.textContent);
            if (value > 0) {
                valueEl.textContent = value - 1;
            }
        });
    });

    document.querySelectorAll('.badge-counter-increase').forEach(btn => {
        btn.addEventListener('click', function () {
            const valueEl = this.parentElement.querySelector('.badge-counter-value');
            let value = parseInt(valueEl.textContent);
            valueEl.textContent = value + 1;
        });
    });
};