'use strict';
document.addEventListener('DOMContentLoaded', () => {
    const search = document.getElementById('nav-filter');
    if (!search) return;
    const filter = (event) => {
        if (event && event.key === 'Escape') search.value = '';
        const value = search.value.toLocaleLowerCase().trim();
        document.querySelectorAll('.console-nav-section').forEach(section => {
            let matches = 0;
            section.querySelectorAll('.console-model-link').forEach(link => {
                link.hidden = !link.textContent.toLocaleLowerCase().includes(value);
                if (!link.hidden) matches++;
            });
            section.hidden = matches === 0;
        });
        search.classList.remove('no-results');
    };
    ['input', 'change', 'keyup'].forEach(event => search.addEventListener(event, filter));
    filter();
});
